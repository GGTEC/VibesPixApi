import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
let clientPromise = null;

async function getClient() {
  if (!clientPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 10 });
    clientPromise = client.connect();
  }
  return clientPromise;
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
