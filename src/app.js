import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import fs from "fs";
import { buildUserRouter } from "./routes/userRoutes.js";

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

  const upload = multer({
    storage: createUserStorage(rootDir),
    limits: { fileSize: 5 * 1024 * 1024 }
  });

  app.use("/:user", buildUserRouter(rootDir, upload));

  return app;
}
