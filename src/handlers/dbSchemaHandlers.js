import { ensureUserDbSetup } from "../services/mongo.js";

function pickIndexInfo(idx) {
  return {
    name: idx?.name || null,
    key: idx?.key || {},
    unique: Boolean(idx?.unique),
    expireAfterSeconds: typeof idx?.expireAfterSeconds === "number" ? idx.expireAfterSeconds : null
  };
}

export function makeDbSchemaHandler(_rootDir) {
  return async function dbSchema(req, res) {
    const user = req.params.user;

    try {
      const { db, createdCollections } = await ensureUserDbSetup(user);

      // Autorização: sessão sempre OK. API key só se já existir config.
      const isSession = req.authUser === user;
      const apiKeyHeader = req.headers["x-api-key"];
      const configDoc = await db.collection("config").findOne(
        { _id: "config" },
        { projection: { apiKey: 1 } }
      );

      if (!isSession) {
        const expectedKey = configDoc?.apiKey;
        if (!expectedKey || apiKeyHeader !== expectedKey) {
          return res.status(401).json({ error: "Não autorizado" });
        }
      }

      const requiredCollections = ["config", "rcon", "produtos", "current_buyers", "purchases"];

      const collections = await db.listCollections({}, { nameOnly: true }).toArray();
      const names = collections.map((c) => c.name).sort();

      const schema = {};
      for (const name of names) {
        // eslint-disable-next-line no-await-in-loop
        const indexes = await db.collection(name).indexes();
        schema[name] = {
          indexes: Array.isArray(indexes) ? indexes.map(pickIndexInfo) : []
        };
      }

      const presentRequired = requiredCollections.filter((c) => names.includes(c));
      const missingRequired = requiredCollections.filter((c) => !names.includes(c));

      return res.json({
        ok: true,
        db: db.databaseName,
        createdCollections,
        requiredCollections,
        presentRequired,
        missingRequired,
        collections: names,
        schema
      });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao obter schema", detail: err?.message || String(err) });
    }
  };
}
