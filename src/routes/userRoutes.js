import express from "express";
import { buildStaticRoutes } from "./staticRoutes.js";
import { buildSseRoutes } from "./sseRoutes.js";
import { buildWebhookRoutes } from "./webhookRoutes.js";
import { buildConfigRoutes } from "./configRoutes.js";
import { buildUploadRoutes } from "./uploadRoutes.js";
import { buildCheckoutRoutes } from "./checkoutRoutes.js";
import { buildPageRoutes } from "./pageRoutes.js";

export function buildUserRouter(rootDir, upload) {
  const router = express.Router({ mergeParams: true });

  router.use(buildStaticRoutes(rootDir));
  router.use(buildSseRoutes());
  router.use(buildWebhookRoutes(rootDir));

  router.use("/api", buildConfigRoutes(rootDir));
  router.use("/api", buildUploadRoutes(rootDir, upload));
  router.use("/api", buildCheckoutRoutes(rootDir));

  router.use(buildPageRoutes(rootDir));

  return router;
}
