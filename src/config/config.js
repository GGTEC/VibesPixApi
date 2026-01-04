// Config page logic extracted from inline script
// Aplica fonte Kanit globalmente
document.documentElement.style.setProperty('--font-main', 'Kanit, sans-serif');

let loggedIn = false;
// Derive API base from first path segment (/:user/config => /:user/api).
const pathParts = window.location.pathname.split('/').filter(Boolean);
const baseApi = `/${pathParts[0] || ''}/api`;
const defaultSounds = ["default.mp3", "alert1.mp3", "alert2.mp3"];
const ttsVoices = [
  { value: "pt-BR-FranciscaNeural", label: "pt-BR Francisca (F)" },
  { value: "pt-BR-AntonioNeural", label: "pt-BR Antonio (M)" },
  { value: "pt-BR-MacerioMultilingualNeural4", label: "pt-BR Macerio Multilingual (M)" },
  { value: "pt-BR-ThalitaMultilingualNeural4", label: "pt-BR Thalita Multilingual (F)" },
  { value: "pt-BR-BrendaNeural", label: "pt-BR Brenda (F)" },
  { value: "pt-BR-DonatoNeural", label: "pt-BR Donato (M)" },
  { value: "pt-BR-ElzaNeural", label: "pt-BR Elza (F)" },
  { value: "pt-BR-FabioNeural", label: "pt-BR Fabio (M)" },
  { value: "pt-BR-GiovannaNeural", label: "pt-BR Giovanna (F)" },
  { value: "pt-BR-HumbertoNeural", label: "pt-BR Humberto (M)" },
  { value: "pt-BR-JulioNeural", label: "pt-BR Julio (M)" },
  { value: "pt-BR-LeilaNeural", label: "pt-BR Leila (F)" },
  { value: "pt-BR-LeticiaNeural", label: "pt-BR Leticia (F, Child)" },
  { value: "pt-BR-ManuelaNeural", label: "pt-BR Manuela (F)" },
  { value: "pt-BR-NicolauNeural", label: "pt-BR Nicolau (M)" },
  { value: "pt-BR-ThalitaNeural", label: "pt-BR Thalita (F)" },
  { value: "pt-BR-ValerioNeural", label: "pt-BR Valerio (M)" },
  { value: "pt-BR-YaraNeural", label: "pt-BR Yara (F)" },
  { value: "pt-BR-Macerio:DragonHDLatestNeural1", label: "pt-BR Macerio DragonHD (M)" },
  { value: "pt-BR-Thalita:DragonHDLatestNeural1", label: "pt-BR Thalita DragonHD (F)" },
  { value: "pt-PT-RaquelNeural", label: "pt-PT Raquel (F)" },
  { value: "pt-PT-DuarteNeural", label: "pt-PT Duarte (M)" },
  { value: "pt-PT-FernandaNeural", label: "pt-PT Fernanda (F)" }
];
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
const tabContents = Array.from(document.querySelectorAll('.tab-content'));

function setActiveTab(targetId) {
  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === targetId;
    btn.classList.toggle('active', isActive);
  });
  tabContents.forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== targetId);
  });
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

if (tabButtons.length && tabContents.length) {
  setActiveTab(document.querySelector('.tab-btn.active')?.dataset.tab || tabButtons[0].dataset.tab);
}

function showToast(message, isError = false) {
  const container = document.getElementById('toast-container');
  if (!container) return alert(message); // fallback
  const el = document.createElement('div');
  el.className = `toast${isError ? ' error' : ''}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px)';
    setTimeout(() => el.remove(), 400);
  }, 3200);
}

function addSoundOption(name, selectIt = false) {
  if (!name) return;
  const select = document.getElementById('sound');
  const exists = Array.from(select.options).some((o) => o.value === name);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  if (selectIt) {
    select.value = name;
  }
}

async function loadSoundList() {
  const select = document.getElementById('sound');
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecione um áudio';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  defaultSounds.forEach((s) => addSoundOption(s));

  try {
    const res = await fetch(`${baseApi}/list-sounds`, { credentials: 'include' });
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch {}
    if (!res.ok) {
      throw new Error(data?.error || raw || 'Erro ao listar áudios');
    }
    (data?.files || []).forEach((f) => addSoundOption(f.name));
  } catch (err) {
    showToast(err.message || 'Falha ao carregar áudios', true);
  }
}

function populateTtsVoiceList() {
  const select = document.getElementById('tts-voice');
  if (!select) return;
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecione a voz';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  ttsVoices.forEach((voice) => {
    const opt = document.createElement('option');
    opt.value = voice.value;
    opt.textContent = voice.label;
    select.appendChild(opt);
  });
}

async function uploadSound(file) {
  const statusEl = document.getElementById('sound-file-name');
  try {
    statusEl.textContent = 'Enviando...';
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${baseApi}/upload-sound`, {
      method: 'POST',
      credentials: 'include',
      body: fd
    });
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch {}
    if (!res.ok) {
      throw new Error(data?.error || raw || 'Falha no upload');
    }
    const filename = data?.filename || file.name;
    addSoundOption(filename, true);
    statusEl.textContent = filename;
    showToast('Áudio enviado!');
  } catch (err) {
    statusEl.textContent = 'Selecione um arquivo';
    showToast(err.message || 'Erro ao enviar áudio', true);
  } finally {
    const input = document.getElementById('sound-upload');
    if (input) input.value = '';
  }
}

async function carregar() {
  await loadSoundList();
  populateTtsVoiceList();
  const res = await fetch(`${baseApi}/config`, {
    credentials: 'include'
  });
  if (!res.ok) {
    throw new Error('Credenciais inválidas');
  }
  const data = await res.json();
  document.getElementById('host').value = data.rcon.host;
  document.getElementById('port').value = data.rcon.port;
  document.getElementById('password').value = data.rcon.password;
  addSoundOption(data.sound);
  document.getElementById('sound').value = data.sound || '';
  document.getElementById('infinitypay-handle').value = data.infinitypayHandle || '';
  document.getElementById('overlay-message').value = data.overlayMessage || '';
  const voiceSelect = document.getElementById('tts-voice');
  if (voiceSelect && data.ttsVoice) {
    voiceSelect.value = data.ttsVoice;
  }
}

async function salvar() {
  try {
    await fetch(`${baseApi}/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        rcon: {
          host: host.value,
          port: port.value,
          password: password.value
        },
        sound: sound.value?.trim() || undefined,
        infinitypayHandle: document.getElementById('infinitypay-handle').value.trim() || undefined,
        overlayMessage: document.getElementById('overlay-message').value.trim() || undefined,
        ttsVoice: document.getElementById('tts-voice').value || undefined
      })
    });
    showToast('Salvo com sucesso!');
  } catch {
    showToast('Erro ao salvar!', true);
  }
}

async function testarVoz() {
  const btn = document.getElementById('tts-test');
  const voice = document.getElementById('tts-voice')?.value || '';
  const overlayText = document.getElementById('overlay-message')?.value?.trim() || 'Teste de voz do overlay';

  if (!loggedIn) {
    showToast('Faça login para testar voz', true);
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = 'Testando...';
    const res = await fetch(`${baseApi}/tts-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ voice, text: overlayText })
    });
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch {}
    if (!res.ok) {
      throw new Error(data?.error || raw || 'Falha ao testar TTS');
    }
    const url = data?.url;
    const fallbackUsed = Boolean(data?.fallbackUsed);
    if (url) {
      const audio = new Audio(url);
      audio.play().catch(() => {});
      showToast(fallbackUsed ? 'Voz não suportada, usando padrão.' : 'Reproduzindo voz...');
    }
  } catch (err) {
    showToast(err.message || 'Erro ao testar voz', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Testar voz';
  }
}

document.getElementById('login-btn').onclick = async function() {
  const identifier = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;
  document.getElementById('login-erro').classList.add('hidden');
  try {
    const res = await fetch(`${baseApi}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identifier, password })
    });
    if (!res.ok) throw new Error('Credenciais inválidas');
    loggedIn = true;
    await carregar();
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('config-panel').classList.remove('hidden');
  } catch (err) {
    document.getElementById('login-erro').textContent = err.message || 'Credenciais inválidas';
    document.getElementById('login-erro').classList.remove('hidden');
  }
};

document.getElementById('logout-btn').onclick = async function() {
  try {
    await fetch(`${baseApi}/logout`, { method: 'POST', credentials: 'include' });
  } catch {}
  loggedIn = false;
  document.getElementById('config-panel').classList.add('hidden');
  document.getElementById('login-container').classList.remove('hidden');
};

async function trySessionLogin() {
  try {
    await carregar();
    loggedIn = true;
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('config-panel').classList.remove('hidden');
  } catch (_) {
    // sessão inválida ou ausente: mantém tela de login
  }
}

window.addEventListener('load', trySessionLogin);

document.getElementById('tts-test').addEventListener('click', testarVoz);

document.getElementById('sound-upload').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!loggedIn) {
    showToast('Faça login para enviar áudio', true);
    e.target.value = '';
    return;
  }
  await uploadSound(file);
});
