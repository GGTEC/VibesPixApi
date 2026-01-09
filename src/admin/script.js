const TOKEN_KEY = "vibespix_admin_token";

function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

async function api(path, opts) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(opts?.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(path, {
    headers,
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
const elSidebar = document.querySelector(".sidebar");
const elMobileToggle = document.getElementById("mobileToggle");

function toggleSidebar(forceOpen) {
  if (!elSidebar) return;
  const next = typeof forceOpen === "boolean" ? forceOpen : !elSidebar.classList.contains("open");
  elSidebar.classList.toggle("open", next);
  if (elMobileToggle) elMobileToggle.setAttribute("aria-expanded", next ? "true" : "false");
}

elMobileToggle?.addEventListener("click", () => {
  toggleSidebar();
});

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
    btn.className = "nav-btn";
    btn.textContent = user;
    btn.addEventListener("click", async () => {
      for (const node of elUserButtons.querySelectorAll(".nav-btn")) {
        node.classList.remove("active");
      }
      btn.classList.add("active");
      elSelectedTitle.textContent = `Logs: ${user}`;
      const { logs } = await api(`/admin/api/logs?user=${encodeURIComponent(user)}&limit=200`);
      renderLogs(logs);

      // Em mobile, fecha o menu após selecionar.
      toggleSidebar(false);
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
    if (resp?.token) setToken(resp.token);
    showPanel(resp.username);
    try {
      await loadUsers();
    } catch (err) {
      // Mantém o painel aberto e mostra o erro nos logs (evita parecer que "não logou")
      elSelectedTitle.textContent = "Logs";
      elLogs.textContent = `Falha ao carregar usuários/logs: ${err?.message || err}`;
    }
  } catch (err) {
    showLogin(err);
  }
});

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  try {
    await api("/admin/api/logout", { method: "POST" });
  } finally {
    setToken(null);
    showLogin();
  }
});

init();
