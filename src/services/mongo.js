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
  return `overlay_${String(user || "user").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export async function getDbForUser(user) {
  const client = await getClient();
  const dbName = sanitizeDbName(user);
  return client.db(dbName);
}
