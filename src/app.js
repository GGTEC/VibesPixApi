import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import fs from "fs";
import { makeGetConfigHandler, makeUpdateConfigHandler } from "./handlers/configHandlers.js";
import { makeInitDbHandler } from "./handlers/initDbHandlers.js";
import { makeUploadImageHandler, makeUploadSoundHandler, makeListImagesHandler, makeListSoundsHandler } from "./handlers/uploadHandlers.js";
import { makeCreateCheckoutHandler } from "./handlers/checkoutHandlers.js";
import { makeWebhookHandler } from "./handlers/webhookHandlers.js";
import { makeTestTtsHandler } from "./handlers/ttsHandlers.js";
import { makeOverlayHandler, makeConfigHandler, makeThanksMiddleware, makeLojaMiddleware, makeProductPanelHandler, makeProductPanelStatic, makeHomeHandler, makeNotFoundHandler } from "./handlers/pageHandlers.js";
import { makeOverlayStatic, makeUserAssetsStatic, makeConfigStatic } from "./handlers/staticHandlers.js";
import { makeSseHandler } from "./handlers/sseHandlers.js";
import { logEvent, readRecentLogs } from "./services/logger.js";
import { pingMongo } from "./services/mongo.js";
import { sessionMiddleware, makeLoginHandler, makeLogoutHandler } from "./services/auth.js";

function createUserStorage(rootDir, folder = "images") {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(rootDir, "users", req.params.user, folder);
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        return cb(new Error(`Erro ao criar diretório de upload: ${err.message}`));
      }
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const safeName = path.basename(file.originalname) || `upload${Date.now()}`;
      cb(null, safeName);
    }
  });
}

export function createApp(rootDir) {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(bodyParser.json());

   // Caminho absoluto da pasta pública
  const publicDir = path.resolve(rootDir, "public");

  const uploadImage = multer({
    storage: createUserStorage(rootDir, "images"),
    limits: { fileSize: 5 * 1024 * 1024 }
  });

  const uploadSound = multer({
    storage: createUserStorage(rootDir, "sounds"),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype?.startsWith("audio/")) {
        return cb(new Error("Apenas arquivos de áudio"));
      }
      cb(null, true);
    }
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

  // Injeta sessão do cookie quando existir e estiver válida
  userRouter.use(sessionMiddleware);

  // Assets e estáticos do usuário
  userRouter.use("/overlay", makeOverlayStatic(rootDir));
  userRouter.use("/tts", makeUserAssetsStatic(rootDir, "tts"));
  userRouter.use("/sounds", makeUserAssetsStatic(rootDir, "sounds"));
  userRouter.use("/images", makeUserAssetsStatic(rootDir, "images"));
  userRouter.use("/config", makeConfigStatic(rootDir));
  userRouter.use("/productpanel", makeProductPanelStatic(rootDir));

  // Streams e eventos
  userRouter.get("/events", makeSseHandler());

  // APIs
  userRouter.post("/api/login", makeLoginHandler());
  userRouter.post("/api/logout", makeLogoutHandler());
  userRouter.post("/api/webhook", makeWebhookHandler(rootDir));
  userRouter.get("/api/config", makeGetConfigHandler(rootDir));
  userRouter.post("/api/config", makeUpdateConfigHandler(rootDir));
  userRouter.post("/api/tts-test", makeTestTtsHandler(rootDir));
  userRouter.post("/api/init-db", makeInitDbHandler(rootDir));
  userRouter.post(
    "/api/upload-image",
    (req, res, next) => {
      uploadImage.single("file")(req, res, (err) => {
        if (err) {
          return res.status(500).json({ error: err.message || "Erro no upload" });
        }
        return next();
      });
    },
    makeUploadImageHandler(rootDir)
  );
  userRouter.post(
    "/api/upload-sound",
    (req, res, next) => {
      uploadSound.single("file")(req, res, (err) => {
        if (err) {
          return res.status(500).json({ error: err.message || "Erro no upload" });
        }
        return next();
      });
    },
    makeUploadSoundHandler(rootDir)
  );
  userRouter.get(
    "/api/list-images",
    makeListImagesHandler(rootDir)
  );
  userRouter.get(
    "/api/list-sounds",
    makeListSoundsHandler(rootDir)
  );
  userRouter.post(
    "/api/create_checkout_infinitepay",
    makeCreateCheckoutHandler(rootDir)
  );

  // Páginas
  userRouter.get("/config", makeConfigHandler(rootDir));
  userRouter.get("/productpanel", makeProductPanelHandler(rootDir));
  userRouter.use("/loja", makeLojaMiddleware(rootDir));
  userRouter.use("/thanks", makeThanksMiddleware(rootDir));
  userRouter.get("/overlay", makeOverlayHandler(rootDir));
  userRouter.get("/", makeHomeHandler(rootDir));
  userRouter.use(makeNotFoundHandler(rootDir));

  // Redireciona apenas o slug raiz sem barra final (evita loop em /:user/)
  app.get(/^\/([^/]+)$/i, (req, res, next) => {
    const user = req.params[0];

    // Rotas públicas já tratadas mantêm comportamento normal
    if (["status"].includes(user)) return next();

    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    return res.redirect(302, `/${encodeURIComponent(user)}/${query}`);
  });

  app.use("/:user", userRouter);

  // Fallback global
  app.use(makeNotFoundHandler(rootDir));

  return app;
}

