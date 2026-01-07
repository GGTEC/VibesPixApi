import path from "path";
import express from "express";

export function makeConfigHandler(rootDir) {
  return function config(req, res) {
    return res.sendFile(path.join(rootDir, "src", "config", "index.html"));
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

export function makeDonateMiddleware(rootDir) {
  return function donate(req, res, next) {
    return express.static(path.join(rootDir, "src", "donate"))(req, res, next);
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

export function makeGoalHandler(rootDir) {
  return function goal(req, res) {
    return res.sendFile(path.join(rootDir, "src", "goal", "index.html"));
  };
}

export function makeHomeHandler(rootDir) {
  return function home(req, res) {
    return res.sendFile(path.join(rootDir, "src", "home", "index.html"));
  };
}

export function makeNotFoundHandler(rootDir) {
  return function notFound(req, res) {
    return res.status(404).sendFile(path.join(rootDir, "src", "notfound", "index.html"));
  };
}
