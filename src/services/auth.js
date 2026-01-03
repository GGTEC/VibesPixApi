import crypto from "crypto";
import { getNamedDb } from "./mongo.js";

const SESSION_TTL_MS = 60 * 60 * 1000; // 1h
const sessions = new Map(); // token -> { user, expiresAt }

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, v] = part.trim().split("=");
    if (k) acc[k] = decodeURIComponent(v || "");
    return acc;
  }, {});
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers?.cookie || "");
  const token = cookies.sid;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function createSession(user) {
  const token = crypto.randomUUID();
  sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function destroySession(token) {
  if (!token) return;
  sessions.delete(token);
}

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `sid=${token}; Max-Age=${SESSION_TTL_MS / 1000}; HttpOnly; SameSite=Lax; Path=/`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    "sid=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/"
  );
}

export function sessionMiddleware(req, _res, next) {
  const session = getSessionFromRequest(req);
  if (session && req.params?.user && session.user === req.params.user) {
    req.authUser = session.user;
    req.sessionToken = session.token;
  }
  next();
}

export function makeLoginHandler() {
  return async function login(req, res) {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ error: "Informe usuário/email e senha" });
    }
    try {
      const db = await getNamedDb("VibesBotSales");
      const col = db.collection("VibesBotSales");
      const userDoc = await col.findOne({
        $or: [
          { nome_usuario: identifier },
          { email: identifier }
        ]
      });
      if (!userDoc) return res.status(401).json({ error: "Credenciais inválidas" });

      const hash = crypto.createHash("sha3-256").update(password, "utf8").digest("hex");
      if (hash !== userDoc.pass) return res.status(401).json({ error: "Credenciais inválidas" });

      const userName = userDoc.nome_usuario || req.params?.user;
      if (req.params?.user && userName && req.params.user !== userName) {
        return res.status(403).json({ error: "Usuário não corresponde ao painel" });
      }

      const token = createSession(userName || req.params?.user);
      setSessionCookie(res, token);
      return res.json({ success: true, user: userName || req.params?.user, expiresAt: Date.now() + SESSION_TTL_MS });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Erro ao autenticar" });
    }
  };
}

export function makeLogoutHandler() {
  return async function logout(req, res) {
    const cookies = parseCookies(req.headers?.cookie || "");
    const token = cookies.sid;
    if (token) destroySession(token);
    clearSessionCookie(res);
    return res.json({ success: true });
  };
}

export { SESSION_TTL_MS };
