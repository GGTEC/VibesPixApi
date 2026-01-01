import express from "express";
import { readConfig, writeConfig } from "../utils/config.js";

export function buildConfigRoutes(rootDir) {
  const router = express.Router({ mergeParams: true });

  router.get("/config", async (req, res) => {
    const user = req.params.user;
    const apiKey = req.headers["x-api-key"];

    const config = await readConfig(rootDir, user);
    if (!config) {
      return res.status(404).json({ error: "Config não encontrada" });
    }

    if (apiKey) {
      if (apiKey !== config.apiKey) {
        return res.status(401).json({ error: "Não autorizado" });
      }
      return res.json(config);
    }

    const { apiKey: _, webhookSecret, rcon, ...rest } = config;
    res.json(rest);
  });

  router.post("/config", async (req, res) => {
    const user = req.params.user;
    const apiKey = req.headers["x-api-key"];
    const newConfig = req.body;
    const current = await readConfig(rootDir, user);
    if (!current) {
      return res.status(404).json({ error: "Config não encontrada" });
    }

    if (apiKey !== current.apiKey) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    if (!newConfig.rcon || !newConfig.produtos) {
      return res.status(400).json({ error: "Config inválida" });
    }

    await writeConfig(rootDir, user, () => ({
      ...current,
      rcon: newConfig.rcon,
      produtos: newConfig.produtos
    }));

    res.json({ success: true });
  });

  return router;
}
