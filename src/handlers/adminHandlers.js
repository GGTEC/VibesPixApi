import fs from "fs";
import path from "path";
import { readRecentLogs } from "../services/logger.js";

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
