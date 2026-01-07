import crypto from "crypto";
import { getDbForUser } from "../services/mongo.js";

export const CHECKOUT_TTL_MS = 30 * 60 * 1000; // 30 minutes

const DEFAULT_GOAL = {
  target: 100,
  current: 0,
  textTemplate: "Meta: {current} / {target}",
  textPosition: "inside",
  barBgColor: "#0f172a",
  barFillColor: "#22d3ee",
  textColor: "#e5e7eb",
  showCurrencySymbol: true
};

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function safeColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

export function normalizeOverlayGoal(goal) {
  const textPos = goal?.textPosition === "above" ? "above" : "inside";

  return {
    target: safeNumber(goal?.target, DEFAULT_GOAL.target),
    current: safeNumber(goal?.current, DEFAULT_GOAL.current),
    textTemplate: typeof goal?.textTemplate === "string" && goal.textTemplate.trim()
      ? goal.textTemplate.trim()
      : DEFAULT_GOAL.textTemplate,
    textPosition: textPos,
    barBgColor: safeColor(goal?.barBgColor, DEFAULT_GOAL.barBgColor),
    barFillColor: safeColor(goal?.barFillColor, DEFAULT_GOAL.barFillColor),
    textColor: safeColor(goal?.textColor, DEFAULT_GOAL.textColor),
    showCurrencySymbol: goal?.showCurrencySymbol === false ? false : true
  };
}

function safeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function pruneExpiredCheckouts(db, buyers, now = new Date()) {
  const source = Array.isArray(buyers)
    ? buyers
    : await db.collection("current_buyers").find().toArray();

  const cutoff = new Date(now.getTime() - CHECKOUT_TTL_MS);
  const expiredOrderNsus = [];
  const freshBuyers = [];

  for (const buyer of source) {

    const createdAt = safeDate(buyer?.created_at);
    const expiresAt = safeDate(buyer?.expires_at);
    const isExpired = (expiresAt && expiresAt <= now) || (createdAt && createdAt <= cutoff);

    if (isExpired) {
      if (buyer?.order_nsu) expiredOrderNsus.push(buyer.order_nsu);
      continue;
    }

    freshBuyers.push(buyer);
    
  }

  if (expiredOrderNsus.length) {
    await db.collection("current_buyers").deleteMany({ order_nsu: { $in: expiredOrderNsus } });
  }

  return freshBuyers;
}

function produtosArrayToObject(produtosDocs) {
  const out = {};
  for (const doc of produtosDocs) {
    const { key, ...rest } = doc;
    if (key) out[key] = rest;
  }
  return out;
}

export async function readConfig(rootDir, user) {
  const db = await getDbForUser(user);
  const [configDoc, rconDoc, produtosDocs, buyers] = await Promise.all([
    db.collection("config").findOne({ _id: "config" }),
    db.collection("rcon").findOne({ _id: "rcon" }),
    db.collection("produtos").find().toArray(),
    db.collection("current_buyers").find().toArray()
  ]);

  if (!configDoc) return null;

  const buyersPruned = await pruneExpiredCheckouts(db, buyers);

  const { _id: _ignore, ...configClean } = configDoc;
  const overlayGoal = normalizeOverlayGoal(configClean?.overlayGoal);
  const home = configClean?.home || {};

  return {
    ...configClean,
    overlayGoal,
    home,
    rcon: {
      host: rconDoc?.host || "",
      port: rconDoc?.port || "",
      password: rconDoc?.password || ""
    },
    produtos: produtosArrayToObject(produtosDocs),
    current_buyers: buyersPruned
  };
}

export async function writeConfig(rootDir, user, updater) {
  const current = await readConfig(rootDir, user);
  if (!current) return false;
  const next = typeof updater === "function" ? updater(current) : current;
  const db = await getDbForUser(user);

  const produtosEntries = Object.entries(next.produtos || {});
  await Promise.all([
    db.collection("config").updateOne(
      { _id: "config" },
      {
        $set: {
          apiKey: next.apiKey || "",
          infinitypayHandle: next.infinitypayHandle || "",
          webhookSecret: next.webhookSecret || "",
          overlayMessage: next.overlayMessage || "",
          sound: next.sound || null,
          ttsVoice: next.ttsVoice || "",
          overlayGoal: normalizeOverlayGoal(next.overlayGoal),
          home: next.home || {}
        }
      },
      { upsert: true }
    ),
    db.collection("rcon").updateOne(
      { _id: "rcon" },
      {
        $set: {
          host: next.rcon?.host || "",
          port: next.rcon?.port || "",
          password: next.rcon?.password || ""
        }
      },
      { upsert: true }
    ),
    (async () => {
      const produtosCol = db.collection("produtos");
      await produtosCol.deleteMany({});
      if (produtosEntries.length) {
        await produtosCol.insertMany(
          produtosEntries.map(([key, value]) => ({ key, ...value }))
        );
      }
    })()
  ]);

  return true;
}

export function generateOrderNsu(len = 8) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export async function upsertBuyer(rootDir, user, buyer) {
  const db = await getDbForUser(user);

  const now = new Date();
  const createdAt = safeDate(buyer?.created_at) || now;
  const expiresAt = safeDate(buyer?.expires_at) || new Date(createdAt.getTime() + CHECKOUT_TTL_MS);
  const enrichedBuyer = {
    ...buyer,
    created_at: createdAt,
    expires_at: expiresAt
  };

  await db
    .collection("current_buyers")
    .updateOne({ order_nsu: enrichedBuyer.order_nsu }, { $set: enrichedBuyer }, { upsert: true });

  await pruneExpiredCheckouts(db);
}

export async function removeBuyer(rootDir, user, orderNsu) {
  const db = await getDbForUser(user);
  await db.collection("current_buyers").deleteOne({ order_nsu: orderNsu });
}
