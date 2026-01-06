const pathParts = location.pathname.split("/").filter(Boolean);
const user = pathParts[0] || "";
const source = new EventSource(`/${user}/events`);

const rootEl = document.getElementById("goal-root");
const progressEl = document.getElementById("goal-progress");
const progressTextEl = document.getElementById("goal-progress-text");
const textAboveEl = document.getElementById("goal-text-above");

const defaults = {
  target: 100,
  current: 0,
  textTemplate: "Meta: {current} / {target}",
  textPosition: "inside",
  barBgColor: "#0f172a",
  barFillColor: "#22d3ee",
  textColor: "#e5e7eb"
};

let goal = { ...defaults };

function normalizeGoal(raw) {
  const safeNumber = (v, fb = 0) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fb;
  };
  const safeColor = (v, fb) => (typeof v === "string" && v.trim() ? v.trim() : fb);

  return {
    target: safeNumber(raw?.target, defaults.target),
    current: safeNumber(raw?.current, defaults.current),
    textTemplate: typeof raw?.textTemplate === "string" && raw.textTemplate.trim()
      ? raw.textTemplate.trim()
      : defaults.textTemplate,
    textPosition: raw?.textPosition === "above" ? "above" : "inside",
    barBgColor: safeColor(raw?.barBgColor, defaults.barBgColor),
    barFillColor: safeColor(raw?.barFillColor, defaults.barFillColor),
    textColor: safeColor(raw?.textColor, defaults.textColor)
  };
}

function formatBRL(value) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function renderGoal() {
  if (!progressEl || !progressTextEl || !rootEl || !textAboveEl) return;

  const pct = goal.target > 0 ? Math.min(100, (goal.current / goal.target) * 100) : 0;
  progressEl.style.width = `${pct}%`;

  document.documentElement.style.setProperty("--bar-bg", goal.barBgColor);
  document.documentElement.style.setProperty("--bar-fill", goal.barFillColor);
  document.documentElement.style.setProperty("--text", goal.textColor);

  const remaining = Math.max(0, goal.target - goal.current);
  const formatted = goal.textTemplate
    .replace(/\{current\}/gi, formatBRL(goal.current))
    .replace(/\{target\}/gi, formatBRL(goal.target))
    .replace(/\{remaining\}/gi, formatBRL(remaining));

  progressTextEl.textContent = formatted;
  textAboveEl.textContent = formatted;
  if (goal.textPosition === "above") {
    rootEl.classList.add("text-above");
    progressTextEl.style.display = "none";
    textAboveEl.style.display = "block";
  } else {
    rootEl.classList.remove("text-above");
    progressTextEl.style.display = "flex";
    textAboveEl.style.display = "none";
  }
}

async function loadGoalConfig() {
  try {
    const res = await fetch(`/${user}/api/config`);
    const data = await res.json();
    goal = normalizeGoal(data?.overlayGoal);
    renderGoal();
  } catch (err) {
    console.warn("Erro ao carregar meta", err);
    renderGoal();
  }
}

source.addEventListener("purchase", (e) => {
  try {
    const data = JSON.parse(e.data);
    const delta = Number(data?.totalValue);
    if (Number.isFinite(delta) && delta > 0) {
      goal.current = Math.max(0, goal.current + delta);
      renderGoal();
    }
  } catch (err) {
    console.warn("Falha ao processar purchase", err);
  }
});

source.onerror = () => {
  // Mantém overlay funcionando mesmo se SSE cair; pode reconectar automaticamente pelo EventSource
};

loadGoalConfig();
renderGoal();
