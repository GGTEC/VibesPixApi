import crypto from "crypto";
import { getDbForUser } from "../services/mongo.js";

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

  const { _id: _ignore, ...configClean } = configDoc;

  return {
    ...configClean,
    rcon: {
      host: rconDoc?.host || "",
      port: rconDoc?.port || "",
      password: rconDoc?.password || ""
    },
    produtos: produtosArrayToObject(produtosDocs),
    current_buyers: buyers
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
          sound: next.sound || null
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
  await db
    .collection("current_buyers")
    .updateOne({ order_nsu: buyer.order_nsu }, { $set: buyer }, { upsert: true });
}

export async function removeBuyer(rootDir, user, orderNsu) {
  const db = await getDbForUser(user);
  await db.collection("current_buyers").deleteOne({ order_nsu: orderNsu });
}
