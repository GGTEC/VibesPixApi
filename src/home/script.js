// Contexto base
const pathParts = window.location.pathname.split("/").filter(Boolean);
const user = pathParts[0] || "";
const baseApi = `/${user}/api`;
const defaultSounds = ["default.mp3", "alert1.mp3", "alert2.mp3"];
const ttsVoices = [
  {
    value: "pt-BR-ThalitaMultilingualNeural",
    label: "pt-BR - ThalitaMultilingualNeural (Feminino)",
  },
  { value: "pt-BR-AntonioNeural", label: "pt-BR - AntonioNeural (Masculino)" },
  {
    value: "pt-BR-FranciscaNeural",
    label: "pt-BR - FranciscaNeural (Feminino)",
  },
  { value: "pt-PT-DuarteNeural", label: "pt-PT - DuarteNeural (Masculino)" },
  { value: "pt-PT-RaquelNeural", label: "pt-PT - RaquelNeural (Feminino)" },
];

const colorDefaults = {
  "bar-bg": "#0f172a",
  "bar-fill": "#22d3ee",
  "text-color": "#e5e7eb",
};

const colorSetters = {};

function normalizeHex(value, fallback) {
  const hex = (value || "").trim();
  const regex = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
  return regex.test(hex) ? hex.toLowerCase() : fallback;
}

function setupColorControl(key) {
  const picker = document.getElementById(`goal-${key}-picker`);
  const text = document.getElementById(`goal-${key}-text`);
  const swatch = document.getElementById(`goal-${key}-swatch`);
  const fallback = colorDefaults[key] || "#000000";
  if (!picker || !text || !swatch) return () => {};

  const apply = (val) => {
    const safe = normalizeHex(val, fallback);
    picker.value = safe;
    text.value = safe;
    swatch.style.background = safe;
  };

  const fromPicker = () => apply(picker.value);
  const fromText = () => apply(text.value);

  picker.addEventListener("input", fromPicker);
  text.addEventListener("input", fromText);
  [text, swatch].forEach((el) =>
    el.addEventListener("click", () => picker.click())
  );

  apply(fallback);
  return apply;
}

function initColorControls() {
  ["bar-bg", "bar-fill", "text-color"].forEach((key) => {
    colorSetters[key] = setupColorControl(key);
  });
}

function readColorValue(key) {
  const text = document.getElementById(`goal-${key}-text`);
  const fallback = colorDefaults[key] || "#000000";
  return normalizeHex(text?.value, fallback);
}

let loggedIn = false;
let configCache = null;
let produtos = {};
let purchases = [];
let imagens = [];
let modalOpen = false;
let currentImageTarget = "product";
let currentMainTab = "rcon";

const toastContainer = document.getElementById("toast-container");
function showToast(message, isError = false) {
  if (!toastContainer) return alert(message);
  const el = document.createElement("div");
  el.className = `toast${isError ? " error" : ""}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-10px)";
    setTimeout(() => el.remove(), 400);
  }, 3200);
}

function formatPriceCents(cents) {
  const n = Number(cents) || 0;
  return "R$ " + (n / 100).toFixed(2);
}

function formatCurrencyBRL(valueReais) {
  const n = Number(valueReais);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isoFromDateInput(dateStr, isEnd) {
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

function renderMetricsSummary(container, resp) {
  if (!container) return;
  container.innerHTML = "";

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
  container.appendChild(cards);

  const sub = el("div", "metric-sub");
  sub.appendChild(el("span", "metric-pill", `De: ${toPtBrDateTime(resp?.from)}`));
  sub.appendChild(el("span", "metric-pill", `Até: ${toPtBrDateTime(resp?.to)}`));
  if (days != null) sub.appendChild(el("span", "metric-pill", `Dias: ${days}`));
  if (resp?.truncated) sub.appendChild(el("span", "metric-pill", "Lista truncada (limite atingido)"));
  container.appendChild(sub);
}

function renderPurchasesTable(container, purchasesArr) {
  if (!container) return;
  container.innerHTML = "";

  const head = el("div", "purchase-row purchase-head");
  head.appendChild(el("div", "purchase-cell", "Data/Hora"));
  head.appendChild(el("div", "purchase-cell purchase-right", "Valor"));
  head.appendChild(el("div", "purchase-cell", "Usuário"));
  head.appendChild(el("div", "purchase-cell purchase-hide-mobile", "Fonte"));
  head.appendChild(el("div", "purchase-cell purchase-hide-mobile", "Mensagem/NSU"));
  container.appendChild(head);

  const arr = Array.isArray(purchasesArr) ? purchasesArr : [];
  if (!arr.length) {
    const row = el("div", "purchase-row");
    row.appendChild(el("div", "purchase-cell purchase-mono", "—"));
    row.appendChild(el("div", "purchase-cell purchase-right", formatCurrencyBRL(0)));
    row.appendChild(el("div", "purchase-cell", "Sem compras no período"));
    row.appendChild(el("div", "purchase-cell purchase-hide-mobile", "—"));
    row.appendChild(el("div", "purchase-cell purchase-hide-mobile", "—"));
    container.appendChild(row);
    return;
  }

  for (const p of arr) {
    const row = el("div", "purchase-row");
    row.appendChild(el("div", "purchase-cell purchase-mono", toPtBrDateTime(p?.createdAt)));
    row.appendChild(el("div", "purchase-cell purchase-right purchase-mono", formatCurrencyBRL(p?.totalValue)));
    row.appendChild(el("div", "purchase-cell", p?.username ? String(p.username) : "—"));

    const srcCell = el("div", "purchase-cell purchase-hide-mobile");
    const src = p?.source ? String(p.source) : "—";
    srcCell.appendChild(el("span", "purchase-badge", src));
    row.appendChild(srcCell);

    const nsu = p?.order_nsu ? String(p.order_nsu) : "";
    const msg = p?.overlayMessage ? String(p.overlayMessage) : (p?.ttsText ? String(p.ttsText) : "");
    const info = [nsu && `NSU: ${nsu}`, msg].filter(Boolean).join(" · ") || "—";
    row.appendChild(el("div", "purchase-cell purchase-hide-mobile", info));

    container.appendChild(row);
  }
}

// Navegação lateral
const mainTabs = Array.from(document.querySelectorAll(".nav-btn[data-main]"));
const actionBarConfig = document.getElementById("action-bar-config");
const actionBarStore = document.getElementById("action-bar-store");
const mainSections = {
  rcon: document.getElementById("rcon-section"),
  checkout: document.getElementById("checkout-section"),
  sound: document.getElementById("sound-section"),
  overlay: document.getElementById("overlay-section"),
  goal: document.getElementById("goal-section"),
  tts: document.getElementById("tts-section"),
  storeconfig: document.getElementById("storeconfig-section"),
  store: document.getElementById("store-section"),
  metrics: document.getElementById("metrics-section"),
  purchases: document.getElementById("purchases-section"),
};

const CONFIG_MAIN_TABS = new Set([
  "rcon",
  "checkout",
  "sound",
  "overlay",
  "goal",
  "tts",
  "storeconfig",
]);

function updateFloatingButtons() {
  if (!loggedIn) {
    actionBarConfig?.classList.add("hidden");
    actionBarStore?.classList.add("hidden");
    return;
  }
  if (CONFIG_MAIN_TABS.has(currentMainTab)) {
    actionBarConfig?.classList.remove("hidden");
    actionBarStore?.classList.add("hidden");
  } else if (currentMainTab === "store") {
    const formVisible = !document
      .getElementById("productFormSection")
      .classList.contains("hidden");
    if (formVisible) {
      actionBarStore?.classList.remove("hidden");
    } else {
      actionBarStore?.classList.add("hidden");
    }
    actionBarConfig?.classList.add("hidden");
  } else {
    actionBarConfig?.classList.add("hidden");
    actionBarStore?.classList.add("hidden");
  }
}

function setMainTab(target) {
  currentMainTab = target;
  mainTabs.forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.main === target)
  );
  Object.entries(mainSections).forEach(([key, section]) => {
    section?.classList.toggle("hidden", key !== target);
  });
  const sidebar = document.querySelector(".sidebar");
  if (sidebar && sidebar.classList.contains("open"))
    sidebar.classList.remove("open");
  updateFloatingButtons();
}

mainTabs.forEach((btn) =>
  btn.addEventListener("click", () => setMainTab(btn.dataset.main))
);
setMainTab("rcon");
initColorControls();

// Login
const loginLayer = document.getElementById("login-layer");
const mobileToggle = document.getElementById("mobile-toggle");
document.getElementById("login-btn").onclick = async function () {
  const identifier = document.getElementById("login-identifier").value.trim();
  const password = document.getElementById("login-password").value;
  document.getElementById("login-erro").classList.add("hidden");
  try {
    const res = await fetch(`${baseApi}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ identifier, password }),
    });
    if (!res.ok) throw new Error("Credenciais inválidas");
    loggedIn = true;
    await boot();
    loginLayer.classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    mobileToggle.classList.remove("hidden");
  } catch (err) {
    document.getElementById("login-erro").textContent =
      err.message || "Credenciais inválidas";
    document.getElementById("login-erro").classList.remove("hidden");
  }
};

document.getElementById("logout-btn").onclick = async function () {
  try {
    await fetch(`${baseApi}/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {}
  loggedIn = false;
  document.getElementById("app").classList.add("hidden");
  loginLayer.classList.remove("hidden");
  mobileToggle.classList.add("hidden");
  updateFloatingButtons();
};

// Mobile toggle
mobileToggle.addEventListener("click", () => {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  sidebar.classList.toggle("open");
});

async function trySessionLogin() {
  try {
    await boot();
    loggedIn = true;
    loginLayer.classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    mobileToggle.classList.remove("hidden");
    updateFloatingButtons();
  } catch (_) {
    // sessão inválida: manter tela de login
    mobileToggle.classList.add("hidden");
    updateFloatingButtons();
  }
}

// Config (RCON/overlay/etc)
const tabButtons = subTabs;
const tabContents = Array.from(document.querySelectorAll(".tab-content"));

function addSoundOption(name, selectIt = false) {
  if (!name) return;
  const select = document.getElementById("sound");
  const exists = Array.from(select.options).some((o) => o.value === name);
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  if (selectIt) select.value = name;
}

async function loadSoundList() {
  const select = document.getElementById("sound");
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione um áudio";
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);
  defaultSounds.forEach((s) => addSoundOption(s));
  try {
    const res = await fetch(`${baseApi}/list-sounds`, {
      credentials: "include",
    });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {}
    if (!res.ok) throw new Error(data?.error || raw || "Erro ao listar áudios");
    (data?.files || []).forEach((f) => addSoundOption(f.name));
  } catch (err) {
    showToast(err.message || "Falha ao carregar áudios", true);
  }
}

function populateTtsVoiceList() {
  const select = document.getElementById("tts-voice");
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione a voz";
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);
  ttsVoices.forEach((voice) => {
    const opt = document.createElement("option");
    opt.value = voice.value;
    opt.textContent = voice.label;
    select.appendChild(opt);
  });
}

async function uploadSound(file) {
  const statusEl = document.getElementById("sound-file-name");
  try {
    statusEl.textContent = "Enviando...";
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${baseApi}/upload-sound`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {}
    if (!res.ok) throw new Error(data?.error || raw || "Falha no upload");
    const filename = data?.filename || file.name;
    addSoundOption(filename, true);
    statusEl.textContent = filename;
    showToast("Áudio enviado!");
  } catch (err) {
    statusEl.textContent = "Selecione um arquivo";
    showToast(err.message || "Erro ao enviar áudio", true);
  } finally {
    const input = document.getElementById("sound-upload");
    if (input) input.value = "";
  }
}

async function carregarConfig() {
  await loadSoundList();
  populateTtsVoiceList();
  const res = await fetch(`${baseApi}/config`, { credentials: "include" });
  if (!res.ok) throw new Error("Credenciais inválidas");
  const data = await res.json();
  configCache = data;
  document.getElementById("host").value = data.rcon?.host || "";
  document.getElementById("port").value = data.rcon?.port || "";
  document.getElementById("password").value = data.rcon?.password || "";
  addSoundOption(data.sound);
  document.getElementById("sound").value = data.sound || "";
  document.getElementById("infinitypay-handle").value =
    data.infinitypayHandle || "";
  document.getElementById("overlay-message").value = data.overlayMessage || "";
  if (data.ttsVoice) document.getElementById("tts-voice").value = data.ttsVoice;
  const overlayLink = document.getElementById("overlay-link");
  overlayLink.value = `${location.origin}/${encodeURIComponent(user)}/overlay`;

  // Estilo do alerta (overlay)
  const overlayAlert = data.overlayAlert || {};
  const bgTypeEl = document.getElementById("overlay-alert-bg-type");
  const bgColorEl = document.getElementById("overlay-alert-bg-color");
  const bgImageEl = document.getElementById("overlay-alert-bg-image");
  const fontTagEl = document.getElementById("overlay-font-tag");
  const fontMsgEl = document.getElementById("overlay-font-message");
  const testUserEl = document.getElementById("overlay-test-username");
  const testValueEl = document.getElementById("overlay-test-value");
  const testMsgEl = document.getElementById("overlay-test-message");

  if (bgTypeEl) bgTypeEl.value = overlayAlert.backgroundType || "default";
  if (bgColorEl) bgColorEl.value = overlayAlert.backgroundColor || "#0d1016";
  if (bgImageEl) bgImageEl.value = overlayAlert.backgroundImageUrl || "";
  if (fontTagEl) fontTagEl.value = overlayAlert.fontTagPx ?? "";
  if (fontMsgEl) fontMsgEl.value = overlayAlert.fontMessagePx ?? "";

  if (testUserEl && !testUserEl.value) testUserEl.value = "Teste";
  if (testValueEl && !testValueEl.value) testValueEl.value = "5";
  if (testMsgEl && !testMsgEl.value) testMsgEl.value = "Isso é um alerta de teste.";

  updateOverlayAlertUi();

  // Loja - nome, lead e imagens
  const bannerBg =
    data.home?.bannerBg || data.home?.leadBg || data.home?.leadBackground || "";
  const pageBg = data.home?.pageBg || data.home?.storeBg || "";
  document.getElementById("store-name").value = data.home?.name || "";
  document.getElementById("store-lead").value = data.home?.lead || "";
  setImageValue(bannerBg, "lead");
  setImageValue(pageBg, "store");

  const goal = data.overlayGoal || {};
  document.getElementById("goal-target").value = goal.target ?? "";
  document.getElementById("goal-current").value = goal.current ?? "";
  document.getElementById("goal-text-template").value = goal.textTemplate || "";
  document.getElementById("goal-text-position").value =
    goal.textPosition === "above" ? "above" : "inside";
  document.getElementById("goal-show-currency").checked =
    goal.showCurrencySymbol !== false;
  if (colorSetters["bar-bg"])
    colorSetters["bar-bg"](goal.barBgColor || colorDefaults["bar-bg"]);
  if (colorSetters["bar-fill"])
    colorSetters["bar-fill"](goal.barFillColor || colorDefaults["bar-fill"]);
  if (colorSetters["text-color"])
    colorSetters["text-color"](goal.textColor || colorDefaults["text-color"]);
  document.getElementById("goal-overlay-link").value = `${
    location.origin
  }/${encodeURIComponent(user)}/goal`;
}

async function salvarConfig() {
  try {
    const overlayGoal = {
      target: Number(document.getElementById("goal-target").value) || 0,
      current: Number(document.getElementById("goal-current").value) || 0,
      textTemplate:
        document.getElementById("goal-text-template").value.trim() || undefined,
      textPosition:
        document.getElementById("goal-text-position").value === "above"
          ? "above"
          : "inside",
      showCurrencySymbol: document.getElementById("goal-show-currency").checked,
      barBgColor: readColorValue("bar-bg"),
      barFillColor: readColorValue("bar-fill"),
      textColor: readColorValue("text-color"),
    };

    const overlayAlert = {
      backgroundType: document.getElementById("overlay-alert-bg-type")?.value || "default",
      backgroundColor: document.getElementById("overlay-alert-bg-color")?.value || undefined,
      backgroundImageUrl:
        document.getElementById("overlay-alert-bg-image")?.value?.trim() || undefined,
      fontTagPx: Number(document.getElementById("overlay-font-tag")?.value) || undefined,
      fontMessagePx: Number(document.getElementById("overlay-font-message")?.value) || undefined
    };

    await fetch(`${baseApi}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        rcon: { host: host.value, port: port.value, password: password.value },
        sound: sound.value?.trim() || undefined,
        infinitypayHandle:
          document.getElementById("infinitypay-handle").value.trim() ||
          undefined,
        overlayMessage:
          document.getElementById("overlay-message").value.trim() || undefined,
        ttsVoice: document.getElementById("tts-voice").value || undefined,
        overlayGoal,
        overlayAlert,
        home: {
          name: document.getElementById("store-name").value.trim() || undefined,
          lead: document.getElementById("store-lead").value.trim() || undefined,
          bannerBg:
            document.getElementById("store-lead-bg-url").value.trim() ||
            undefined,
          leadBg:
            document.getElementById("store-lead-bg-url").value.trim() ||
            undefined,
          pageBg:
            document.getElementById("store-bg-url").value.trim() || undefined,
          storeBg:
            document.getElementById("store-bg-url").value.trim() || undefined,
        },
      }),
    });
    configCache = configCache || {};
    configCache.overlayGoal = overlayGoal;
    configCache.overlayAlert = overlayAlert;
    configCache.home = configCache.home || {};
    configCache.home.name =
      document.getElementById("store-name").value.trim() || undefined;
    configCache.home.lead =
      document.getElementById("store-lead").value.trim() || undefined;
    configCache.home.bannerBg =
      document.getElementById("store-lead-bg-url").value.trim() || undefined;
    configCache.home.leadBg =
      document.getElementById("store-lead-bg-url").value.trim() || undefined;
    configCache.home.pageBg =
      document.getElementById("store-bg-url").value.trim() || undefined;
    configCache.home.storeBg =
      document.getElementById("store-bg-url").value.trim() || undefined;
    showToast("Configurações salvas!");
  } catch {
    showToast("Erro ao salvar!", true);
  }
}

function updateOverlayAlertUi() {
  const type = document.getElementById("overlay-alert-bg-type")?.value || "default";
  const colorWrap = document.getElementById("overlay-alert-bg-color-wrap");
  const imageWrap = document.getElementById("overlay-alert-bg-image-wrap");
  if (colorWrap) colorWrap.style.display = type === "color" ? "block" : "none";
  if (imageWrap) imageWrap.style.display = type === "image" ? "block" : "none";
}

async function sendOverlayTest() {
  if (!loggedIn) return showToast("Faça login para testar o overlay", true);
  const btn = document.getElementById("overlay-test-btn");
  const payload = {
    username: document.getElementById("overlay-test-username")?.value?.trim() || "Teste",
    totalValue: Number(document.getElementById("overlay-test-value")?.value) || 5,
    message: document.getElementById("overlay-test-message")?.value?.trim() || "Isso é um alerta de teste.",
    title: document.getElementById("overlay-message")?.value?.trim() || undefined
  };
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Enviando...";
    }
    const res = await fetch(`${baseApi}/overlay-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {}
    if (!res.ok) throw new Error(data?.error || raw || "Falha ao enviar teste");
    showToast("Alerta de teste enviado!");
  } catch (err) {
    showToast(err?.message || "Erro ao enviar teste", true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Enviar alerta de teste";
    }
  }
}

async function testarVoz() {
  const btn = document.getElementById("tts-test");
  const voice = document.getElementById("tts-voice")?.value || "";
  const overlayText =
    document.getElementById("overlay-message")?.value?.trim() ||
    "Teste de voz do overlay";
  if (!loggedIn) return showToast("Faça login para testar voz", true);
  try {
    btn.disabled = true;
    btn.textContent = "Testando...";
    const res = await fetch(`${baseApi}/tts-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ voice, text: overlayText }),
    });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {}
    if (!res.ok) throw new Error(data?.error || raw || "Falha ao testar TTS");
    const url = data?.url;
    const fallbackUsed = Boolean(data?.fallbackUsed);
    if (url) {
      const audio = new Audio(url);
      audio.play().catch(() => {});
      showToast(
        fallbackUsed
          ? "Voz não suportada, usando padrão."
          : "Reproduzindo voz..."
      );
    }
  } catch (err) {
    showToast(err.message || "Erro ao testar voz", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Testar voz";
  }
}

document
  .getElementById("sound-upload")
  .addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!loggedIn) {
      showToast("Faça login para enviar áudio", true);
      e.target.value = "";
      return;
    }
    await uploadSound(file);
  });
document.getElementById("tts-test").addEventListener("click", testarVoz);
document
  .getElementById("btn-salvar-config")
  ?.addEventListener("click", salvarConfig);
document
  .getElementById("action-save-config")
  .addEventListener("click", salvarConfig);
document
  .getElementById("copy-overlay-link")
  .addEventListener("click", async () => {
    const link = document.getElementById("overlay-link").value;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Link copiado!");
    } catch {
      showToast("Não foi possível copiar", true);
    }
  });

document
  .getElementById("overlay-alert-bg-type")
  ?.addEventListener("change", updateOverlayAlertUi);

document
  .getElementById("overlay-test-btn")
  ?.addEventListener("click", sendOverlayTest);

document
  .getElementById("overlay-bg-upload")
  ?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const nameEl = document.getElementById("overlay-bg-file-name");
    if (nameEl) nameEl.textContent = file.name;

    if (!loggedIn) {
      showToast("Faça login para enviar imagem", true);
      e.target.value = "";
      if (nameEl) nameEl.textContent = "Selecione um arquivo";
      return;
    }

    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${baseApi}/upload-image`, {
        method: "POST",
        credentials: "include",
        body: fd
      });
      const raw = await res.text();
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch {}
      if (!res.ok) throw new Error(data?.error || raw || "Erro ao enviar imagem");

      const url = data?.url;
      if (url) {
        const bgTypeEl = document.getElementById("overlay-alert-bg-type");
        const bgUrlEl = document.getElementById("overlay-alert-bg-image");
        if (bgTypeEl) bgTypeEl.value = "image";
        if (bgUrlEl) bgUrlEl.value = url;
        updateOverlayAlertUi();
      }

      // Atualiza galeria global também.
      try {
        await loadImagens();
      } catch {}

      showToast("Imagem enviada!");
    } catch (err) {
      showToast(err?.message || "Erro ao enviar imagem", true);
      if (nameEl) nameEl.textContent = "Selecione um arquivo";
    } finally {
      e.target.value = "";
    }
  });

document
  .getElementById("copy-goal-overlay-link")
  .addEventListener("click", async () => {
    const link = document.getElementById("goal-overlay-link").value;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Link copiado!");
    } catch {
      showToast("Não foi possível copiar", true);
    }
  });

// Loja / produtos
function normalizeComandos(raw) {
  if (Array.isArray(raw))
    return raw.map((c) => c?.toString().trim()).filter(Boolean);
  if (typeof raw === "string") {
    return raw
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeProduto(key, data = {}) {
  const valorNumber = Number(data.valor);
  const qtyNumber = Number(data.quantity);
  return {
    key,
    title: data.title || "",
    valor: Number.isFinite(valorNumber) ? valorNumber : 0,
    quantity: Number.isFinite(qtyNumber) ? qtyNumber : 0,
    comandos: normalizeComandos(data.comandos ?? data.comando),
    imagem: data.imagem || "",
  };
}

function getFileNameFromUrl(url) {
  if (!url) return "";
  try {
    const parts = url.split("?")[0].split("#")[0].split("/");
    return parts[parts.length - 1] || url;
  } catch (e) {
    return url;
  }
}

function setImageValue(url, target = currentImageTarget) {
  const name = getFileNameFromUrl(url);
  if (target === "lead" || target === "banner") {
    document.getElementById("store-lead-bg-url").value = url || "";
    document.getElementById("store-lead-bg").value = name || "";
    return;
  }
  if (target === "store" || target === "page") {
    document.getElementById("store-bg-url").value = url || "";
    document.getElementById("store-bg").value = name || "";
    return;
  }
  document.getElementById("productImgUrl").value = url || "";
  document.getElementById("productImg").value = name || "";
}

function getImageValue(target = currentImageTarget) {
  if (target === "lead" || target === "banner")
    return document.getElementById("store-lead-bg-url").value.trim();
  if (target === "store" || target === "page")
    return document.getElementById("store-bg-url").value.trim();
  return document.getElementById("productImgUrl").value.trim();
}

function renderImageGallery() {
  const container = document.getElementById("imageGallery");
  if (!container) return;
  container.innerHTML = "";
  if (!imagens.length) {
    const empty = document.createElement("p");
    empty.className = "label";
    empty.style.margin = "0";
    empty.textContent = "Nenhuma imagem enviada.";
    container.appendChild(empty);
    return;
  }
  const current = getImageValue();
  imagens.forEach(({ name, url }) => {
    const card = document.createElement("div");
    card.className = "image-card" + (url === current ? " selected" : "");
    const img = document.createElement("img");
    img.src = url;
    img.alt = name;
    const title = document.createElement("div");
    title.className = "image-name";
    title.textContent = name;
    card.onclick = () => {
      setImageValue(url);
      renderImageGallery();
      if (modalOpen) closeImageModal();
    };
    card.appendChild(img);
    card.appendChild(title);
    container.appendChild(card);
  });
}

function fillSelect(selectedId = "") {
  const sel = document.getElementById("productSelect");
  sel.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione um produto";
  placeholder.disabled = true;
  placeholder.selected = !selectedId;
  sel.appendChild(placeholder);
  const optNew = document.createElement("option");
  optNew.value = "__new";
  optNew.textContent = "Novo produto";
  optNew.selected = selectedId === "__new";
  sel.appendChild(optNew);
  Object.keys(produtos).forEach((key) => {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = key;
    o.selected = selectedId === key;
    sel.appendChild(o);
  });
}

function clearForm() {
  document.getElementById("newProductId").value = "";
  document.getElementById("productTitle").value = "";
  document.getElementById("productPrice").value = "";
  document.getElementById("productQty").value = "";
  document.getElementById("productCmds").value = "";
  setImageValue("", "product");
}

function fillForm(id) {
  const data = produtos[id];
  if (!data) return clearForm();
  document.getElementById("newProductId").value = data.key || id;
  document.getElementById("productTitle").value = data.title || "";
  document.getElementById("productPrice").value = data.valor
    ? (data.valor / 100).toFixed(2)
    : "";
  document.getElementById("productQty").value = data.quantity || "";
  document.getElementById("productCmds").value = (data.comandos || []).join(
    "\n"
  );
  setImageValue(data.imagem || "", "product");
}

function showForm(show) {
  document
    .getElementById("productFormSection")
    .classList.toggle("hidden", !show);
  updateFloatingButtons();
}

async function fetchConfigProdutos() {
  const res = await fetch(`${baseApi}/config`, { credentials: "include" });
  if (!res.ok) throw new Error("Não autorizado ou config ausente");
  return res.json();
}

async function saveProdutos(produtosAtualizados) {
  const body = {
    rcon: configCache?.rcon || { host: "", port: "", password: "" },
    produtos: produtosAtualizados,
    sound: configCache?.sound,
    infinitypayHandle: configCache?.infinitypayHandle,
    overlayMessage: configCache?.overlayMessage,
    ttsVoice: configCache?.ttsVoice,
    overlayGoal: configCache?.overlayGoal,
  };
  const res = await fetch(`${baseApi}/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Erro ao salvar");
  }
  return res.json();
}

async function fetchImages() {
  const res = await fetch(`${baseApi}/list-images`, { credentials: "include" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Erro ao listar imagens");
  }
  return res.json();
}

async function loadProdutos() {
  const data = await fetchConfigProdutos();
  configCache = data;
  produtos = Object.fromEntries(
    Object.entries(data?.produtos || {}).map(([key, value]) => [
      key,
      normalizeProduto(key, value),
    ])
  );
  fillSelect();
}

async function loadPurchases(showToastOnError = false) {
  const listEl = document.getElementById("purchaseList");
  if (listEl) listEl.textContent = "Carregando...";
  try {
    const res = await fetch(`${baseApi}/purchases`, { credentials: "include" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Erro ao carregar compras");
    purchases = data?.purchases || [];
    renderPurchases();
  } catch (err) {
    if (listEl) listEl.textContent = "Falha ao carregar compras";
    if (showToastOnError)
      showToast(err.message || "Erro ao carregar compras", true);
  }
}

async function loadMetrics(fromIso, toIso) {
  const res = await fetch(`${baseApi}/metrics?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`, {
    credentials: "include"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Erro ao carregar métricas");
  return data;
}

const metricsForm = document.getElementById("metricsForm");
const metricsFrom = document.getElementById("metricsFrom");
const metricsTo = document.getElementById("metricsTo");
const metricsBtn = document.getElementById("metricsBtn");
const metricsResult = document.getElementById("metricsResult");
const metricsPurchases = document.getElementById("metricsPurchases");

metricsForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!loggedIn) {
    showToast("Faça login para ver as métricas.", true);
    return;
  }
  const fromIso = isoFromDateInput(metricsFrom?.value, false);
  const toIso = isoFromDateInput(metricsTo?.value, true);
  if (!fromIso || !toIso) {
    showToast("Informe um período válido.", true);
    return;
  }

  try {
    if (metricsBtn) metricsBtn.disabled = true;
    if (metricsResult) {
      metricsResult.hidden = false;
      metricsResult.textContent = "";
    }
    if (metricsPurchases) metricsPurchases.hidden = true;

    const resp = await loadMetrics(fromIso, toIso);
    const purchasesArr = Array.isArray(resp?.purchases) ? resp.purchases : [];

    if (metricsResult) {
      metricsResult.hidden = false;
      renderMetricsSummary(metricsResult, resp);
    }

    if (metricsPurchases) {
      metricsPurchases.hidden = false;
      renderPurchasesTable(metricsPurchases, purchasesArr);
    }
  } catch (err) {
    showToast(err?.message || "Erro ao carregar métricas", true);
  } finally {
    if (metricsBtn) metricsBtn.disabled = false;
  }
});

function renderPurchases() {
  const listEl = document.getElementById("purchaseList");
  if (!listEl) return;
  listEl.innerHTML = "";
  if (!purchases.length) {
    const empty = document.createElement("p");
    empty.className = "help-text";
    empty.textContent = "Nenhuma compra registrada.";
    listEl.appendChild(empty);
    return;
  }

  purchases.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.padding = "12px";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.gap = "10px";
    header.style.alignItems = "center";

    const title = document.createElement("div");
    title.innerHTML = `<strong>${
      p.username || "Cliente"
    }</strong> · ${formatPriceCents((p.totalValue || 0) * 100)}`;

    const replayBtn = document.createElement("button");
    replayBtn.className = "btn-secondary";
    replayBtn.textContent = "Reproduzir";
    replayBtn.style.padding = "8px 10px";
    replayBtn.dataset.replayId = p._id;

    header.appendChild(title);
    header.appendChild(replayBtn);

    const items = document.createElement("div");
    const itemsText = Array.isArray(p.items)
      ? p.items
          .map((it) => `${it.quantity || 1}x ${it.description || ""}`)
          .join(", ")
      : "";
    items.innerHTML = `<small style="color: var(--muted);">Itens: ${
      itemsText || "—"
    }</small>`;

    const tts = document.createElement("div");
    tts.style.marginTop = "6px";
    tts.innerHTML = `<small style="color: var(--muted);">TTS: ${
      p.ttsMessage || "—"
    }</small>`;

    card.appendChild(header);
    card.appendChild(items);
    card.appendChild(tts);
    listEl.appendChild(card);
  });
}

async function replayPurchase(purchaseId) {
  try {
    const res = await fetch(`${baseApi}/purchases/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ purchaseId }),
    });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {}
    if (!res.ok) throw new Error(data?.error || raw || "Erro ao reproduzir");
    showToast("Compra reproduzida");
  } catch (err) {
    showToast(err.message || "Erro ao reproduzir compra", true);
  }
}

async function loadImagens() {
  const data = await fetchImages();
  imagens = data?.files?.map((f) => ({ name: f.name, url: f.url })) || [];
  renderImageGallery();
}

document.getElementById("productSelect").addEventListener("change", (e) => {
  const id = e.target.value;
  if (id === "__new") {
    clearForm();
    showForm(true);
    return;
  }
  if (!id) {
    showForm(false);
    return;
  }
  fillForm(id);
  showForm(true);
});

document.getElementById("refreshPurchases").addEventListener("click", () => {
  loadPurchases(true);
});

document.getElementById("purchaseList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-replay-id]");
  if (!btn) return;
  const id = btn.dataset.replayId;
  if (id) replayPurchase(id);
});

const handleClearProduct = () => {
  clearForm();
  document.getElementById("productSelect").value = "__new";
};

document
  .getElementById("btnTestProduct")
  .addEventListener("click", async () => {
    try {
      if (!loggedIn) throw new Error("Faça login para testar");
      const id = document.getElementById("newProductId").value.trim();
      if (!id) throw new Error("Informe o ID do produto");
      const produto = produtos[id];
      const username = user || "Tester";
      const valorReais = produto?.valor ? produto.valor / 100 : 0;
      const valorFmt = Number.isFinite(valorReais)
        ? valorReais.toFixed(2)
        : "0.00";
      const itemNome = produto?.title || id;
      const ttsText = `${username} enviou um teste de ${itemNome} que vale R$ ${valorFmt}`;
      const res = await fetch(`${baseApi}/test-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId: id, quantity: 1, username, ttsText }),
      });
      const raw = await res.text();
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch {}
      if (!res.ok) throw new Error(data?.error || raw || "Erro no teste");
      const overlayMsg = data?.overlayMessage || "Teste enviado";
      showToast(`Teste enviado: ${overlayMsg}`);
    } catch (err) {
      showToast(err.message || "Erro ao testar produto", true);
    }
  });

const handleSaveProduct = async () => {
  const id = document.getElementById("newProductId").value.trim();
  if (!id) throw new Error("Informe o ID do produto");
  const updated = { ...produtos };
  updated[id] = normalizeProduto(id, {
    title: document.getElementById("productTitle").value.trim(),
    valor:
      Math.round(Number(document.getElementById("productPrice").value) * 100) ||
      0,
    quantity: Number(document.getElementById("productQty").value) || 0,
    comandos: document
      .getElementById("productCmds")
      .value.split("\n")
      .map((c) => c.trim())
      .filter(Boolean),
    imagem: getImageValue(),
  });
  await saveProdutos(updated);
  produtos = updated;
  fillSelect(id);
  showForm(true);
  showToast("Produto salvo!");
};

const handleDeleteProduct = async () => {
  const id = document.getElementById("productSelect").value;
  if (!id || id === "__new")
    throw new Error("Selecione um produto para remover");
  const updated = { ...produtos };
  delete updated[id];
  await saveProdutos(updated);
  produtos = updated;
  fillSelect();
  showForm(false);
  showToast("Produto removido!");
};

document
  .getElementById("action-save-product")
  .addEventListener("click", async () => {
    try {
      await handleSaveProduct();
    } catch (err) {
      showToast(err.message || "Erro ao salvar produto", true);
    }
  });

document
  .getElementById("action-delete-product")
  .addEventListener("click", async () => {
    try {
      await handleDeleteProduct();
    } catch (err) {
      showToast(err.message || "Erro ao remover", true);
    }
  });

document
  .getElementById("action-clear-product")
  .addEventListener("click", () => {
    handleClearProduct();
  });

document.getElementById("productImg").addEventListener("click", () => {
  openImageModal("product");
});
document.getElementById("store-lead-bg").addEventListener("click", () => {
  openImageModal("lead");
});
document.getElementById("store-bg").addEventListener("click", () => {
  openImageModal("store");
});
document.getElementById("store-link-btn").addEventListener("click", () => {
  const url = `${location.origin}/${encodeURIComponent(user)}/loja`;
  window.open(url, "_blank");
});

// Modal de imagens
function openImageModal(target = "product") {
  currentImageTarget = target;
  modalOpen = true;
  document.getElementById("imageModal").style.display = "flex";
  renderImageGallery();
}
function closeImageModal() {
  modalOpen = false;
  document.getElementById("imageModal").style.display = "none";
}
document
  .getElementById("modalClose")
  .addEventListener("click", closeImageModal);

document
  .getElementById("modalFileInput")
  .addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    document.getElementById("modalFileName").textContent = file.name;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${baseApi}/upload-image`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const raw = await res.text();
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch {}
      if (!res.ok) throw new Error(data?.error || raw || "Erro ao enviar");
      await loadImagens();
      showToast("Imagem enviada!");
    } catch (err) {
      showToast(err.message || "Erro ao enviar imagem", true);
    } finally {
      e.target.value = "";
    }
  });

// Boot geral
async function boot() {
  await carregarConfig();
  await loadProdutos();
  await loadImagens();
  await loadPurchases();
  // link para loja pública
  const storeBtn = document.getElementById("store-link-btn");
  storeBtn.dataset.url = `/${encodeURIComponent(user)}/loja`;
}

window.addEventListener("load", trySessionLogin);
