import { readConfig } from "../utils/config.js";
import { logEvent } from "../services/logger.js";
import fs from "fs";
import path from "path";

function authorizeAndValidate(req, res, config) {
  const apiKey = req.headers["x-api-key"];
  if (!config) {
    return res.status(404).json({ error: "Config não encontrada" });
  }
  if (apiKey !== config.apiKey) {
    return res.status(401).json({ error: "Não autorizado" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado" });
  }
  return null;
}

export function makeUploadImageHandler(rootDir) {
  return async function uploadImage(req, res) {
    const user = req.params.user;
    const config = await readConfig(rootDir, user);
    const error = authorizeAndValidate(req, res, config);
    if (error) return error;

    const url = `/${user}/images/${req.file.filename}`;
    logEvent(rootDir, { level: "info", user, message: "image_uploaded" });
    return res.json({ url });
  };
}

export function makeUploadSoundHandler(rootDir) {
  return async function uploadSound(req, res) {
    const user = req.params.user;
    const config = await readConfig(rootDir, user);
    const error = authorizeAndValidate(req, res, config);
    if (error) return error;

    const filename = req.file.filename;
    const url = `/${user}/sounds/${filename}`;
    logEvent(rootDir, { level: "info", user, message: "sound_uploaded" });
    return res.json({ filename, url });
  };
}

export function makeListImagesHandler(rootDir) {
  return async function listImages(req, res) {
    const user = req.params.user;
    const apiKey = req.headers["x-api-key"];
    const config = await readConfig(rootDir, user);
    if (!config) {
      return res.status(404).json({ error: "Config não encontrada" });
    }
    if (apiKey !== config.apiKey) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const dir = path.join(rootDir, "users", user, "images");
    try {
      const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f));
      return res.json({ files });
    } catch (err) {
      if (err.code === "ENOENT") return res.json({ files: [] });
      return res.status(500).json({ error: "Erro ao listar imagens" });
    }
  };
}
