// public/script.js
const usuario = window.location.pathname.split('/')[1];
const evtSource = new EventSource(`/${usuario}/events`);
evtSource.addEventListener('alert', e => {
  const data = JSON.parse(e.data);
  const alerta = document.getElementById('alerta');
  alerta.textContent = `Parabéns ${data.jogador}! Você comprou ${data.produto}`;
  alerta.classList.add('show');
  setTimeout(() => alerta.classList.remove('show'), 5000);
});