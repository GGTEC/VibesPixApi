import path from "path";
import fs from "fs";
import express from "express";

export function makePainelHandler(rootDir) {
  return function painel(req, res) {
    const painelPath = path.join(rootDir, "users", req.params.user, "painel", "index.html");

    if (!fs.existsSync(painelPath)) {
      return res.status(404).send("Painel não encontrado");
    }

    return res.sendFile(painelPath);
  };
}

function pickExistingDir(paths) {
  return paths.find(candidate => fs.existsSync(candidate)) || null;
}

export function makeLojaMiddleware(rootDir) {
  return function loja(req, res, next) {
    const candidateDirs = [
      path.join(rootDir, "users", req.params.user, "loja"),
      path.join(rootDir, "loja"),
      path.join(rootDir, "public", "loja")
    ];

    const found = pickExistingDir(candidateDirs);
    if (found) {
      return express.static(found)(req, res, next);
    }

    return res.status(404).send("Loja não encontrada");
  };
}

export function makeThanksMiddleware(rootDir) {
  return function thanks(req, res, next) {
    const candidateDirs = [
      path.join(rootDir, "users", req.params.user, "thanks"),
      path.join(rootDir, "thanks"),
      path.join(rootDir, "public", "thanks")
    ];

    const found = pickExistingDir(candidateDirs);
    if (found) {
      return express.static(found)(req, res, next);
    }

    return res.status(404).send("Página de obrigado não encontrada");
  };
}

export function makeOverlayHandler(rootDir) {
  return function overlay(req, res) {
    const customOverlay = path.join(rootDir, "users", req.params.user, "overlay", "index.html");

    if (fs.existsSync(customOverlay)) {
      return res.sendFile(customOverlay);
    }

    return res.sendFile(path.join(rootDir, "public", "overlay.html"));
  };
}

export function makeRootOverlayHandler(rootDir) {
  return function rootOverlay(req, res) {
    return res.sendFile(path.join(rootDir, "public", "overlay.html"));
  };
}
