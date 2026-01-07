const basePath = window.location.pathname.replace(/\/?donate.*$/, "");
const baseApi = basePath + "/api";
const errorEl = document.getElementById("donate-error");
const defaultBodyBackground = getComputedStyle(document.body).background;

function showError(msg) {
  errorEl.textContent = msg || "";
}

function applyPageBackground(bgUrl) {
  if (!bgUrl) {
    document.body.style.background = defaultBodyBackground;
    document.body.style.backgroundSize = "";
    document.body.style.backgroundPosition = "";
    document.body.style.backgroundRepeat = "";
    document.body.style.backgroundAttachment = "";
    return;
  }

  document.body.style.background = `linear-gradient(135deg, rgba(13,11,22,0.82), rgba(13,11,22,0.7)), url('${bgUrl}')`;
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = "center";
  document.body.style.backgroundRepeat = "no-repeat";
  document.body.style.backgroundAttachment = "fixed";
}

function formatCents(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) 
    return 0;
  return Math.round(num * 100);
}

async function loadLead() {
  try {
    const res = await fetch(`${baseApi}/config`);
    if (!res.ok) 
      return;
    const data = await res.json();
    const titleEl = document.getElementById("donate-title");
    const leadEl = document.getElementById("donate-lead");
    const headerEl = document.querySelector("header.card");
    if (
      data.home
      ?.name) 
      titleEl.textContent = data.home.name;
    if (
      data.home
      ?.lead) 
      leadEl.textContent = data.home.lead;
    
    const bannerBg = data.home
      ?.bannerBg || data.home
        ?.leadBg || data.home
          ?.leadBackground;
    const pageBg = data.home
      ?.pageBg || data.home
        ?.storeBg;
    const headerBg = bannerBg || pageBg;
    if (headerEl && headerBg) {
      headerEl.style.backgroundImage = `linear-gradient(135deg, rgba(13,11,22,0.78), rgba(13,11,22,0.6)), url('${headerBg}')`;
      headerEl.style.backgroundSize = "cover";
      headerEl.style.backgroundPosition = "center";
    }

    applyPageBackground(pageBg);
  } catch (err) {
    console.warn("Falha ao carregar lead", err);
  }
}

async function submitDonate() {
  const name = document.getElementById("donate-name").value.trim() || "Cliente";
  const amountInput = document.getElementById("donate-amount").value;
  const ttsRaw = document.getElementById("donate-tts").value || "";
  const tts = ttsRaw.trim().slice(0, 300);
  const cents = formatCents(amountInput);

  if (!cents || cents <= 0) {
    showError("Informe um valor válido.");
    return;
  }
  if (!tts) {
    showError("Digite a mensagem que será falada.");
    return;
  }

  showError("");
  const btn = document.getElementById("donate-submit");
  btn.disabled = true;
  btn.textContent = "Gerando pagamento...";

  try {
    const body = {
      customer_name: name,
      order_id: `donate-${Date.now()}`,
      tts_text: tts,
      items: [
        {
          description: "donate",
          quantity: 1,
          amount: cents
        }
      ],
      totalPrice: cents
    };

    const res = await fetch(`${baseApi}/create_checkout_infinitepay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    let data = null;
    let raw = "";
    try {
      data = await res.json();
    } catch (err) {
      try {
        raw = await res.text();
      } catch  {}
    }

    if (!res.ok) {
      const msg = data
        ?.error || data
          ?.message || raw || "Erro ao criar checkout";
      throw new Error(msg);
    }

    const checkoutUrl = data
      ?.url || data
        ?.data
          ?.url;
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    } else {
      throw new Error("Resposta sem URL de pagamento");
    }
  } catch (err) {
    console.error(err);
    showError(err.message || "Erro ao iniciar pagamento");
  } finally {
    btn.disabled = false;
    btn.textContent = "Prosseguir para pagamento";
  }
}

loadLead();
document.getElementById("donate-submit").onclick = submitDonate;
