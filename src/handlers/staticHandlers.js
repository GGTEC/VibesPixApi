import path from "path";
import express from "express";

export function makeOverlayStatic(rootDir) {
  return function overlayStatic(req, res, next) {
    return express.static(path.join(rootDir, "src", "overlay"))(req, res, next);
  };
}

export function makeConfigStatic(rootDir) {
  return function configStatic(req, res, next) {
    return express.static(path.join(rootDir, "src", "config"))(req, res, next);
  };
}

export function makeUserAssetsStatic(rootDir, subdir) {
  return function assets(req, res, next) {
    return express.static(path.join(rootDir, "users", req.params.user, subdir))(req, res, next);
  };
}

