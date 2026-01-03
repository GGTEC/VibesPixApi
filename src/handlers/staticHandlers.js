import path from "path";
import fs from "fs";
import express from "express";

export function makeOverlayStatic(rootDir) {
  return function overlayStatic(req, res, next) {
    return express.static(path.join(rootDir, "src", "overlay"))(req, res, next);
  };
}

export function makeOverlayFallback(rootDir) {
  return function overlayFallback(req, res, next) {
    return express.static(path.join(rootDir, "src", "overlay"))(req, res, next);
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
    return express.static(path.join(rootDir, "src", "painel"))(req, res, next);
  };
}
