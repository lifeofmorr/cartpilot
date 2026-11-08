// CartPilot UI logic — talks to the demo server's /api endpoints.

const $ = (id) => document.getElementById(id);
const money = (n) => `$${Number(n).toFixed(2)}`;

let currentRun = null;
let paypalMode = "stub";

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function init() {
  const health = await api("/api/health");
  paypalMode = health.paypalMode;
  $("paypal-badge").textContent =
    paypalMode === "sandbox" ? "PayPal: SANDBOX (live API)" : "PayPal: SIMULATOR (no keys set)";
  $("llm-badge").textContent = `Planner: ${health.llm === "rules" ? "built-in" : health.llm}`;

  const { mandate } = await api("/api/mandate");
  $("m-budget").value = mandate.totalBudget;
  $("m-auto").value = mandate.autoApproveLimit;
  const box = $("m-categories");
  box.innerHTML = "";
  const { categories } = await api("/api/catalog");
  for (const c of categories) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = c;
    cb.checked = mandate.allowedCategories.includes(c);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(c));
    box.appendChild(label);
  }
  await refreshLedger();
}

$("m-save").addEventListener("click", async () => {
  const allowedCategories = [...$("m-categories").querySelectorAll("input:checked")].map((i) => i.value);
  await api("/api/mandate", {
    method: "POST",
    body: JSON.stringify({
      totalBudget: Number($("m-budget").value),
      autoApproveLimit: Number($("m-auto").value),
      allowedCategories,
    }),
  });
  $("m-saved").textContent = "Saved.";
  setTimeout(() => ($("m-saved").textContent = ""), 2000);
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    $("goal").value = chip.dataset.goal;
  });
});

function setStatus(text, cls = "") {
  const el = $("status-line");
  el.textContent = text;
  el.className = `status-line ${cls}`;
}

function renderTrace(trace) {
  const list = $("trace");
  list.innerHTML = "";
  trace.forEach((entry, i) => {
    const li = document.createElement("li");
    li.className = entry.kind;
    li.style.animationDelay = `${Math.min(i * 90, 900)}ms`;
    const k = document.createElement("span");
    k.className = "k";
    k.textContent = entry.kind;
    li.appendChild(k);
    li.appendChild(document.createTextNode(entry.msg));
    list.appendChild(li);
  });
}

function renderCart(run) {
  const card = $("cart-card");
  if (!run.cart) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const body = $("cart-body");
  body.innerHTML = "";
  for (const l of run.cart.lines) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.name}</td><td>${l.seller}</td><td>${l.quantity}</td>
      <td class="strike">${money(l.listUnitPrice)}</td>
      <td>${money(l.unitPrice)}</td><td>${money(l.lineTotal)}</td>`;
    body.appendChild(tr);
  }
  $("cart-foot").innerHTML = `
    <tr><td colspan="5">Total (list ${money(run.cart.listTotal)})</td>
    <td>${money(run.cart.total)}<br /><span class="save">saved ${money(run.cart.savings)}</span></td></tr>`;
}

function renderPay(run) {
  const card = $("pay-card");
  const body = $("pay-body");
  const show = (id, on) => ($(id).hidden = !on);
  show("mandate-approve-btn", false);
  show("approve-link", false);
  show("buyer-approve-btn", false);
  show("capture-btn", false);
  $("receipt").hidden = true;

  if (!run.order && run.status !== "AWAITING_APPROVAL") {
    card.hidden = run.status === "PLANNING" || !run.cart;
    if (run.cart) {
      body.innerHTML = `<p class="hint">No PayPal order was created — see the trace for the mandate/budget decision.</p>`;
      card.hidden = false;
    }
    return;
  }
  card.hidden = false;

  if (run.status === "AWAITING_APPROVAL") {
    body.innerHTML = `<p>This cart is <strong>above your auto-approve limit</strong>. The agent is holding here — no PayPal order exists yet. Approve it and the agent will create the order.</p>`;
    show("mandate-approve-btn", true);
    return;
  }

  const o = run.order;
  body.innerHTML = `
    <p>Order <strong>${o.id}</strong> · status <strong>${o.status}</strong> · total <strong>${money(run.cart.total)}</strong>
    ${paypalMode === "stub" ? "<br /><span class='hint'>Simulator mode: approval is simulated locally with PayPal-shaped responses. Add sandbox credentials and this same button opens PayPal's real hosted approval page.</span>" : ""}</p>`;

  if (o.status === "CREATED") {
    if (paypalMode === "sandbox" && run.approveUrl) {
      const link = $("approve-link");
      link.href = run.approveUrl;
      show("approve-link", true);
      show("capture-btn", true); // capture re-checks status server-side
    } else {
      show("buyer-approve-btn", true);
    }
  } else if (o.status === "APPROVED") {
    show("capture-btn", true);
  } else if (o.status === "COMPLETED" && run.receipt) {
    const r = $("receipt");
    r.hidden = false;
    r.innerHTML = `<strong>Paid.</strong> Capture <strong>${run.receipt.captureId}</strong> · ${money(run.receipt.total)} via PayPal (${paypalMode}) · ${new Date(run.receipt.completedAt).toLocaleString()}<br />Receipt written to the ledger.`;
  }
}

function renderRun(run) {
  currentRun = run;
  renderTrace(run.trace);
  renderCart(run);
  renderPay(run);
  const labels = {
    ORDER_CREATED: "Order created on PayPal — waiting for buyer approval.",
    BUYER_APPROVED: "Buyer approved — ready to capture.",
    AWAITING_APPROVAL: "Held by your mandate — the agent needs your approval to proceed.",
    BLOCKED_MANDATE: "Blocked by your mandate. No order was created.",
    BLOCKED_BUDGET: "Blocked: the essentials alone exceed the budget. The agent refused to overspend.",
    NO_MATCH: "No catalog products matched that goal.",
    COMPLETED: "Purchase complete and captured.",
  };
  setStatus(
    labels[run.status] || run.status,
    run.status.startsWith("BLOCKED") ? "blocked" : run.status === "COMPLETED" ? "done" : ""
  );
}

$("run-btn").addEventListener("click", async () => {
  const goal = $("goal").value.trim();
  if (!goal) return;
  $("run-btn").disabled = true;
  setStatus("Agent is working…");
  $("trace").innerHTML = "";
  try {
    const { run } = await api("/api/run", { method: "POST", body: JSON.stringify({ goal }) });
    renderRun(run);
  } catch (err) {
    setStatus(`Error: ${err.message}`, "blocked");
  } finally {
    $("run-btn").disabled = false;
  }
});

$("mandate-approve-btn").addEventListener("click", async () => {
  const { run } = await api(`/api/run/${currentRun.id}/approve-mandate`, { method: "POST" });
  renderRun(run);
});

$("buyer-approve-btn").addEventListener("click", async () => {
  const { run } = await api(`/api/run/${currentRun.id}/buyer-approve`, { method: "POST" });
  renderRun(run);
});

$("capture-btn").addEventListener("click", async () => {
  try {
    const { run } = await api(`/api/run/${currentRun.id}/capture`, { method: "POST" });
    renderRun(run);
    await refreshLedger();
  } catch (err) {
    setStatus(`Capture not ready: ${err.message}`, "blocked");
  }
});

async function refreshLedger() {
  const data = await api("/api/ledger");
  const body = $("ledger-body");
  if (data.entries.length === 0) {
    body.textContent = "No completed purchases yet.";
    return;
  }
  const rows = data.entries
    .map(
      (e) =>
        `<tr><td>${e.items.join("; ")}</td><td>${money(e.total)}</td><td class="save">−${money(e.savings || 0)}</td></tr>`
    )
    .join("");
  body.innerHTML = `<table><tr><th>Items</th><th>Paid</th><th>Saved</th></tr>${rows}</table>
    <p class="hint">Total spent ${money(data.totalSpent)} · total negotiated savings ${money(data.totalSaved)}</p>`;
}

init().catch((err) => setStatus(`Failed to load: ${err.message}`, "blocked"));
