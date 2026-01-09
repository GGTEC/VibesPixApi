const clients = {};

function userKey(user) {
  return String(user || "").toLowerCase();
}

export function addClient(user, res) {
  const key = userKey(user);
  if (!key) return;
  clients[key] ??= [];
  clients[key].push(res);
}

export function removeClient(user, res) {
  const key = userKey(user);
  if (!key || !clients[key]) return;
  clients[key] = clients[key].filter(c => c !== res);
}

export function broadcastEvent(user, event, payload) {
  const key = userKey(user);
  if (!key || !clients[key]) return;
  const data = typeof payload === "string" ? payload : JSON.stringify(payload);
  for (const client of clients[key]) {
    client.write(`event: ${event}\ndata: ${data}\n\n`);
  }
}
