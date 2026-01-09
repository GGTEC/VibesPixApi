import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
let clientPromise = null;

const ADMIN_DB_NAME = process.env.ADMIN_DB_NAME || "VibesAdmin";

async function getClient() {
  if (!clientPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 10 });
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function listDatabases() {
  const client = await getClient();
  const admin = client.db("admin");
  const resp = await admin.command({ listDatabases: 1, nameOnly: true });
  const dbs = Array.isArray(resp?.databases) ? resp.databases : [];
  return dbs.map((d) => d.name).filter(Boolean);
}

function sanitizeDbName(user) {
  const sanitized = String(user || "user").replace(/[^a-zA-Z0-9_-]/g, "_");
  return sanitized || "user";
}

export async function getDbForUser(user) {
  const client = await getClient();
  const dbName = sanitizeDbName(user);
  return client.db(dbName);
}

export async function getAdminDb() {
  const client = await getClient();
  return client.db(ADMIN_DB_NAME);
}

async function listCollectionNames(db) {
  const cols = await db.listCollections({}, { nameOnly: true }).toArray();
  return cols.map((c) => c.name);
}

async function createCollectionIfMissing(db, name, existingNamesSet) {
  if (existingNamesSet.has(name)) return false;
  try {
    await db.createCollection(name);
    existingNamesSet.add(name);
    return true;
  } catch (err) {
    // NamespaceExists (48) / already exists: outro processo pode ter criado
    const msg = String(err?.message || "");
    if (err?.code === 48 || /already exists/i.test(msg) || /NamespaceExists/i.test(msg)) {
      existingNamesSet.add(name);
      return false;
    }
    throw err;
  }
}

function isIgnorableIndexError(err) {
  const msg = String(err?.message || "");
  return (
    err?.codeName === "IndexOptionsConflict" ||
    /IndexOptionsConflict/i.test(msg) ||
    /already exists/i.test(msg)
  );
}

async function ensureIndexes(db) {
  // _id já é indexado automaticamente em todas as collections.

  // Produtos: cada doc tem `key` (id do produto)
  try {
    await db.collection("produtos").createIndex({ key: 1 }, { unique: true, name: "uniq_key" });
  } catch (err) {
    if (!isIgnorableIndexError(err)) throw err;
  }

  // Buyers temporários de checkout
  try {
    await db.collection("current_buyers").createIndex(
      { order_nsu: 1 },
      { unique: true, name: "uniq_order_nsu" }
    );
  } catch (err) {
    if (!isIgnorableIndexError(err)) throw err;
  }

  // TTL: expira automaticamente quando `expires_at` passa.
  // Mantemos a limpeza manual também (pruneExpiredCheckouts), mas isso ajuda a não crescer infinito.
  try {
    await db.collection("current_buyers").createIndex(
      { expires_at: 1 },
      { expireAfterSeconds: 0, name: "ttl_expires_at" }
    );
  } catch (err) {
    if (!isIgnorableIndexError(err)) throw err;
  }

  // Compras: listagem por data
  try {
    await db.collection("purchases").createIndex({ createdAt: -1 }, { name: "createdAt_desc" });
  } catch (err) {
    if (!isIgnorableIndexError(err)) throw err;
  }

  // Compras: referência do provedor (webhook) para deduplicação/consulta
  try {
    await db.collection("purchases").createIndex({ order_nsu: 1 }, { name: "order_nsu" });
  } catch (err) {
    if (!isIgnorableIndexError(err)) throw err;
  }
}

// Garante que um DB de usuário tenha todas as collections/índices necessários.
// Importante: isso é idempotente (pode rodar várias vezes).
export async function ensureUserDbSetup(user) {
  const db = await getDbForUser(user);
  const created = [];

  const existingNames = new Set(await listCollectionNames(db));

  for (const name of ["config", "rcon", "produtos", "current_buyers", "purchases"]) {
    // eslint-disable-next-line no-await-in-loop
    const didCreate = await createCollectionIfMissing(db, name, existingNames);
    if (didCreate) created.push(name);
  }

  await ensureIndexes(db);
  return { db, createdCollections: created };
}

// Setup do banco exclusivo do admin (collections e índices). Idempotente.
export async function ensureAdminDbSetup() {
  const db = await getAdminDb();
  const created = [];

  const existingNames = new Set(await listCollectionNames(db));

  for (const name of ["admins", "tokens"]) {
    // eslint-disable-next-line no-await-in-loop
    const didCreate = await createCollectionIfMissing(db, name, existingNames);
    if (didCreate) created.push(name);
  }

  // Admins: username único
  try {
    await db.collection("admins").createIndex({ username: 1 }, { unique: true, name: "uniq_username" });
  } catch (err) {
    if (!isIgnorableIndexError(err)) throw err;
  }

  // Tokens: token único e (opcionalmente) TTL
  try {
    await db.collection("tokens").createIndex({ token: 1 }, { unique: true, name: "uniq_token" });
  } catch (err) {
    if (!isIgnorableIndexError(err)) throw err;
  }

  try {
    await db.collection("tokens").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" });
  } catch (err) {
    if (!isIgnorableIndexError(err)) throw err;
  }

  return { db, createdCollections: created };
}

export async function getNamedDb(dbName) {
  if (!dbName) throw new Error("Database não informada");
  const client = await getClient();
  return client.db(dbName);
}

export async function pingMongo() {
  const client = await getClient();
  await client.db("admin").command({ ping: 1 });
  return true;
}
