// CartPilot smoke test.
//
// Boots the real server on an ephemeral port (stub PayPal mode — no
// credentials involved) and drives the full agent lifecycle over HTTP:
//
//   Scene 1: goal under the auto-approve limit -> negotiate -> PayPal order
//            created -> buyer approval -> capture -> receipt + ledger entry.
//   Scene 2: goal above the auto-approve limit -> run HELD by the mandate ->
//            owner approves -> order created -> approve -> capture.
//   Scene 3: essentials over budget -> agent REFUSES to overspend (no order).
//   Scene 4: mandate allowlist violation -> agent BLOCKED (no order).
//
// Run: npm run smoke   (exit code 0 = all scenes pass)

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 4319;
const BASE = `http://localhost:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "cartpilot-smoke-"));

let failures = 0;
function check(label, cond, extra = "") {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label} ${extra}`);
  }
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const { data } = await api("/api/health");
      if (data.ok) return data;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not come up");
}

const server = spawn("node", ["server.js"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: String(PORT),
    PAYPAL_CLIENT_ID: "",
    PAYPAL_CLIENT_SECRET: "",
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
    LEDGER_PATH: join(tmp, "ledger.json"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

try {
  const health = await waitForHealth();
  console.log(`[smoke] server up — paypalMode=${health.paypalMode} llm=${health.llm}`);
  check("health reports stub PayPal mode", health.paypalMode === "stub");
  check("health reports built-in planner", health.llm === "rules");

  // Mandate: $200 cap, $50 auto-approve, all categories allowed.
  await api("/api/mandate", {
    method: "POST",
    body: JSON.stringify({ totalBudget: 200, autoApproveLimit: 50, allowedCategories: [] }),
  });
  // allowedCategories [] = "no allowlist restriction" is NOT our semantic; set explicitly:
  const { data: cat } = await api("/api/catalog");
  await api("/api/mandate", {
    method: "POST",
    body: JSON.stringify({
      totalBudget: 200,
      autoApproveLimit: 50,
      allowedCategories: cat.categories,
    }),
  });

  // ---- Scene 1: under auto-approve -------------------------------------
  console.log("[smoke] scene 1: coffee + paper towels, under $60, auto-approved");
  let { data } = await api("/api/run", {
    method: "POST",
    body: JSON.stringify({
      goal: "Buy 2 bags of coffee and paper towels for the office, under $60",
    }),
  });
  let run = data.run;
  check("run created an order", run.status === "ORDER_CREATED", `status=${run.status}`);
  check("cart has 2 lines", run.cart?.lines.length === 2, JSON.stringify(run.cart?.lines));
  const coffeeLine = run.cart?.lines.find((l) => l.productId.includes("coffee"));
  check("coffee quantity parsed as 2", coffeeLine?.quantity === 2, `qty=${coffeeLine?.quantity}`);
  check("negotiation beat list price", run.cart.total < run.cart.listTotal,
    `total=${run.cart.total} list=${run.cart.listTotal}`);
  check("cart within the $60 goal budget", run.cart.total <= 60, `total=${run.cart.total}`);
  check("order total matches cart total",
    run.order?.purchase_units?.[0]?.amount?.value === run.cart.total.toFixed(2));
  check("approve link present (PayPal-shaped)", !!run.approveUrl);
  check("trace shows negotiation", run.trace.some((t) => t.kind === "negotiate"));

  ({ data } = await api(`/api/run/${run.id}/buyer-approve`, { method: "POST" }));
  run = data.run;
  check("buyer approval moves order to BUYER_APPROVED", run.status === "BUYER_APPROVED");

  ({ data } = await api(`/api/run/${run.id}/capture`, { method: "POST" }));
  run = data.run;
  check("capture completes the run", run.status === "COMPLETED", `status=${run.status}`);
  check("receipt has a capture id", !!run.receipt?.captureId);
  check("order status is COMPLETED", run.order?.status === "COMPLETED");

  const { data: ledger1 } = await api("/api/ledger");
  check("ledger recorded the purchase", ledger1.entries.length === 1);
  check("ledger total matches", Math.abs(ledger1.totalSpent - run.cart.total) < 0.001);

  // ---- Scene 2: mandate hold --------------------------------------------
  console.log("[smoke] scene 2: bulk stock-up held by the mandate, then approved");
  ({ data } = await api("/api/run", {
    method: "POST",
    body: JSON.stringify({
      goal: "Stock up: 3 sets of mugs and 2 packs of notebooks for the new starters",
    }),
  }));
  run = data.run;
  check("run held for owner approval", run.status === "AWAITING_APPROVAL", `status=${run.status}`);
  check("no PayPal order exists while held", run.order === null);
  check("held cart is above the $50 auto-approve limit", run.cart.total > 50, `total=${run.cart.total}`);
  const mugLine = run.cart?.lines.find((l) => l.productId.includes("mug"));
  const nbLine = run.cart?.lines.find((l) => l.productId.includes("notebook"));
  check("quantities parsed as 3 mugs / 2 notebooks",
    mugLine?.quantity === 3 && nbLine?.quantity === 2,
    `mugs=${mugLine?.quantity} notebooks=${nbLine?.quantity}`);

  ({ data } = await api(`/api/run/${run.id}/approve-mandate`, { method: "POST" }));
  run = data.run;
  check("owner approval creates the order", run.status === "ORDER_CREATED");
  ({ data } = await api(`/api/run/${run.id}/buyer-approve`, { method: "POST" }));
  ({ data } = await api(`/api/run/${run.id}/capture`, { method: "POST" }));
  run = data.run;
  check("approved run completes", run.status === "COMPLETED", `status=${run.status}`);

  // ---- Scene 3: budget refusal -------------------------------------------
  console.log("[smoke] scene 3: essentials over the stated budget — agent refuses");
  ({ data } = await api("/api/run", {
    method: "POST",
    body: JSON.stringify({
      goal: "Buy a desk lamp and a wireless mouse, under $40",
    }),
  }));
  run = data.run;
  check("run blocked by budget", run.status === "BLOCKED_BUDGET", `status=${run.status}`);
  check("no order created for the blocked run", run.order === null);

  // ---- Scene 4: mandate allowlist ----------------------------------------
  console.log("[smoke] scene 4: category outside the mandate allowlist — blocked");
  await api("/api/mandate", {
    method: "POST",
    body: JSON.stringify({
      totalBudget: 200,
      autoApproveLimit: 500,
      allowedCategories: ["cleaning"],
    }),
  });
  ({ data } = await api("/api/run", {
    method: "POST",
    body: JSON.stringify({ goal: "Buy coffee filters for the kitchen" }),
  }));
  run = data.run;
  check("run blocked by mandate", run.status === "BLOCKED_MANDATE", `status=${run.status}`);
  check("no order created for the mandate-blocked run", run.order === null);

  const { data: ledger2 } = await api("/api/ledger");
  check("ledger still holds exactly the 2 completed purchases", ledger2.entries.length === 2);

  console.log(failures === 0 ? "\n[smoke] ALL SCENES PASSED" : `\n[smoke] ${failures} CHECK(S) FAILED`);
} catch (err) {
  failures += 1;
  console.error("[smoke] ERROR:", err.message);
} finally {
  server.kill("SIGTERM");
  rmSync(tmp, { recursive: true, force: true });
  if (failures > 0) {
    console.error("---- server log ----");
    console.error(serverLog);
  }
}

process.exit(failures === 0 ? 0 : 1);
