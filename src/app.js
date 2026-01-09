import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import fs from "fs";
import { makeGetConfigHandler, makeUpdateConfigHandler } from "./handlers/configHandlers.js";
import { makeInitDbHandler } from "./handlers/initDbHandlers.js";
import { makeDbSchemaHandler } from "./handlers/dbSchemaHandlers.js";
import { makeUploadImageHandler, makeUploadSoundHandler, makeListImagesHandler, makeListSoundsHandler } from "./handlers/uploadHandlers.js";
import { makeCreateCheckoutHandler } from "./handlers/checkoutHandlers.js";
import { makeWebhookHandler, makeTestProductHandler, makeListPurchasesHandler, makeReplayPurchaseHandler } from "./handlers/webhookHandlers.js";
import { makeTestTtsHandler } from "./handlers/ttsHandlers.js";
import { makeOverlayHandler, makeConfigHandler, makeThanksMiddleware, makeLojaMiddleware, makeProductPanelHandler, makeProductPanelStatic, makeHomeHandler, makeNotFoundHandler, makeGoalHandler, makeDonateMiddleware } from "./handlers/pageHandlers.js";
import { makeOverlayStatic, makeUserAssetsStatic, makeConfigStatic, makeGoalStatic } from "./handlers/staticHandlers.js";
import { makeSseHandler } from "./handlers/sseHandlers.js";
import { logEvent, readRecentLogs } from "./services/logger.js";
import { pingMongo } from "./services/mongo.js";
import { sessionMiddleware, makeLoginHandler, makeLogoutHandler } from "./services/auth.js";
import { adminAuthMiddleware, makeAdminLoginHandler, makeAdminLogoutHandler } from "./services/adminAuth.js";
import { makeAdminPageHandler, makeAdminMeHandler, makeAdminUsersHandler, makeAdminLogsHandler } from "./handlers/adminHandlers.js";

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
  // Rodando atrás de proxy (Nginx): respeita X-Forwarded-* (ex.: protocolo HTTPS externo)
  app.set("trust proxy", true);
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

  // Admin (página + assets + APIs)
  app.use("/admin", express.static(path.join(rootDir, "src", "admin")));
  app.get("/admin", makeAdminPageHandler(rootDir));
  app.post("/admin/api/login", makeAdminLoginHandler());
  app.post("/admin/api/logout", makeAdminLogoutHandler());
  app.get("/admin/api/me", adminAuthMiddleware, makeAdminMeHandler());
  app.get("/admin/api/users", adminAuthMiddleware, makeAdminUsersHandler(rootDir));
  app.get("/admin/api/logs", adminAuthMiddleware, makeAdminLogsHandler(rootDir));

  // Página pública raiz (fallback explícito)
  app.get("/", (req, res) => {
    return res.sendFile(path.join(publicDir, "index.html"));
  });

  // Logs: removido do endpoint público; agora apenas via /admin

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
  userRouter.use("/goal", makeGoalStatic(rootDir));
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
  userRouter.post("/api/test-product", makeTestProductHandler(rootDir));
  userRouter.get("/api/purchases", makeListPurchasesHandler(rootDir));
  userRouter.post("/api/purchases/replay", makeReplayPurchaseHandler(rootDir));
  userRouter.get("/api/config", makeGetConfigHandler(rootDir));
  userRouter.post("/api/config", makeUpdateConfigHandler(rootDir));
  userRouter.post("/api/tts-test", makeTestTtsHandler(rootDir));
  userRouter.post("/api/init-db", makeInitDbHandler(rootDir));
  userRouter.get("/api/db-schema", makeDbSchemaHandler(rootDir));
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
  userRouter.use("/donate", makeDonateMiddleware(rootDir));
  userRouter.use("/thanks", makeThanksMiddleware(rootDir));
  userRouter.get("/overlay", makeOverlayHandler(rootDir));
  userRouter.get("/goal", makeGoalHandler(rootDir));
  userRouter.get("/", makeHomeHandler(rootDir));
  userRouter.use(makeNotFoundHandler(rootDir));

  // Redireciona apenas o slug raiz sem barra final (evita loop em /:user/)
  app.get(/^\/([^/]+)$/i, (req, res, next) => {
    const user = req.params[0];

    // Rotas públicas já tratadas mantêm comportamento normal
    if (["status", "admin"].includes(user)) return next();

    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    return res.redirect(302, `/${encodeURIComponent(user)}/${query}`);
  });

  app.use("/:user", userRouter);

  // Fallback global
  app.use(makeNotFoundHandler(rootDir));

  return app;
}

