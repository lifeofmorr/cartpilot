// CartPilot demo server (zero dependencies — Node's built-in http + fetch).
//
// API:
//   GET  /api/health            -> { ok, paypalMode, llm }
//   GET  /api/catalog           -> public catalog (no seller floors)
//   GET  /api/mandate           -> current mandate (+ defaults)
//   POST /api/mandate           -> set mandate { totalBudget, autoApproveLimit, allowedCategories }
//   POST /api/run               -> { goal, mandate? } starts an agent purchase run
//   GET  /api/run/:id           -> run state
//   POST /api/run/:id/approve-mandate -> owner approves a run held by the mandate
//   POST /api/run/:id/buyer-approve   -> (stub mode) simulate buyer approval on PayPal
//   POST /api/run/:id/capture   -> capture an APPROVED order, write the ledger receipt
//   GET  /api/ledger            -> completed purchases + totals
//   GET  /return, /cancel       -> PayPal hosted-page return targets (sandbox mode)
//
// The PayPal return flow: after the buyer approves on PayPal's sandbox page,
// PayPal redirects to /return?token=<orderId>; the page calls capture.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { publicCatalog, CATEGORIES } from "./lib/catalog.js";
import { createPayPalClient } from "./lib/paypal.js";
import {
  createPurchaseRun,
  approveMandate,
  buyerApprove,
  captureRun,
} from "./lib/agent.js";
import { createLedger } from "./lib/ledger.js";
import { llmProvider } from "./lib/llm.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(ROOT, "public");
const PORT = parseInt(process.env.PORT || "4173", 10);

const paypal = createPayPalClient();
const ledger = createLedger(process.env.LEDGER_PATH || join(ROOT, "data", "ledger.json"));
const runs = new Map();

const DEFAULT_MANDATE = {
  totalBudget: 200,
  autoApproveLimit: 50,
  allowedCategories: [...CATEGORIES],
};

console.log(`[cartpilot] PayPal mode: ${paypal.mode}${paypal.mode === "stub" ? " (no PAYPAL_CLIENT_ID/SECRET set — local simulator, PayPal-shaped responses)" : ""}`);
console.log(`[cartpilot] LLM planner: ${llmProvider()}${llmProvider() === "rules" ? " (built-in deterministic planner)" : ""}`);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function publicRun(run) {
  return run; // runs contain no secrets — seller floors never enter a run object
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    // ---- PayPal hosted-page returns (sandbox mode) ----
    if (path === "/return" || path === "/cancel") {
      const html = await readFile(join(PUBLIC, "return.html"), "utf8");
      res.writeHead(200, { "Content-Type": MIME[".html"] });
      res.end(html);
      return;
    }

    // ---- API ----
    if (path === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        paypalMode: paypal.mode,
        llm: llmProvider(),
        service: "cartpilot",
      });
    }

    if (path === "/api/catalog") {
      return sendJson(res, 200, { products: publicCatalog(), categories: CATEGORIES });
    }

    if (path === "/api/mandate" && req.method === "GET") {
      return sendJson(res, 200, { mandate: ledger.getMandate() || DEFAULT_MANDATE });
    }

    if (path === "/api/mandate" && req.method === "POST") {
      const body = await readBody(req);
      const mandate = {
        totalBudget: body.totalBudget != null ? Number(body.totalBudget) : DEFAULT_MANDATE.totalBudget,
        autoApproveLimit:
          body.autoApproveLimit != null ? Number(body.autoApproveLimit) : DEFAULT_MANDATE.autoApproveLimit,
        allowedCategories: Array.isArray(body.allowedCategories)
          ? body.allowedCategories
          : DEFAULT_MANDATE.allowedCategories,
      };
      ledger.setMandate(mandate);
      return sendJson(res, 200, { mandate });
    }

    if (path === "/api/run" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.goal || typeof body.goal !== "string") {
        return sendJson(res, 400, { error: "goal (string) is required" });
      }
      const mandate = body.mandate || ledger.getMandate() || DEFAULT_MANDATE;
      const run = await createPurchaseRun({ goal: body.goal, mandate, paypal });
      runs.set(run.id, run);
      return sendJson(res, 200, { run: publicRun(run) });
    }

    const runMatch = path.match(/^\/api\/run\/([\w-]+)(?:\/(approve-mandate|buyer-approve|capture))?$/);
    if (runMatch) {
      const run = runs.get(runMatch[1]);
      if (!run) return sendJson(res, 404, { error: "run not found" });
      const action = runMatch[2];
      if (!action && req.method === "GET") return sendJson(res, 200, { run: publicRun(run) });
      if (action === "approve-mandate" && req.method === "POST") {
        await approveMandate(run, paypal);
        return sendJson(res, 200, { run: publicRun(run) });
      }
      if (action === "buyer-approve" && req.method === "POST") {
        await buyerApprove(run, paypal);
        return sendJson(res, 200, { run: publicRun(run) });
      }
      if (action === "capture" && req.method === "POST") {
        await captureRun(run, paypal, ledger);
        return sendJson(res, 200, { run: publicRun(run) });
      }
      return sendJson(res, 405, { error: "method not allowed" });
    }

    if (path === "/api/ledger") {
      const entries = ledger.entries();
      return sendJson(res, 200, {
        entries,
        totalSpent: Math.round(entries.reduce((s, e) => s + e.total, 0) * 100) / 100,
        totalSaved: Math.round(entries.reduce((s, e) => s + (e.savings || 0), 0) * 100) / 100,
      });
    }

    // ---- Static UI ----
    const rel = path === "/" ? "index.html" : path.slice(1);
    const filePath = normalize(join(PUBLIC, rel));
    if (!filePath.startsWith(PUBLIC) || !existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch (err) {
    const status = err.code === "NOT_APPROVED" ? 409 : err.status || 500;
    sendJson(res, status, { error: err.message, details: err.details || undefined });
  }
});

server.listen(PORT, () => {
  console.log(`[cartpilot] listening on http://localhost:${PORT}`);
});
