import { getDbForUser } from "../services/mongo.js";

function parseDateParam(value, fallback) {
  if (!value) return fallback;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

export function makeUserMetricsHandler(_rootDir) {
  return async function userMetrics(req, res) {
    const user = req.params?.user;

    const isSession = req.authUser === user;
    if (!isSession) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const from = parseDateParam(req.query?.from, null);
    const to = parseDateParam(req.query?.to, null);

    if (!from || !to) {
      return res.status(400).json({ error: "Informe from/to válidos (ISO)." });
    }

    // Proteção simples para evitar respostas gigantes.
    const limit = Math.max(1, Math.min(10000, Number(req.query?.limit || 5000)));

    const db = await getDbForUser(user);
    const col = db.collection("purchases");

    const match = { createdAt: { $gte: from, $lte: to } };

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
