import path from "path";
import { ensureUserDbSetup, listDatabases, getNamedDb } from "../services/mongo.js";

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

    const wantsJson = String(req.query?.format || "").toLowerCase() === "json";
    const prefersHtml = req.accepts(["html", "json"]) === "html";
    if (prefersHtml && !wantsJson) {
      return res.sendFile(path.join(_rootDir, "src", "dbschema", "index.html"));
    }

    try {
      // Mesmo modelo do /home: a página é pública, mas os dados exigem sessão.
      const isSession = req.authUser === user;
      if (!isSession) {
        return res.status(401).json({ error: "Não autorizado" });
      }

      const requiredCollections = ["config", "rcon", "produtos", "current_buyers", "purchases"];

      let dbNames = [];
      let warning = null;
      try {
        dbNames = await listDatabases();
      } catch (err) {
        // Se a conta do Mongo não tiver permissão para listar DBs, pelo menos retorna o atual.
        warning = `listDatabases_failed: ${err?.message || "unknown"}`;
        dbNames = [];
      }

      const skip = new Set(["admin", "local", "config", "VibesBotSales"]);
      const userDbNames = dbNames.length
        ? dbNames.filter((name) => !skip.has(name))
        : [user];

      const databases = [];

      for (const dbName of userDbNames) {
        // eslint-disable-next-line no-await-in-loop
        const { createdCollections } = await ensureUserDbSetup(dbName);
        // eslint-disable-next-line no-await-in-loop
        const db = await getNamedDb(dbName);

        // eslint-disable-next-line no-await-in-loop
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

        databases.push({
          user: dbName,
          db: db.databaseName,
          createdCollections,
          requiredCollections,
          presentRequired,
          missingRequired,
          collections: names,
          schema
        });
      }

      return res.json({ ok: true, warning, databases });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao obter schema", detail: err?.message || String(err) });
    }
  };
}
