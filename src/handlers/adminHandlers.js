import fs from "fs";
import path from "path";
import { readRecentLogs } from "../services/logger.js";
import { readConfig } from "../utils/config.js";
import { getAllowedTtsVoices, getDefaultTtsVoice } from "../services/tts.js";
import { getDbForUser } from "../services/mongo.js";
import { runTestProduct } from "./webhookHandlers.js";

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function safeUserName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function makeAdminPageHandler(rootDir) {
  return async function adminPage(_req, res) {
    return res.sendFile(path.join(rootDir, "src", "admin", "index.html"));
  };
}

export function makeAdminMeHandler() {
  return async function adminMe(req, res) {
    return res.json({ ok: true, username: req.adminUser || null });
  };
}

export function makeAdminUsersHandler(rootDir) {
  return async function adminUsers(_req, res) {
    // Fonte principal: pasta /users
    let fsUsers = [];
    try {
      const usersDir = path.join(rootDir, "users");
      if (fs.existsSync(usersDir)) {
        fsUsers = fs
          .readdirSync(usersDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
          .map(safeUserName);
      }
    } catch {
      fsUsers = [];
    }

    // Complemento: usuários que aparecem nos logs
    const logs = readRecentLogs(rootDir, 500);
    const logUsers = logs.map((l) => safeUserName(l?.user)).filter(Boolean);

    const users = uniq([...fsUsers, ...logUsers]).sort((a, b) => a.localeCompare(b));
    return res.json({ ok: true, users });
  };
}

export function makeAdminLogsHandler(rootDir) {
  return async function adminLogs(req, res) {
    const user = safeUserName(req.query?.user);
    const limit = Math.max(1, Math.min(500, Number(req.query?.limit || 200)));

    const logs = readRecentLogs(rootDir, 2000);
    const filtered = user
      ? logs.filter((l) => String(l?.user || "") === user)
      : logs;

    const sliced = filtered.slice(-limit);
    return res.json({ ok: true, user: user || null, logs: sliced });
  };
}

export function makeAdminTestProductHandler(rootDir) {
  return async function adminTestProduct(req, res) {
    const targetUser = safeUserName(req.body?.user);
    if (!targetUser) {
      return res.status(400).json({ error: "Informe o usuário (user)" });
    }

    try {
      const result = await runTestProduct(rootDir, targetUser, req.body);
      return res.json({ ok: true, user: targetUser, result });
    } catch (err) {
      const status = Number(err?.statusCode) || 500;
      return res.status(status).json({ error: err?.message || "Erro ao testar produto" });
    }
  };
}

export function makeAdminTestOptionsHandler(rootDir) {
  return async function adminTestOptions(req, res) {
    const user = safeUserName(req.query?.user);
    if (!user) {
      return res.status(400).json({ error: "Informe o usuário (user)" });
    }

    const config = await readConfig(rootDir, user);
    if (!config) {
      return res.status(404).json({ error: "Config não encontrada" });
    }

    const products = Object.keys(config?.produtos || {}).sort((a, b) => a.localeCompare(b));
    const allowedVoices = getAllowedTtsVoices().slice().sort((a, b) => a.localeCompare(b));
    const defaultVoice = getDefaultTtsVoice();
    const currentVoice = (config?.ttsVoice || "").toString().trim() || null;

    return res.json({
      ok: true,
      user,
      products,
      voices: {
        allowed: allowedVoices,
        default: defaultVoice,
        current: currentVoice
      }
    });
  };
}

function parseDateParam(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function makeAdminMetricsHandler(_rootDir) {
  return async function adminMetrics(req, res) {
    const user = safeUserName(req.query?.user);
    if (!user) return res.status(400).json({ error: "Informe o usuário (user)" });

    const from = parseDateParam(req.query?.from);
    const to = parseDateParam(req.query?.to);
    if (!from || !to) {
      return res.status(400).json({ error: "Informe 'from' e 'to' (ISO ou data)" });
    }
    if (from > to) {
      return res.status(400).json({ error: "Período inválido (from > to)" });
    }

    const db = await getDbForUser(user);
    const col = db.collection("purchases");

    const limit = Math.max(1, Math.min(10000, Number(req.query?.limit || 5000)));

    const match = {
      createdAt: { $gte: from, $lte: to }
    };

    const docs = await col
      .find(match)
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();

    const purchases = docs.map((doc) => ({
      ...doc,
      _id: doc._id?.toString?.() || doc._id,
      createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
      updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt
    }));

    const count = purchases.length;
    const totalValue = purchases.reduce((acc, p) => {
      const v = Number(p?.totalValue);
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);

    return res.json({
      ok: true,
      user,
      from: from.toISOString(),
      to: to.toISOString(),
      count,
      totalValue,
      purchases,
      truncated: docs.length >= limit
    });
  };
}
