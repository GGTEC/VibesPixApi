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
const elMetricsPurchases = document.getElementById("metricsPurchases");

const elSectionTest = document.getElementById("sectionTest");
const elSectionLogs = document.getElementById("sectionLogs");
const elSectionMetrics = document.getElementById("sectionMetrics");

let selectedUser = null;
let selectedSection = null; // 'test' | 'logs' | 'metrics'

function showOnlySection(section) {
  selectedSection = section || null;
  if (elSectionTest) elSectionTest.hidden = selectedSection !== "test";
  if (elSectionLogs) elSectionLogs.hidden = selectedSection !== "logs";
  if (elSectionMetrics) elSectionMetrics.hidden = selectedSection !== "metrics";

  // Mantém a seção visível expandida.
  const map = {
    test: elSectionTest,
    logs: elSectionLogs,
    metrics: elSectionMetrics
  };
  const target = map[selectedSection];
  if (target) {
    target.dataset.collapsed = "false";
    const btn = target.querySelector(".collapsible-toggle");
    if (btn) btn.setAttribute("aria-expanded", "true");
  }
}

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

    showOnlySection(null);
  }
}

async function loadLogsForUser(user) {
  const { logs } = await api(`/admin/api/logs?user=${encodeURIComponent(user)}&limit=200`);
  renderLogs(logs);
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

function getCssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

function formatPurchaseLine(p) {
  const ts = p?.createdAt ? String(p.createdAt) : "";
  const username = p?.username ? String(p.username) : "";
  const src = p?.source ? String(p.source) : "";
  const nsu = p?.order_nsu ? String(p.order_nsu) : "";
  const v = Number(p?.totalValue);
  const money = formatCurrencyBRL(v);
  const msg = p?.overlayMessage ? String(p.overlayMessage) : "";
  return `${ts} | ${money} | ${username} | ${src}${nsu ? ` | ${nsu}` : ""}${msg ? ` | ${msg}` : ""}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (typeof text === "string") node.textContent = text;
  return node;
}

function toPtBrDateTime(isoLike) {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return isoLike ? String(isoLike) : "—";
  return d.toLocaleString("pt-BR");
}

function calcDaysInclusive(fromIso, toIso) {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

function renderMetricsSummary(resp) {
  if (!elMetricsResult) return;
  elMetricsResult.innerHTML = "";

  const count = Number(resp?.count) || 0;
  const totalValue = Number(resp?.totalValue) || 0;
  const avg = count > 0 ? totalValue / count : 0;
  const days = calcDaysInclusive(resp?.from, resp?.to);

  const cards = el("div", "metrics-cards");
  const c1 = el("div", "metric-card");
  c1.appendChild(el("div", "metric-label", "Total recebido"));
  c1.appendChild(el("div", "metric-value", formatCurrencyBRL(totalValue)));

  const c2 = el("div", "metric-card");
  c2.appendChild(el("div", "metric-label", "Transações"));
  c2.appendChild(el("div", "metric-value", String(count)));

  const c3 = el("div", "metric-card");
  c3.appendChild(el("div", "metric-label", "Ticket médio"));
  c3.appendChild(el("div", "metric-value", formatCurrencyBRL(avg)));

  cards.appendChild(c1);
  cards.appendChild(c2);
  cards.appendChild(c3);
  elMetricsResult.appendChild(cards);

  const sub = el("div", "metric-sub");
  sub.appendChild(el("span", "metric-pill", `Usuário: ${resp?.user || "—"}`));
  sub.appendChild(el("span", "metric-pill", `De: ${toPtBrDateTime(resp?.from)}`));
  sub.appendChild(el("span", "metric-pill", `Até: ${toPtBrDateTime(resp?.to)}`));
  if (days != null) sub.appendChild(el("span", "metric-pill", `Dias: ${days}`));
  if (resp?.truncated) sub.appendChild(el("span", "metric-pill", "Lista truncada (limite atingido)"));
  elMetricsResult.appendChild(sub);
}

function renderPurchasesTable(purchases) {
  if (!elMetricsPurchases) return;
  elMetricsPurchases.innerHTML = "";

  const head = el("div", "purchase-row purchase-head");
  head.appendChild(el("div", "purchase-cell", "Data/Hora"));
  head.appendChild(el("div", "purchase-cell purchase-right", "Valor"));
  head.appendChild(el("div", "purchase-cell", "Usuário"));
  const srcHead = el("div", "purchase-cell purchase-hide-mobile", "Fonte");
  head.appendChild(srcHead);
  const msgHead = el("div", "purchase-cell purchase-hide-mobile", "Mensagem/NSU");
  head.appendChild(msgHead);
  elMetricsPurchases.appendChild(head);

  const arr = Array.isArray(purchases) ? purchases : [];
  if (!arr.length) {
    const row = el("div", "purchase-row");
    row.appendChild(el("div", "purchase-cell purchase-mono", "—"));
    row.appendChild(el("div", "purchase-cell purchase-right", formatCurrencyBRL(0)));
    row.appendChild(el("div", "purchase-cell", "Sem compras no período"));
    row.appendChild(el("div", "purchase-cell purchase-hide-mobile", "—"));
    row.appendChild(el("div", "purchase-cell purchase-hide-mobile", "—"));
    elMetricsPurchases.appendChild(row);
    return;
  }

  for (const p of arr) {
    const row = el("div", "purchase-row");
    row.appendChild(el("div", "purchase-cell purchase-mono", toPtBrDateTime(p?.createdAt)));
    row.appendChild(el("div", "purchase-cell purchase-right purchase-mono", formatCurrencyBRL(p?.totalValue)));

    const u = p?.username ? String(p.username) : "—";
    row.appendChild(el("div", "purchase-cell", u));

    const src = p?.source ? String(p.source) : "—";
    const srcCell = el("div", "purchase-cell purchase-hide-mobile");
    srcCell.appendChild(el("span", "purchase-badge", src));
    row.appendChild(srcCell);

    const nsu = p?.order_nsu ? String(p.order_nsu) : "";
    const msg = p?.overlayMessage ? String(p.overlayMessage) : (p?.ttsText ? String(p.ttsText) : "");
    const info = [nsu && `NSU: ${nsu}`, msg].filter(Boolean).join(" · ") || "—";
    row.appendChild(el("div", "purchase-cell purchase-hide-mobile", info));

    elMetricsPurchases.appendChild(row);
  }
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
    const item = document.createElement("div");
    item.className = "user-item";
    item.dataset.open = "false";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "user-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.appendChild(document.createTextNode(user));
    const chevron = document.createElement("span");
    chevron.className = "user-chevron";
    chevron.setAttribute("aria-hidden", "true");
    toggle.appendChild(chevron);

    const subnav = document.createElement("div");
    subnav.className = "user-subnav";
    subnav.hidden = true;

    const makeSub = (label, section) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "user-subbtn";
      b.textContent = label;
      b.dataset.section = section;
      b.addEventListener("click", async () => {
        // ativa visual
        for (const node of elUserButtons.querySelectorAll(".user-subbtn")) {
          node.classList.remove("active");
        }
        b.classList.add("active");

        setSelectedUser(user);
        showOnlySection(section);

        if (elSelectedTitle) elSelectedTitle.textContent = `${label}: ${user}`;

        if (section === "test") {
          await loadTestOptionsForUser(user);
        }

        if (section === "logs") {
          await loadLogsForUser(user);
        }

        // Métricas: não auto-calcula (depende do período), só mostra a seção.

        // Em mobile, fecha o menu após escolher.
        toggleSidebar(false);
      });
      return b;
    };

    subnav.appendChild(makeSub("Teste de produto", "test"));
    subnav.appendChild(makeSub("Logs", "logs"));
    subnav.appendChild(makeSub("Métricas", "metrics"));

    toggle.addEventListener("click", () => {
      const open = item.dataset.open === "true";

      // Fecha os demais para ficar organizado.
      for (const other of elUserButtons.querySelectorAll(".user-item")) {
        if (other === item) continue;
        other.dataset.open = "false";
        const s = other.querySelector(".user-subnav");
        if (s) s.hidden = true;
        const t = other.querySelector(".user-toggle");
        if (t) t.setAttribute("aria-expanded", "false");
      }

      item.dataset.open = open ? "false" : "true";
      subnav.hidden = open;
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
    });

    item.appendChild(toggle);
    item.appendChild(subnav);
    elUserButtons.appendChild(item);
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
    if (elMetricsPurchases) elMetricsPurchases.hidden = true;

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
      renderMetricsSummary({ ...resp, ...out });
    }

    const purchases = Array.isArray(resp?.purchases) ? resp.purchases : [];
    if (elMetricsPurchases) {
      elMetricsPurchases.hidden = false;
      renderPurchasesTable(purchases);
    }
  } catch (err) {
    if (elMetricsResult) {
      elMetricsResult.hidden = false;
      elMetricsResult.classList.add("admin-error");
      elMetricsResult.textContent = `Erro: ${err?.message || err}`;
    }
    if (elMetricsPurchases) elMetricsPurchases.hidden = true;
  } finally {
    if (elMetricsBtn) elMetricsBtn.disabled = !selectedUser;
  }
});

init();
