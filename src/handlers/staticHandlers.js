import path from "path";
import fs from "fs";
import express from "express";

function ensureStaticIfExists(dirPath, req, res, next) {
  if (fs.existsSync(dirPath)) {
    return express.static(dirPath)(req, res, next);
  }
  return next();
}

export function makeOverlayStatic(rootDir) {
  return function overlayStatic(req, res, next) {
    const overlayDir = path.join(rootDir, "users", req.params.user, "overlay");
    return ensureStaticIfExists(overlayDir, req, res, next);
  };
}

export function makeOverlayFallback(rootDir) {
  return function overlayFallback(req, res, next) {
    const pathLower = req.path.toLowerCase();
    if (
      pathLower.startsWith("/api/") ||
      pathLower.startsWith("/events") ||
      pathLower.startsWith("/painel") ||
      pathLower.startsWith("/productpanel") ||
      pathLower.startsWith("/loja")
    ) {
      return next();
    }

    const overlayDir = path.join(rootDir, "users", req.params.user, "overlay");
    return ensureStaticIfExists(overlayDir, req, res, next);
  };
}

export function makeUserAssetsStatic(rootDir, subdir) {
  return function assets(req, res, next) {
    const dirPath = path.join(rootDir, "users", req.params.user, subdir);
    if (fs.existsSync(dirPath)) {
      return express.static(dirPath)(req, res, next);
    }
    return res.status(404).end();
  };
}

export function makePainelStatic(rootDir) {
  return function painelStatic(req, res, next) {
    const painelDir = path.join(rootDir, "users", req.params.user, "painel");
    return ensureStaticIfExists(painelDir, req, res, next);
  };
}
