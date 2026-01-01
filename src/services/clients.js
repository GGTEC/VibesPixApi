const clients = {};

export function addClient(user, res) {
  clients[user] ??= [];
  clients[user].push(res);
}

export function removeClient(user, res) {
  if (!clients[user]) return;
  clients[user] = clients[user].filter(c => c !== res);
}

export function broadcastEvent(user, event, payload) {
  if (!clients[user]) return;
  const data = typeof payload === "string" ? payload : JSON.stringify(payload);
  for (const client of clients[user]) {
    client.write(`event: ${event}\ndata: ${data}\n\n`);
  }
}
