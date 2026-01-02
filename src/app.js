import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import fs from "fs";
import { makeGetConfigHandler, makeUpdateConfigHandler } from "./handlers/configHandlers.js";
import { makeInitDbHandler } from "./handlers/initDbHandlers.js";
import { makeUploadImageHandler } from "./handlers/uploadHandlers.js";
import { makeCreateCheckoutHandler } from "./handlers/checkoutHandlers.js";
import { makeWebhookHandler } from "./handlers/webhookHandlers.js";
import { makeOverlayHandler, makePainelHandler, makeThanksMiddleware, makeLojaMiddleware, makeRootOverlayHandler, makeProductPanelHandler, makeProductPanelStatic } from "./handlers/pageHandlers.js";
import { makeOverlayFallback, makeOverlayStatic, makePainelStatic, makeUserAssetsStatic } from "./handlers/staticHandlers.js";
import { makeSseHandler } from "./handlers/sseHandlers.js";
import { logEvent, readRecentLogs } from "./services/logger.js";
import { pingMongo } from "./services/mongo.js";

function createUserStorage(rootDir) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(rootDir, "users", req.params.user, "images");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || ".bin";
      const base = path
        .basename(file.originalname, ext)
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .slice(0, 40) || "image";
      cb(null, `${base}-${Date.now()}${ext}`);
    }
  });
}

export function createApp(rootDir) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(bodyParser.json());

   // Caminho absoluto da pasta pública
  const publicDir = path.resolve(rootDir, "public");

  const upload = multer({
    storage: createUserStorage(rootDir),
    limits: { fileSize: 5 * 1024 * 1024 }
  });

  // Assets públicos compartilhados
  app.use(express.static(publicDir));

  // Página pública raiz (fallback explícito)
  app.get("/", (req, res) => {
    return res.sendFile(path.join(publicDir, "index.html"));
  });

  // Logs públicos (sanitizados e limitados)
  app.get("/status/logs", (req, res) => {
    const logs = readRecentLogs(rootDir, 120);
    return res.json({ logs });
  });

  // Saúde do banco (ping simples)
  app.get("/status/db", async (req, res) => {
    try {
      await pingMongo();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "mongo ping failed" });
    }
  });

  const userRouter = express.Router({ mergeParams: true });

  // Assets e estáticos do usuário
  userRouter.use(makeOverlayStatic(rootDir));
  userRouter.use(makeOverlayFallback(rootDir));
  userRouter.use("/tts", makeUserAssetsStatic(rootDir, "tts"));
  userRouter.use("/sounds", makeUserAssetsStatic(rootDir, "sounds"));
  userRouter.use("/images", makeUserAssetsStatic(rootDir, "images"));
  userRouter.use("/painel", makePainelStatic(rootDir));
  userRouter.use("/productpanel", makeProductPanelStatic(rootDir));

  // Streams e eventos
  userRouter.get("/events", makeSseHandler());

  // APIs
  userRouter.post("/api/webhook", makeWebhookHandler(rootDir));
  userRouter.get("/api/config", makeGetConfigHandler(rootDir));
  userRouter.post("/api/config", makeUpdateConfigHandler(rootDir));
  userRouter.post("/api/init-db", makeInitDbHandler(rootDir));
  userRouter.post(
    "/api/upload-image",
    upload.single("file"),
    makeUploadImageHandler(rootDir)
  );
  userRouter.post(
    "/api/create_checkout_infinitepay",
    makeCreateCheckoutHandler(rootDir)
  );

  // Páginas
  userRouter.get("/painel", makePainelHandler(rootDir));
  userRouter.get("/productpanel", makeProductPanelHandler(rootDir));
  userRouter.use("/loja", makeLojaMiddleware(rootDir));
  userRouter.use("/thanks", makeThanksMiddleware(rootDir));
  userRouter.get("/overlay", makeOverlayHandler(rootDir));
  userRouter.get("/", makeRootOverlayHandler(rootDir));

  app.use("/:user", userRouter);

  return app;
}
