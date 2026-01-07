const basePath = window.location.pathname.replace(/\/?loja.*$/, "");
const baseApi = basePath + "/api";
const productsEl = document.getElementById("products");
const errorEl = document.getElementById("error");
const summaryEl = document.getElementById("summary");
const summaryListEl = document.getElementById("summary-list");
const summaryTotalEl = document.getElementById("summary-total");
const footerActionsEl = document.getElementById("footer-actions");
const backBtn = document.getElementById("btn-voltar");
const selections = new Map(); // id -> {produto, qty}
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

function formatPrice(v) {
  if (v == null) return "—";
  const num = Number(v);
  return "R$ " + (isNaN(num) ? v : (num / 100).toFixed(2));
}

async function loadConfig() {
  showError("");

  const res = await fetch(`${baseApi}/config`);
  if (!res.ok) {
    showError("Não foi possível carregar config pública.");
    return;
  }
  const data = await res.json();
  renderProducts(data);
  if (data.home) {
    const leadEl = document.querySelector("p.lead");
    const titleEl = document.getElementById("store-title");
    if (leadEl && data.home.lead) leadEl.textContent = data.home.lead;
    if (titleEl && data.home.name) titleEl.textContent = data.home.name;

    const headerEl = document.querySelector("header.card");
    const bannerBg =
      data.home.bannerBg || data.home.leadBg || data.home.leadBackground;
    const headerBg = bannerBg || data.home.pageBg || data.home.storeBg;
    if (headerEl && headerBg) {
      headerEl.style.backgroundImage = `linear-gradient(135deg, rgba(13,11,22,0.72), rgba(13,11,22,0.6)), url('${headerBg}')`;
      headerEl.style.backgroundSize = "cover";
      headerEl.style.backgroundPosition = "center";
    }

    const pageBg = data.home.pageBg || data.home.storeBg;
    applyPageBackground(pageBg);
  }
}

function renderProducts(config) {
  productsEl.innerHTML = "";
  const produtos = config.produtos || {};
  const entries = Object.entries(produtos).sort((a, b) => {
    const va = getValor(a[1]);
    const vb = getValor(b[1]);
    if (va === vb) return 0;
    return va < vb ? -1 : 1;
  });
  if (!entries.length) {
    productsEl.innerHTML = '<p class="notice">Nenhum produto configurado.</p>';
    return;
  }

  entries.forEach(([id, p]) => {
    const card = document.createElement("div");
    card.className = "card product";

    const img = document.createElement("img");
    img.src = p.imagem || "https://vibesbot.com.br/assets/img/about.png";
    img.alt = id;

    const info = document.createElement("div");
    const title = document.createElement("h3");
    const qtd = document.createElement("span");
    const meta = document.createElement("p");

    info.className = "info";
    title.innerHTML = `${p.title}`;
    const qtdValue = p.quantity ?? p.qty ?? "—";
    qtd.innerHTML = `• Qtd: ${qtdValue}`;
    const valueRaw = p.valor ?? p.price;
    const valuePrice = valueRaw != null ? formatPrice(valueRaw) : "—";
    meta.innerHTML = `<span class="price">${valuePrice}</span>`;
    info.appendChild(title);
    info.appendChild(qtd);
    info.appendChild(meta);

    const checkCol = document.createElement("div");
    checkCol.className = "check-col";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.onchange = () => toggleProduct(id, p, chk.checked);
    checkCol.appendChild(chk);

    const qtyCol = document.createElement("div");
    qtyCol.className = "qty";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "-";
    const qtySpan = document.createElement("span");
    qtySpan.textContent = "1";
    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";

    minus.onclick = () => changeQty(id, p, -1, qtySpan, chk);
    plus.onclick = () => changeQty(id, p, 1, qtySpan, chk);

    qtyCol.appendChild(minus);
    qtyCol.appendChild(qtySpan);
    qtyCol.appendChild(plus);

    card.appendChild(img);
    card.appendChild(info);
    card.appendChild(checkCol);
    card.appendChild(qtyCol);

    productsEl.appendChild(card);
  });
}

async function createCheckout({
  customerName,
  orderId,
  ttsText,
  items,
  totalPrice,
}) {
  const body = {
    customer_name: customerName,
    order_id: orderId,
    tts_text: ttsText,
    items,
    ammount: totalPrice,
  };
  console.log("Criando checkout com", body);
  const res = await fetch(`${baseApi}/create_checkout_infinitepay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data = null;
  let raw = "";
  try {
    data = await res.json();
  } catch (err) {
    try {
      raw = await res.text();
    } catch {}
  }

  if (!res.ok) {
    const message =
      data?.error || raw || `Erro ao criar checkout (HTTP ${res.status})`;
    throw new Error(message);
  }

  const checkoutUrl = data?.url || data?.data?.url;
  if (checkoutUrl) {
    window.location.href = checkoutUrl;
  } else {
    throw new Error("Resposta sem URL de checkout");
  }
}

function toggleProduct(id, produto, checked) {
  if (checked) {
    selections.set(id, { produto, qty: 1 });
  } else {
    selections.delete(id);
  }
}

function changeQty(id, produto, delta, qtySpan, chk) {
  let current = selections.get(id);
  if (!current) {
    if (delta > 0) {
      current = { produto, qty: 1 };
      selections.set(id, current);
      if (chk) chk.checked = true;
    } else {
      return;
    }
  }
  current.qty = Math.max(1, (current.qty || 1) + delta);
  qtySpan.textContent = String(current.qty);
}

function getValor(produto) {
  const raw = produto?.valor ?? produto?.price;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function showProductsView() {
  summaryEl.style.display = "none";
  productsEl.classList.remove("hidden");
  footerActionsEl.classList.remove("hidden");
}

function renderSummary() {
  const items = Array.from(selections.entries());
  if (!items.length) {
    showError("Selecione ao menos um produto.");
    showProductsView();
    return;
  }
  showError("");
  summaryListEl.innerHTML = "";
  let total = 0;
  items.forEach(([id, entry]) => {
    const wrapper = document.createElement("div");
    wrapper.className = "summary-item";

    const title = document.createElement("p");
    title.className = "title";
    title.textContent = `${entry.qty}x ${
      entry.produto.title || entry.produto.nome || id
    }`;

    const meta = document.createElement("p");
    meta.className = "meta";
    const valor = getValor(entry.produto);
    const subtotal = valor * (entry.qty || 1);
    total += subtotal;
    meta.textContent = `${formatPrice(valor)} cada • ${formatPrice(
      subtotal
    )} total`;

    wrapper.appendChild(title);
    wrapper.appendChild(meta);
    summaryListEl.appendChild(wrapper);
  });
  summaryTotalEl.textContent = "Total: " + formatPrice(total);
  summaryEl.style.display = "block";
  productsEl.classList.add("hidden");
  footerActionsEl.classList.add("hidden");
  summaryEl.scrollIntoView({ behavior: "smooth" });
}

document.getElementById("btn-prosseguir").onclick = renderSummary;
backBtn.onclick = showProductsView;

document.getElementById("btn-confirmar").onclick = async () => {
  try {
    const items = Array.from(selections.entries());
    if (!items.length) {
      showError("Selecione ao menos um produto.");
      return;
    }
    const nome =
      document.getElementById("final-name").value.trim() || "Cliente";
    const ttsRaw = document.getElementById("final-tts").value || "";
    const tts = ttsRaw.trim().slice(0, 300);

    const itemList = items.map(([id, entry]) => ({
      description: id,
      amount: getValor(entry.produto),
      quantity: entry.qty || 1,
    }));

    const total = itemList.reduce(
      (acc, it) => acc + (it.amount || 0) * (it.quantity || 1),
      0
    );
    const orderId = items.map(([id, entry]) => `${entry.qty}x${id}`).join("+");

    await createCheckout({
      customerName: nome,
      orderId,
      ttsText: tts,
      items: itemList,
      totalPrice: total || 1000,
    });
  } catch (err) {
    console.error(err);
    showError(err.message || "Erro ao iniciar checkout");
  }
};

// Auto-carrega quando possível
loadConfig();
