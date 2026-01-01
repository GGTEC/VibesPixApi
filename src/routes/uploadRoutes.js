import express from "express";
import { readConfig } from "../utils/config.js";

export function buildUploadRoutes(rootDir, upload) {
  const router = express.Router({ mergeParams: true });

  router.post("/upload-image", upload.single("file"), (req, res) => {
    const user = req.params.user;
    const apiKey = req.headers["x-api-key"];

    const config = readConfig(rootDir, user);
    if (!config) {
      return res.status(404).json({ error: "Config não encontrada" });
    }

    if (apiKey !== config.apiKey) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }

    const url = `/${user}/images/${req.file.filename}`;
    return res.json({ url });
  });

  return router;
}
