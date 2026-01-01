const user = location.pathname.split("/")[1];
const source = new EventSource(`/${user}/events`);

const alertBox = document.getElementById("alert");
const alertText = document.getElementById("alert-text");

const DEFAULT_DURATION = 5000;
let playing = false;

async function showAlert(message, duration = DEFAULT_DURATION, audioUrl, soundUrl) {
  if (playing) return;
  playing = true;

  alertText.textContent = message;
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
    const message = alert.message || "";
    const duration = alert.duration || DEFAULT_DURATION;
    if (!message) return;
    showAlert(message, duration, alert.audioUrl, alert.soundUrl);
  } catch {
    // ignora mensagens malformadas
  }
};

// Evento específico "purchase" enviado pelo backend
source.addEventListener("purchase", e => {
  try {
    const data = JSON.parse(e.data);
    const message = `${data.player || "Jogador"} comprou ${data.produto || "um item"}`;
    showAlert(message, DEFAULT_DURATION, data.audioUrl, data.soundUrl);
  } catch {
    // ignora mensagens malformadas
  }
});

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
