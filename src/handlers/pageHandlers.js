import path from "path";
import fs from "fs";
import express from "express";

export function makePainelHandler(rootDir) {
  return function painel(req, res) {
    return res.sendFile(path.join(rootDir, "src", "painel", "index.html"));
  };
}

export function makeProductPanelHandler(rootDir) {
  return function productPanel(req, res) {
    return res.sendFile(path.join(rootDir, "src", "productpanel", "index.html"));
  };
}

export function makeProductPanelStatic(rootDir) {
  return function productPanelStatic(req, res, next) {
    return express.static(path.join(rootDir, "src", "productpanel"))(req, res, next);
  };
}

export function makeLojaMiddleware(rootDir) {
  return function loja(req, res, next) {
    return express.static(path.join(rootDir, "src", "loja"))(req, res, next);
  };
}

export function makeThanksMiddleware(rootDir) {
  return function thanks(req, res, next) {
    return express.static(path.join(rootDir, "src", "thanks"))(req, res, next);
  };
}

export function makeOverlayHandler(rootDir) {
  return function overlay(req, res) {
    return res.sendFile(path.join(rootDir, "src", "overlay", "index.html"));
  };
}

export function makeRootOverlayHandler(rootDir) {
  return function rootOverlay(req, res) {
    return res.sendFile(path.join(rootDir, "src", "overlay", "index.html"));
  };
}
