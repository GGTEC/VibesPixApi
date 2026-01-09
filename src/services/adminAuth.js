import crypto from "crypto";
import { ensureAdminDbSetup, getAdminDb } from "./mongo.js";

const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, v] = part.trim().split("=");
    if (k) acc[k] = decodeURIComponent(v || "");
    return acc;
  }, {});
}

function isSecureRequest(req) {
  if (req.secure) return true;
  const xfProto = String(req.headers?.["x-forwarded-proto"] || "").toLowerCase();
  return xfProto === "https";
}

function setAdminCookie(res, token, req) {
  const attrs = [
    `admin_token=${encodeURIComponent(token)}`,
    `Max-Age=${Math.floor(ADMIN_TOKEN_TTL_MS / 1000)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/"
  ];
  if (isSecureRequest(req)) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearAdminCookie(res, req) {
  const attrs = [
    "admin_token=",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    "Path=/"
  ];
  if (isSecureRequest(req)) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

async function hashPassword(password, saltBase64) {
  const salt = saltBase64 ? Buffer.from(saltBase64, "base64") : crypto.randomBytes(16);
  const derivedKey = await scryptAsync(String(password || ""), salt);
  return {
    salt: salt.toString("base64"),
    hash: Buffer.from(derivedKey).toString("base64")
  };
}

async function verifyPassword(password, saltBase64, hashBase64) {
  const { hash } = await hashPassword(password, saltBase64);
  const a = Buffer.from(hash, "base64");
  const b = Buffer.from(String(hashBase64 || ""), "base64");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function bootstrapAdminIfNeeded(db) {
  const bootstrapUser = process.env.ADMIN_USER;
  const bootstrapPass = process.env.ADMIN_PASS;
  if (!bootstrapUser || !bootstrapPass) return;

  const adminsCol = db.collection("admins");
  const count = await adminsCol.estimatedDocumentCount();
  if (count > 0) return;

  const { salt, hash } = await hashPassword(bootstrapPass);
  await adminsCol.insertOne({
    username: String(bootstrapUser),
    pwd_salt: salt,
    pwd_hash: hash,
    createdAt: new Date()
  });
}

export async function adminAuthMiddleware(req, res, next) {
  try {
    await ensureAdminDbSetup();
    const db = await getAdminDb();
    await bootstrapAdminIfNeeded(db);

    const auth = String(req.headers?.authorization || "");
    const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;

    const cookies = parseCookies(req.headers?.cookie || "");
    const token = bearer || cookies.admin_token;

    if (!token) {
      req.adminUser = null;
      return res.status(401).json({ error: "Não autorizado" });
    }

    const tokenDoc = await db.collection("tokens").findOne({ token });
    if (!tokenDoc) return res.status(401).json({ error: "Não autorizado" });

    if (tokenDoc.expiresAt && new Date(tokenDoc.expiresAt).getTime() < Date.now()) {
      await db.collection("tokens").deleteOne({ _id: tokenDoc._id });
      return res.status(401).json({ error: "Sessão expirada" });
    }

    req.adminUser = tokenDoc.username || null;
    req.adminToken = token;
    return next();
  } catch (err) {
    return res.status(500).json({ error: "Erro no admin auth", detail: err?.message || String(err) });
  }
}

export function makeAdminLoginHandler() {
  return async function adminLogin(req, res) {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Informe usuário e senha" });
    }

    try {
      await ensureAdminDbSetup();
      const db = await getAdminDb();
      await bootstrapAdminIfNeeded(db);

      const adminDoc = await db.collection("admins").findOne({ username: String(username) });
      if (!adminDoc) return res.status(401).json({ error: "Credenciais inválidas" });

      const ok = await verifyPassword(password, adminDoc.pwd_salt, adminDoc.pwd_hash);
      if (!ok) return res.status(401).json({ error: "Credenciais inválidas" });

      const token = makeToken();
      const expiresAt = new Date(Date.now() + ADMIN_TOKEN_TTL_MS);
      await db.collection("tokens").insertOne({
        token,
        username: adminDoc.username,
        createdAt: new Date(),
        expiresAt
      });

      setAdminCookie(res, token, req);
      return res.json({ ok: true, username: adminDoc.username, expiresAt: expiresAt.toISOString() });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao autenticar admin", detail: err?.message || String(err) });
    }
  };
}

export function makeAdminLogoutHandler() {
  return async function adminLogout(req, res) {
    try {
      await ensureAdminDbSetup();
      const db = await getAdminDb();

      const cookies = parseCookies(req.headers?.cookie || "");
      const token = cookies.admin_token;
      if (token) {
        await db.collection("tokens").deleteOne({ token });
      }

      clearAdminCookie(res, req);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao sair", detail: err?.message || String(err) });
    }
  };
}
