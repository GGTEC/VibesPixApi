import fs from "fs/promises";
import path from "path";
import { readConfig } from "../utils/config.js";
import { logEvent } from "../services/logger.js";

function authorizeAndValidate(req, res, config) {
  const apiKey = req.headers["x-api-key"];
  const user = req.params.user;
  const isSession = req.authUser === user;
  if (!config) {
    return res.status(404).json({ error: "Config não encontrada" });
  }
  if (!isSession && apiKey !== config.apiKey) {
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
    const config = await readConfig(rootDir, user);
    const apiKey = req.headers["x-api-key"];
    const isSession = req.authUser === user;
    if (!config) return res.status(404).json({ error: "Config não encontrada" });
    if (!isSession && apiKey !== config.apiKey) return res.status(401).json({ error: "Não autorizado" });

    const dir = path.join(rootDir, "users", user, "images");
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => ({ name: e.name, url: `/${user}/images/${e.name}` }));
      return res.json({ files });
    } catch (err) {
      if (err.code === "ENOENT") {
        return res.json({ files: [] });
      }
      return res.status(500).json({ error: err.message || "Erro ao listar imagens" });
    }
  };
}

export function makeListSoundsHandler(rootDir) {
  return async function listSounds(req, res) {
    const user = req.params.user;
    const config = await readConfig(rootDir, user);
    const apiKey = req.headers["x-api-key"];
    const isSession = req.authUser === user;
    if (!config) return res.status(404).json({ error: "Config não encontrada" });
    if (!isSession && apiKey !== config.apiKey) return res.status(401).json({ error: "Não autorizado" });

    const dir = path.join(rootDir, "users", user, "sounds");
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => ({ name: e.name, url: `/${user}/sounds/${e.name}` }));
      return res.json({ files });
    } catch (err) {
      if (err.code === "ENOENT") {
        return res.json({ files: [] });
      }
      return res.status(500).json({ error: err.message || "Erro ao listar áudios" });
    }
  };
}
