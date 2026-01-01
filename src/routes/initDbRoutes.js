import express from "express";
import { getDbForUser } from "../services/mongo.js";

function toArrayFromMap(produtosObj = {}) {
  return Object.entries(produtosObj).map(([key, value]) => ({ key, ...value }));
}

export function buildInitDbRoutes() {
  const router = express.Router({ mergeParams: true });

  router.post("/init-db", async (req, res) => {
    const user = req.params.user;

    // Defaults gerados automaticamente
    const rcon = { host: "", port: "", password: "" };
    const produtos = {};
    const current_buyers = [];
    const config = {
      apiKey: `${user}_SUPER_SECRET`,
      infinitypayHandle: user,
      webhookSecret: "secret",
      sound: "default.mp3"
    };

    try {
      const db = await getDbForUser(user);

      const buyersCol = db.collection("current_buyers");
      const rconCol = db.collection("rcon");
      const produtosCol = db.collection("produtos");
      const configCol = db.collection("config");

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
        sound: config.sound || null
      });

      return res.json({
        ok: true,
        db: db.databaseName,
        collections: {
          current_buyers: buyersDocs.length,
          produtos: produtosDocs.length,
          rcon: 1,
          config: 1
        }
      });
    } catch (err) {
      console.error("INIT-DB ERROR", err);
      return res.status(500).json({ error: "Erro ao inicializar banco", detail: err?.message || String(err) });
    }
  });

  return router;
}
