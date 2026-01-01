import express from "express";
import path from "path";
import fs from "fs";

export function buildStaticRoutes(rootDir) {
  const router = express.Router({ mergeParams: true });

  router.use("/overlay", (req, res, next) => {
    const overlayDir = path.join(rootDir, "users", req.params.user, "overlay");
    if (fs.existsSync(overlayDir)) {
      return express.static(overlayDir)(req, res, next);
    }
    return next();
  });

  router.use((req, res, next) => {
    const pathLower = req.path.toLowerCase();
    if (
      pathLower.startsWith("/api/") ||
      pathLower.startsWith("/events") ||
      pathLower.startsWith("/painel") ||
      pathLower.startsWith("/loja")
    ) {
      return next();
    }

    const overlayDir = path.join(rootDir, "users", req.params.user, "overlay");
    if (fs.existsSync(overlayDir)) {
      return express.static(overlayDir)(req, res, next);
    }
    return next();
  });

  router.use("/tts", (req, res, next) => {
    const ttsDir = path.join(rootDir, "users", req.params.user, "tts");
    if (fs.existsSync(ttsDir)) {
      return express.static(ttsDir)(req, res, next);
    }
    return res.status(404).end();
  });

  router.use("/sounds", (req, res, next) => {
    const soundsDir = path.join(rootDir, "users", req.params.user, "sounds");
    if (fs.existsSync(soundsDir)) {
      return express.static(soundsDir)(req, res, next);
    }
    return res.status(404).end();
  });

  router.use("/images", (req, res, next) => {
    const imagesDir = path.join(rootDir, "users", req.params.user, "images");
    if (fs.existsSync(imagesDir)) {
      return express.static(imagesDir)(req, res, next);
    }
    return res.status(404).end();
  });

  router.use("/painel", (req, res, next) => {
    const painelDir = path.join(rootDir, "users", req.params.user, "painel");
    if (fs.existsSync(painelDir)) {
      return express.static(painelDir)(req, res, next);
    }
    return next();
  });

  return router;
}
