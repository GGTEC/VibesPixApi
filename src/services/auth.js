import crypto from "crypto";
import { getNamedDb } from "./mongo.js";

const SESSION_TTL_MS = 60 * 60 * 1000; // 1h
const SESSION_SECRET = process.env.SESSION_SECRET || "vibes-session-secret";

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, v] = part.trim().split("=");
    if (k) acc[k] = decodeURIComponent(v || "");
    return acc;
  }, {});
}

function signToken(user) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${user}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function parseSignedToken(token) {
  const parts = token?.split(".") || [];
  if (parts.length < 3) return null;
  const sig = parts.pop();
  const expires = Number(parts.pop());
  const user = parts.join(".");
  if (!user || !expires) return null;
  const payload = `${user}.${expires}`;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  if (expected !== sig) return null;
  if (expires < Date.now()) return null;
  return { user, expiresAt: expires };
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers?.cookie || "");
  const token = cookies.sid;
  if (!token) return null;
  const session = parseSignedToken(token);
  if (!session) return null;
  return { token, ...session };
}

function setSessionCookie(res, token) {
  const attrs = [
    `sid=${token}`,
    `Max-Age=${SESSION_TTL_MS / 1000}`,
    "HttpOnly",
    "SameSite=None",
    "Path=/",
    "Secure",
    "Domain=.vibesbot.com.br"
  ];
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    "sid=; Max-Age=0; HttpOnly; SameSite=None; Path=/; Secure; Domain=.vibesbot.com.br"
  );
}

export function sessionMiddleware(req, _res, next) {
  const session = getSessionFromRequest(req);
  const urlUser = req.params?.user;
  if (session && urlUser && session.user?.toLowerCase() === urlUser.toLowerCase()) {
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
          { email: identifier },
        ]
      });
      if (!userDoc) return res.status(401).json({ error: "Credenciais inválidas" });

      const storedHash = userDoc.pass || userDoc.pwd_hash || userDoc.password;
      const hash = crypto.createHash("sha3-256").update(password, "utf8").digest("hex");
      if (!storedHash || hash !== storedHash) return res.status(401).json({ error: "Credenciais inválidas" });

      const userName = userDoc.nome_usuario || identifier;
      const panelUser = req.params?.user || userName;

      const token = signToken(panelUser);
      setSessionCookie(res, token);
      return res.json({ success: true, user: userName, panel: panelUser, expiresAt: Date.now() + SESSION_TTL_MS });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Erro ao autenticar" });
    }
  };
}

export function makeLogoutHandler() {
  return async function logout(req, res) {
    const cookies = parseCookies(req.headers?.cookie || "");
    clearSessionCookie(res);
    return res.json({ success: true });
  };
}

export { SESSION_TTL_MS };
