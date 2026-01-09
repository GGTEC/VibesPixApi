async function api(path, opts) {
  const resp = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.error || resp.statusText || "Erro";
    throw new Error(msg);
  }
  return data;
}

const elLogin = document.getElementById("login");
const elPanel = document.getElementById("panel");
const elLoginError = document.getElementById("loginError");
const elAdminUser = document.getElementById("adminUser");
const elUserButtons = document.getElementById("userButtons");
const elLogs = document.getElementById("logs");
const elSelectedTitle = document.getElementById("selectedUserTitle");

function showLogin(err) {
  elPanel.hidden = true;
  elLogin.hidden = false;
  if (err) {
    elLoginError.hidden = false;
    elLoginError.textContent = String(err?.message || err);
  } else {
    elLoginError.hidden = true;
    elLoginError.textContent = "";
  }
}

function showPanel(username) {
  elLogin.hidden = true;
  elPanel.hidden = false;
  elAdminUser.textContent = username ? `Admin: ${username}` : "Admin";
}

function renderLogs(logs) {
  const lines = (Array.isArray(logs) ? logs : []).map((l) => {
    const ts = l?.ts || "";
    const level = l?.level || "";
    const user = l?.user || "";
    const msg = l?.message || "";
    return `${ts} [${level}] ${user}: ${msg}`.trim();
  });
  elLogs.textContent = lines.join("\n");
}

async function loadUsers() {
  const { users } = await api("/admin/api/users");
  elUserButtons.innerHTML = "";

  for (const user of users) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = user;
    btn.addEventListener("click", async () => {
      elSelectedTitle.textContent = `Logs: ${user}`;
      const { logs } = await api(`/admin/api/logs?user=${encodeURIComponent(user)}&limit=200`);
      renderLogs(logs);
    });
    elUserButtons.appendChild(btn);
  }
}

async function init() {
  try {
    const me = await api("/admin/api/me");
    showPanel(me.username);
    await loadUsers();
  } catch {
    showLogin();
  }
}

document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const username = form.username.value;
  const password = form.password.value;
  try {
    const resp = await api("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    showPanel(resp.username);
    await loadUsers();
  } catch (err) {
    showLogin(err);
  }
});

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  try {
    await api("/admin/api/logout", { method: "POST" });
  } finally {
    showLogin();
  }
});

init();
