const user = location.pathname.split("/")[1];
const source = new EventSource(`/${user}/events`);
const baseApi = `/${user}/api`;

const alertBox = document.getElementById("alert");
const alertText = document.getElementById("alert-text");
const tagText = document.getElementById("tag-text");
const panelEl = document.querySelector(".panel");

const DEFAULT_DURATION = 5000;
let playing = false;

function applyOverlayAlertStyle(overlayAlert) {
  if (!overlayAlert) return;

  const bgType = overlayAlert?.backgroundType || "default";
  const bgColor = overlayAlert?.backgroundColor || "";
  const bgImageUrl = overlayAlert?.backgroundImageUrl || "";

  if (panelEl) {
    panelEl.classList.toggle("custom-bg", bgType === "color" || bgType === "image");

    if (bgType === "color" && bgColor) {
      panelEl.style.backgroundImage = "none";
      panelEl.style.background = bgColor;
    } else if (bgType === "image" && bgImageUrl) {
      panelEl.style.background = "transparent";
      panelEl.style.backgroundImage = `url("${bgImageUrl}")`;
      panelEl.style.backgroundSize = "cover";
      panelEl.style.backgroundPosition = "center";
      panelEl.style.backgroundRepeat = "no-repeat";
    } else {
      panelEl.classList.remove("custom-bg");
      panelEl.style.background = "";
      panelEl.style.backgroundImage = "";
      panelEl.style.backgroundSize = "";
      panelEl.style.backgroundPosition = "";
      panelEl.style.backgroundRepeat = "";
    }
  }

  const fontTagPx = Number(overlayAlert?.fontTagPx);
  const fontMessagePx = Number(overlayAlert?.fontMessagePx);

  if (tagText) {
    tagText.style.fontSize = Number.isFinite(fontTagPx) && fontTagPx > 0 ? `${fontTagPx}px` : "";
  }
  if (alertText) {
    alertText.style.fontSize = Number.isFinite(fontMessagePx) && fontMessagePx > 0 ? `${fontMessagePx}px` : "";
  }
}

async function loadOverlayAlertConfig() {
  try {
    const res = await fetch(`${baseApi}/config`, { credentials: "omit" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    applyOverlayAlertStyle(data?.overlayAlert);
  } catch {
    // ignore
  }
}

async function showAlert({ title, message, duration = DEFAULT_DURATION, audioUrl, soundUrl }) {
  if (playing) return;
  playing = true;

  tagText.textContent = title || "Nova mensagem";
  alertText.textContent = message || "";
  alertBox.classList.add("show");

  try {
    // primeiro o som padrão, depois o TTS
    await playAudio(soundUrl);
    await playAudio(audioUrl);
  } catch (err) {
    console.warn("Audio play error", err);
  }

  setTimeout(() => {
    alertBox.classList.remove("show");
    playing = false;
  }, duration);
}

// Evento padrão (mensagem genérica)
source.onmessage = e => {
  try {
    const alert = JSON.parse(e.data);
    const duration = alert.duration || DEFAULT_DURATION;
    const title = alert.defaultMessage
      || alert.overlayMessage
      || alert.title
      || "Nova mensagem";
    const message = alert.buyerMessage
      || alert.ttsMessage
      || alert.message
      || "";
    if (!message && !title) return;
    showAlert({ title, message, duration, audioUrl: alert.audioUrl, soundUrl: alert.soundUrl });
  } catch {
    // ignora mensagens malformadas
  }
};

// Evento específico "purchase" enviado pelo backend
source.addEventListener("purchase", e => {
  try {
    const data = JSON.parse(e.data);
    const title = data.overlayMessage
      || data.defaultMessage
      || "Nova compra";
    const message = data.buyerMessage
      || data.ttsMessage
      || data.ttsTexto
      || data.message
      || `${data.player || "Jogador"} comprou ${data.produto || "um item"}`;

    showAlert({ title, message, duration: DEFAULT_DURATION, audioUrl: data.audioUrl, soundUrl: data.soundUrl });
  } catch {
    // ignora mensagens malformadas
  }
});

source.addEventListener("overlay-config", (e) => {
  try {
    const data = JSON.parse(e.data);
    applyOverlayAlertStyle(data?.overlayAlert || data);
  } catch {
    // ignore
  }
});

loadOverlayAlertConfig();

function playAudio(url) {
  if (!url) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    let ended = false;

    const cleanup = () => {
      audio.onended = null;
      audio.onerror = null;
    };

    audio.onended = () => {
      ended = true;
      cleanup();
      resolve();
    };

    audio.onerror = err => {
      if (!ended) {
        cleanup();
        reject(err || new Error("audio error"));
      }
    };

    audio.play().catch(err => {
      cleanup();
      reject(err);
    });
  });
}
