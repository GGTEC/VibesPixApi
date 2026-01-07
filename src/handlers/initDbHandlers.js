import { ensureUserDbSetup } from "../services/mongo.js";
import { logEvent } from "../services/logger.js";

function toArrayFromMap(produtosObj = {}) {
  return Object.entries(produtosObj).map(([key, value]) => ({ key, ...value }));
}

export function makeInitDbHandler(rootDir) {
  return async function initDb(req, res) {
    const user = req.params.user;

    const rcon = { host: "", port: "", password: "" };
    const produtos = {};
    const current_buyers = [];
    const config = {
      apiKey: `${user}_SUPER_SECRET`,
      infinitypayHandle: user,
      webhookSecret: "secret",
      overlayMessage : "Nova compra",
      sound: "default.mp3",
      ttsVoice: "pt-BR-AntonioNeural"
    };

    try {
      const { db, createdCollections } = await ensureUserDbSetup(user);

      const buyersCol = db.collection("current_buyers");
      const rconCol = db.collection("rcon");
      const produtosCol = db.collection("produtos");
      const configCol = db.collection("config");
      // Garante existência via ensureUserDbSetup (não limpamos histórico aqui)

      await Promise.all([
        buyersCol.deleteMany({}),
        rconCol.deleteMany({}),
        produtosCol.deleteMany({}),
        configCol.deleteMany({})
      ]);

      const buyersDocs = Array.isArray(current_buyers) ? current_buyers : [];
      if (buyersDocs.length) {
        await buyersCol.insertMany(buyersDocs);
      }

      await rconCol.insertOne({
        _id: "rcon",
        host: rcon.host || "",
        port: rcon.port || "",
        password: rcon.password || ""
      });

      const produtosDocs = toArrayFromMap(produtos);
      if (produtosDocs.length) {
        await produtosCol.insertMany(produtosDocs);
      }

      await configCol.insertOne({
        _id: "config",
        apiKey: config.apiKey || "",
        infinitypayHandle: config.infinitypayHandle || "",
        webhookSecret: config.webhookSecret || "",
        overlayMessage: config.overlayMessage || "Nova compra",
        sound: config.sound || null,
        ttsVoice: config.ttsVoice || ""
      });

      logEvent(rootDir, { level: "info", user, message: "init_db_completed" });

      return res.json({
        ok: true,
        db: db.databaseName,
        createdCollections,
        collections: {
          current_buyers: buyersDocs.length,
          produtos: produtosDocs.length,
          rcon: 1,
          config: 1,
          purchases: "ready"
        }
      });
    } catch (err) {
      console.error("INIT-DB ERROR", err);
      return res.status(500).json({ error: "Erro ao inicializar banco", detail: err?.message || String(err) });
    }
  };
}
