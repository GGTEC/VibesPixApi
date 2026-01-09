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
const elSelectedUserLabel = document.getElementById("selectedUserLabel");
const elTestProductForm = document.getElementById("testProductForm");
const elTestProductBtn = document.getElementById("testProductBtn");
const elTestProductResult = document.getElementById("testProductResult");
const elUserPanel = document.getElementById("userPanel");
const elProductOptions = document.getElementById("productOptions");
const elVoiceOptions = document.getElementById("voiceOptions");
const elMetricsForm = document.getElementById("metricsForm");
const elMetricsBtn = document.getElementById("metricsBtn");
const elMetricsResult = document.getElementById("metricsResult");

let selectedUser = null;

function setSelectedUser(user) {
  selectedUser = user || null;
  if (elSelectedUserLabel) elSelectedUserLabel.textContent = selectedUser || "—";
  if (elTestProductBtn) elTestProductBtn.disabled = !selectedUser;
  if (elMetricsBtn) elMetricsBtn.disabled = !selectedUser;

  if (elUserPanel) elUserPanel.hidden = !selectedUser;

  // Ao selecionar um usuário, reabre as seções por padrão.
  if (selectedUser) {
    for (const el of document.querySelectorAll("[data-collapsible]")) {
      el.dataset.collapsed = "false";
      const btn = el.querySelector(".collapsible-toggle");
      if (btn) btn.setAttribute("aria-expanded", "true");
    }
  }

  if (!selectedUser) {
    if (elSelectedTitle) elSelectedTitle.textContent = "Logs";
    if (elLogs) elLogs.textContent = "";
    if (elTestProductResult) elTestProductResult.hidden = true;
    if (elMetricsResult) elMetricsResult.hidden = true;
  }
}

function formatCurrencyBRL(value) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isoFromDateInput(dateStr, isEnd) {
  // dateStr: YYYY-MM-DD
  if (!dateStr) return null;
  const base = `${dateStr}T${isEnd ? "23:59:59.999" : "00:00:00.000"}`;
  const d = new Date(base);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function initCollapsibles() {
  for (const el of document.querySelectorAll("[data-collapsible]")) {
    // estado inicial: expandido
    if (!el.dataset.collapsed) el.dataset.collapsed = "false";

    const btn = el.querySelector(".collapsible-toggle");
    if (!btn) continue;

    btn.addEventListener("click", () => {
      const collapsed = el.dataset.collapsed === "true";
      const next = !collapsed;
      el.dataset.collapsed = next ? "true" : "false";
      btn.setAttribute("aria-expanded", next ? "false" : "true");
    });
  }
}

function fillDatalist(el, values) {
  if (!el) return;
  el.innerHTML = "";
  for (const v of Array.isArray(values) ? values : []) {
    const opt = document.createElement("option");
    opt.value = String(v);
    el.appendChild(opt);
  }
}

async function loadTestOptionsForUser(user) {
  try {
    const data = await api(`/admin/api/test-options?user=${encodeURIComponent(user)}`);
    fillDatalist(elProductOptions, data?.products || []);
    fillDatalist(elVoiceOptions, data?.voices?.allowed || []);

    // Sugere a voz atual/padrão (sem forçar)
    if (elTestProductForm?.ttsVoice) {
      const current = (data?.voices?.current || "").toString().trim();
      const def = (data?.voices?.default || "").toString().trim();
      if (!elTestProductForm.ttsVoice.value) {
        elTestProductForm.ttsVoice.value = current || def || "";
      }
    }
  } catch (err) {
    // Não bloqueia o teste; apenas não preenche listas.
    showTestResult({ error: `Falha ao carregar produtos/vozes: ${err?.message || err}` }, true);
  }
}

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

  setSelectedUser(null);

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
      setSelectedUser(user);
      await loadTestOptionsForUser(user);
      elSelectedTitle.textContent = `Logs: ${user}`;
      const { logs } = await api(`/admin/api/logs?user=${encodeURIComponent(user)}&limit=200`);
      renderLogs(logs);

      // Em mobile, fecha o menu após selecionar.
      toggleSidebar(false);
    });
    elUserButtons.appendChild(btn);
  }
}

function showTestResult(obj, isError = false) {
  if (!elTestProductResult) return;
  elTestProductResult.hidden = false;
  elTestProductResult.classList.toggle("admin-error", !!isError);
  elTestProductResult.textContent =
    typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

async function init() {
  try {
    const me = await api("/admin/api/me");
    showPanel(me.username);
    initCollapsibles();
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

elTestProductForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedUser) {
    showTestResult("Selecione um usuário na sidebar.", true);
    return;
  }

  const form = e.currentTarget;
  const productId = form.productId.value.trim();
  const quantity = Number(form.quantity.value || 1);
  const username = form.username.value.trim();
  const ttsText = form.ttsText.value.trim();
  const simulateOverlay = !!form.simulateOverlay.checked;
  const ttsVoice = form.ttsVoice.value.trim();

  try {
    if (elTestProductBtn) elTestProductBtn.disabled = true;
    showTestResult("Executando...", false);
    const resp = await api("/admin/api/test-product", {
      method: "POST",
      body: JSON.stringify({
        user: selectedUser,
        productId,
        quantity,
        username: username || undefined,
        ttsText: ttsText || "",
        simulateOverlay,
        ttsVoice: ttsVoice || null
      })
    });
    showTestResult(resp, false);
  } catch (err) {
    showTestResult({ error: err?.message || String(err) }, true);
  } finally {
    if (elTestProductBtn) elTestProductBtn.disabled = !selectedUser;
  }
});

elMetricsForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedUser) {
    if (elMetricsResult) {
      elMetricsResult.hidden = false;
      elMetricsResult.classList.add("admin-error");
      elMetricsResult.textContent = "Selecione um usuário na sidebar.";
    }
    return;
  }

  const form = e.currentTarget;
  const fromIso = isoFromDateInput(form.from.value, false);
  const toIso = isoFromDateInput(form.to.value, true);

  if (!fromIso || !toIso) {
    if (elMetricsResult) {
      elMetricsResult.hidden = false;
      elMetricsResult.classList.add("admin-error");
      elMetricsResult.textContent = "Informe um período válido.";
    }
    return;
  }

  try {
    if (elMetricsBtn) elMetricsBtn.disabled = true;
    if (elMetricsResult) {
      elMetricsResult.hidden = false;
      elMetricsResult.classList.remove("admin-error");
      elMetricsResult.textContent = "Calculando...";
    }

    const resp = await api(
      `/admin/api/metrics?user=${encodeURIComponent(selectedUser)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`
    );

    const out = {
      user: resp.user,
      from: resp.from,
      to: resp.to,
      count: resp.count,
      totalValue: resp.totalValue,
      totalValueFormatted: formatCurrencyBRL(resp.totalValue)
    };

    if (elMetricsResult) {
      elMetricsResult.hidden = false;
      elMetricsResult.classList.remove("admin-error");
      elMetricsResult.textContent = JSON.stringify(out, null, 2);
    }
  } catch (err) {
    if (elMetricsResult) {
      elMetricsResult.hidden = false;
      elMetricsResult.classList.add("admin-error");
      elMetricsResult.textContent = `Erro: ${err?.message || err}`;
    }
  } finally {
    if (elMetricsBtn) elMetricsBtn.disabled = !selectedUser;
  }
});

init();
