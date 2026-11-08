// CartPilot agent core.
//
// Pipeline:  parse goal -> search marketplace -> NEGOTIATE with each seller ->
// optimize the cart under budget -> enforce the owner's spending MANDATE ->
// create a PayPal order -> buyer approval -> capture -> ledger receipt.
//
// The agent is deliberately transparent: every decision is appended to a
// human-readable trace that the UI renders live and the smoke test asserts on.

import { PRODUCTS } from "./catalog.js";
import { planWithLLM, llmProvider } from "./llm.js";
import { approveLink } from "./paypal.js";

const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => `$${round2(n).toFixed(2)}`;

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12,
};

function makeTrace() {
  const started = Date.now();
  const entries = [];
  return {
    entries,
    add(kind, msg) {
      entries.push({ atMs: Date.now() - started, kind, msg });
    },
  };
}

// ---------------------------------------------------------------------------
// Goal parsing (deterministic fallback planner)
// ---------------------------------------------------------------------------

function extractBudget(text) {
  const patterns = [
    /under\s+\$?(\d+(?:\.\d{1,2})?)/i,
    /no more than\s+\$?(\d+(?:\.\d{1,2})?)/i,
    /max(?:imum)?\s+(?:of\s+)?\$?(\d+(?:\.\d{1,2})?)/i,
    /budget\s+(?:of\s+)?\$?(\d+(?:\.\d{1,2})?)/i,
    /\$(\d+(?:\.\d{1,2})?)\s+budget/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

function quantityBefore(text, index) {
  // Trailing space: the window ends mid-phrase (right before the keyword), so
  // terminate it to let the pattern match whole words.
  const window = `${text.slice(Math.max(0, index - 30), index)} `;
  const m = window.match(
    /(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|dozen)\s+(?:\w+\s+){0,2}$/i
  );
  if (!m) return null;
  const tok = m[1].toLowerCase();
  return NUMBER_WORDS[tok] ?? parseInt(tok, 10);
}

function isEssentialNear(text, index) {
  const window = text.slice(Math.max(0, index - 40), index + 10);
  return /(at least|need|needs|must|required|minimum)/i.test(window);
}

export function parseGoalRules(goal) {
  const text = ` ${goal.toLowerCase()} `;
  const budget = extractBudget(goal);

  // Longest keyword phrases first so "coffee filters" beats "coffee".
  const keywordIndex = [];
  for (const p of PRODUCTS) {
    for (const kw of p.keywords) keywordIndex.push({ kw, product: p });
  }
  keywordIndex.sort((a, b) => b.kw.length - a.kw.length);

  const groups = new Map(); // keyword -> { product, quantity, essential }
  for (const { kw, product } of keywordIndex) {
    const idx = text.indexOf(` ${kw}`) !== -1 ? text.indexOf(` ${kw}`) : text.indexOf(kw);
    if (idx === -1) continue;
    // Skip if a longer keyword already claimed this product for this mention.
    if ([...groups.values()].some((g) => g.product.id === product.id)) continue;
    if (groups.has(kw)) continue;
    const qty = quantityBefore(text, idx);
    groups.set(kw, {
      match: kw,
      product,
      quantity: qty ?? 1,
      explicitQty: qty !== null,
      essential: isEssentialNear(text, idx),
    });
  }

  const requirements = [...groups.values()].map((g) => ({
    match: g.match,
    productId: g.product.id,
    quantity: g.quantity,
    essential: g.essential || g.explicitQty,
  }));

  return { requirements, budget, note: null };
}

// ---------------------------------------------------------------------------
// Negotiation
// ---------------------------------------------------------------------------
// The agent never sees the seller's floor. It opens below list, the seller
// counters toward list but never below its floor, and the agent splits the
// difference. Fully deterministic so demos and tests are reproducible.

export function negotiate(product, trace) {
  const list = product.listPrice;
  const floor = product.seller.floorPrice;
  const walkAway = round2(list * 0.97);
  let offer = round2(list * 0.82);
  trace.add(
    "negotiate",
    `Negotiating with ${product.seller.name} for "${product.name}" (list ${money(list)}). Opening offer ${money(offer)}.`
  );
  for (let round = 1; round <= 3; round++) {
    if (offer >= floor) {
      trace.add(
        "negotiate",
        `${product.seller.name} accepted ${money(offer)} — ${money(list - offer)} under list.`
      );
      return { unitPrice: offer, rounds: round, acceptedOffer: true };
    }
    const counter = round2(Math.max(floor, offer + (list - offer) * 0.45));
    trace.add("negotiate", `${product.seller.name} countered at ${money(counter)}.`);
    const raise = round2(offer + (counter - offer) * 0.5);
    if (raise >= floor) {
      trace.add(
        "negotiate",
        `Agent raised to ${money(raise)}; ${product.seller.name} accepted — ${money(list - raise)} under list.`
      );
      return { unitPrice: raise, rounds: round, acceptedOffer: false };
    }
    if (counter <= walkAway) {
      trace.add(
        "negotiate",
        `Agent accepted the counter ${money(counter)} (inside walk-away ${money(walkAway)}).`
      );
      return { unitPrice: counter, rounds: round, acceptedOffer: false };
    }
    offer = raise;
  }
  trace.add(
    "negotiate",
    `No agreement below walk-away; settling at list ${money(list)} rather than overpaying.`
  );
  return { unitPrice: list, rounds: 3, acceptedOffer: false };
}

// ---------------------------------------------------------------------------
// Purchase run lifecycle
// ---------------------------------------------------------------------------

let runSeq = 0;

export async function createPurchaseRun({ goal, mandate, paypal, env = process.env }) {
  runSeq += 1;
  const trace = makeTrace();
  const run = {
    id: `run-${runSeq}`,
    goal,
    mandate,
    status: "PLANNING",
    trace: trace.entries,
    cart: null,
    order: null,
    approveUrl: null,
    receipt: null,
    planner: llmProvider(env),
    createdAt: new Date().toISOString(),
  };

  // 1) Parse the goal -------------------------------------------------------
  let parsed = null;
  try {
    parsed = await planWithLLM(goal, env);
    if (parsed) trace.add("plan", `LLM planner (${run.planner}) parsed the goal.`);
  } catch (err) {
    trace.add("plan", `LLM planner failed (${err.message}); falling back to the built-in planner.`);
    parsed = null;
  }
  if (!parsed) {
    parsed = parseGoalRules(goal);
    run.planner = run.planner === "rules" ? "rules" : `${run.planner}-fallback-rules`;
    trace.add("plan", "Built-in planner parsed the goal.");
  }

  // Normalize LLM output into catalog requirements.
  const requirements = [];
  for (const req of parsed.requirements || []) {
    let product = null;
    if (req.productId) product = PRODUCTS.find((p) => p.id === req.productId) || null;
    if (!product && req.match) {
      const m = String(req.match).toLowerCase();
      const candidates = PRODUCTS.filter((p) =>
        p.keywords.some((k) => m.includes(k) || k.includes(m))
      );
      candidates.sort((a, b) => b.rating - a.rating);
      product = candidates[0] || null;
    }
    if (product && !requirements.some((r) => r.productId === product.id)) {
      requirements.push({
        match: req.match || product.keywords[0],
        productId: product.id,
        quantity: Math.max(1, parseInt(req.quantity, 10) || 1),
        essential: !!req.essential,
      });
    }
  }
  if (parsed.note) trace.add("plan", `Plan note: ${parsed.note}`);
  if (requirements.length === 0) {
    run.status = "NO_MATCH";
    trace.add("plan", "No catalog products matched the goal. No purchase attempted.");
    return run;
  }
  trace.add(
    "plan",
    `Shopping list: ${requirements
      .map((r) => `${r.quantity} x ${PRODUCTS.find((p) => p.id === r.productId).name}`)
      .join("; ")}.`
  );

  // 2) Negotiate each line --------------------------------------------------
  const lines = [];
  let listTotal = 0;
  for (const req of requirements) {
    const product = PRODUCTS.find((p) => p.id === req.productId);
    const { unitPrice } = negotiate(product, trace);
    const lineTotal = round2(unitPrice * req.quantity);
    listTotal += product.listPrice * req.quantity;
    lines.push({
      productId: product.id,
      name: product.name,
      category: product.category,
      seller: product.seller.name,
      quantity: req.quantity,
      listUnitPrice: product.listPrice,
      unitPrice,
      lineTotal,
      essential: req.essential,
    });
  }

  // 3) Budget optimization --------------------------------------------------
  const goalBudget = parsed.budget ?? null;
  const mandateCap = mandate?.totalBudget ?? null;
  const effectiveBudget =
    goalBudget !== null && mandateCap !== null
      ? Math.min(goalBudget, mandateCap)
      : goalBudget ?? mandateCap;
  let total = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

  if (effectiveBudget !== null && total > effectiveBudget) {
    trace.add(
      "budget",
      `Cart ${money(total)} exceeds the effective budget ${money(effectiveBudget)} — trimming lowest-value non-essentials.`
    );
    const droppable = lines
      .filter((l) => !l.essential)
      .sort((a, b) => a.unitPrice - b.unitPrice);
    for (const line of droppable) {
      if (total <= effectiveBudget) break;
      lines.splice(lines.indexOf(line), 1);
      total = round2(total - line.lineTotal);
      trace.add("budget", `Dropped "${line.name}" (${money(line.lineTotal)}) to fit the budget.`);
    }
  }

  run.cart = {
    lines,
    listTotal: round2(listTotal),
    total,
    savings: round2(listTotal - total),
    currency: "USD",
  };

  if (lines.length === 0 || (effectiveBudget !== null && total > effectiveBudget)) {
    run.status = "BLOCKED_BUDGET";
    trace.add(
      "budget",
      `Essential items alone (${money(total)}) exceed the budget ${money(effectiveBudget ?? 0)}. Purchase blocked — the agent will not overspend.`
    );
    return run;
  }
  trace.add(
    "budget",
    `Final cart ${money(total)} (list ${money(run.cart.listTotal)}, negotiated savings ${money(run.cart.savings)}).`
  );

  // 4) Mandate enforcement --------------------------------------------------
  const mandateResult = checkMandate(run.cart, mandate, trace);
  if (mandateResult === "blocked") {
    run.status = "BLOCKED_MANDATE";
    return run;
  }
  if (mandateResult === "approval") {
    run.status = "AWAITING_APPROVAL";
    trace.add(
      "mandate",
      `Cart ${money(total)} is above the auto-approve limit ${money(mandate.autoApproveLimit)}. Waiting for the owner's approval before creating the PayPal order.`
    );
    return run;
  }

  // 5) Create the PayPal order ---------------------------------------------
  await createOrderForRun(run, paypal, trace);
  return run;
}

function checkMandate(cart, mandate, trace) {
  if (!mandate) {
    trace.add("mandate", "No mandate configured — proceeding (demo mode).");
    return "ok";
  }
  const allowed = mandate.allowedCategories || [];
  if (allowed.length > 0) {
    for (const line of cart.lines) {
      if (!allowed.includes(line.category)) {
        trace.add(
          "mandate",
          `BLOCKED by mandate: category "${line.category}" ("${line.name}") is not in the allowlist. No order created.`
        );
        return "blocked";
      }
    }
  }
  if (mandate.totalBudget != null && cart.total > mandate.totalBudget) {
    trace.add(
      "mandate",
      `BLOCKED by mandate: cart ${money(cart.total)} exceeds the mandate total budget ${money(mandate.totalBudget)}. No order created.`
    );
    return "blocked";
  }
  trace.add("mandate", "Mandate check passed (categories + total budget).");
  if (mandate.autoApproveLimit != null && cart.total > mandate.autoApproveLimit) {
    return "approval";
  }
  return "ok";
}

async function createOrderForRun(run, paypal, trace) {
  const items = run.cart.lines.map((l) => ({
    name: l.name,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
  }));
  const order = await paypal.createOrder({
    items,
    total: run.cart.total,
    description: `CartPilot: ${run.goal}`.slice(0, 127),
  });
  run.order = order;
  run.approveUrl = approveLink(order);
  run.status = "ORDER_CREATED";
  trace.add(
    "paypal",
    `PayPal order ${order.id} created (${paypal.mode} mode), status ${order.status}, total ${money(run.cart.total)}. Awaiting buyer approval.`
  );
}

export async function approveMandate(run, paypal) {
  if (run.status !== "AWAITING_APPROVAL") {
    throw new Error(`Run ${run.id} is not awaiting approval (status ${run.status})`);
  }
  const trace = makeTrace();
  trace.entries.push(...run.trace);
  trace.add("mandate", "Owner approved the purchase. Creating the PayPal order.");
  await createOrderForRun(run, paypal, trace);
  run.trace = trace.entries;
  return run;
}

export async function buyerApprove(run, paypal) {
  if (!run.order) throw new Error(`Run ${run.id} has no PayPal order yet`);
  if (paypal.mode !== "stub") {
    throw new Error(
      "Sandbox mode: the buyer must approve on PayPal's hosted page (approve link). After approval, call capture."
    );
  }
  const order = await paypal.buyerApprove(run.order.id);
  run.order = order;
  run.status = "BUYER_APPROVED";
  run.trace.push({
    atMs: 0,
    kind: "paypal",
    msg: `Buyer approved order ${order.id} (simulated hosted-page approval). Ready to capture.`,
  });
  return run;
}

export async function captureRun(run, paypal, ledger) {
  if (!run.order) throw new Error(`Run ${run.id} has no PayPal order yet`);
  const current = await paypal.getOrder(run.order.id);
  if (current.status === "COMPLETED") {
    run.order = current;
    run.status = "COMPLETED";
    return run;
  }
  if (current.status !== "APPROVED") {
    const err = new Error(
      `Order ${run.order.id} is ${current.status}; the buyer must approve it before capture.`
    );
    err.code = "NOT_APPROVED";
    throw err;
  }
  const captured = await paypal.captureOrder(run.order.id);
  run.order = captured;
  run.status = "COMPLETED";
  const capture =
    captured.purchase_units?.[0]?.payments?.captures?.[0] || null;
  run.receipt = {
    orderId: captured.id,
    captureId: capture?.id || null,
    total: run.cart.total,
    currency: "USD",
    payer: captured.payer?.email_address || null,
    completedAt: new Date().toISOString(),
  };
  run.trace.push({
    atMs: 0,
    kind: "paypal",
    msg: `Payment captured. Order ${captured.id} COMPLETED, capture ${run.receipt.captureId}. ${money(run.cart.total)} paid via PayPal (${paypal.mode}).`,
  });
  if (ledger) {
    ledger.addEntry({
      runId: run.id,
      goal: run.goal,
      orderId: captured.id,
      captureId: run.receipt.captureId,
      total: run.cart.total,
      savings: run.cart.savings,
      items: run.cart.lines.map((l) => `${l.quantity} x ${l.name}`),
      completedAt: run.receipt.completedAt,
    });
  }
  return run;
}
