import express from "express";
import path from "path";
import fs from "fs";

export function buildPageRoutes(rootDir) {
  const router = express.Router({ mergeParams: true });

  router.get("/painel", (req, res) => {
    const painelPath = path.join(
      rootDir,
      "users",
      req.params.user,
      "painel",
      "index.html"
    );

    if (!fs.existsSync(painelPath)) {
      return res.status(404).send("Painel não encontrado");
    }

    return res.sendFile(painelPath);
  });

  router.use("/loja", (req, res, next) => {
    const candidateDirs = [
      path.join(rootDir, "users", req.params.user, "loja"),
      path.join(rootDir, "loja"),
      path.join(rootDir, "public", "loja")
    ];

    const found = candidateDirs.find(dir => fs.existsSync(dir));
    if (found) {
      return express.static(found)(req, res, next);
    }

    return res.status(404).send("Loja não encontrada");
  });

  router.use("/thanks", (req, res, next) => {
    const candidateDirs = [
      path.join(rootDir, "users", req.params.user, "thanks"),
      path.join(rootDir, "thanks"),
      path.join(rootDir, "public", "thanks")
    ];

    const found = candidateDirs.find(dir => fs.existsSync(dir));
    if (found) {
      return express.static(found)(req, res, next);
    }

    return res.status(404).send("Página de obrigado não encontrada");
  });

  router.get("/overlay", (req, res) => {
    const customOverlay = path.join(
      rootDir,
      "users",
      req.params.user,
      "overlay",
      "index.html"
    );

    if (fs.existsSync(customOverlay)) {
      return res.sendFile(customOverlay);
    }

    return res.sendFile(
      path.join(rootDir, "public", "overlay.html")
    );
  });

  router.get("/", (req, res) => {
    return res.sendFile(
      path.join(rootDir, "public", "overlay.html")
    );
  });

  return router;
}
