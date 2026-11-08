# Devpost submission — CartPilot (paste-ready)

**Hackathon:** PayPal AI Hackathon (paypalaihackathon.devpost.com)
**Deadline:** Nov 12, 2026, 3:00 PM EST
**Categories targeted:** Best Agentic Commerce · Best Use of PayPal + AI · Best Demo · overall prizes

---

## Project name

CartPilot

## Tagline (one line)

A purchasing agent with a mandate: it negotiates with sellers, can never break your budget rules, and pays with PayPal.

## Elevator pitch (short description)

CartPilot is an autonomous purchasing agent. Give it a goal in plain language and a spending mandate — a total cap, an auto-approve limit, and allowed categories. It plans the purchase, negotiates with marketplace sellers round by round, enforces the mandate *before* any order exists, then creates a real PayPal Sandbox order, walks the buyer through PayPal's hosted approval, captures the payment, and writes a receipt to a ledger. Every decision is shown in a live trace. Above your auto-approve limit it stops and asks you. If the goal is impossible within budget, it refuses — and explains why.

## Inspiration

AI agents are about to spend real money on our behalf, and the demos all show the same thing: an agent with a credit card and no brakes. We asked the opposite question — what does an agent look like when it's genuinely *safe to give a budget to*? CartPilot is our answer: capable at shopping and negotiation, but bounded by a mandate the owner sets, checked before money moves, with a human in the loop exactly where the amounts get serious.

## What it does

- **Understands a goal** — "Buy 2 bags of coffee and paper towels for the office, under $60" becomes a structured shopping list (items, quantities, essentials, budget), via an LLM when a key is configured or a built-in deterministic planner when it isn't.
- **Negotiates** — each seller in the demo marketplace has a private floor price. The agent opens below list, reads counters, and splits differences; it lands ~17–18% under list price across the demo scenes, and the whole haggle is visible in the trace.
- **Enforces the mandate before ordering** — category allowlist, total cap, and the auto-approve threshold are hard gates. Held purchases create *no* PayPal order until the owner approves. Impossible budgets are refused with an explanation.
- **Pays with PayPal** — real PayPal Sandbox **Orders v2** integration (OAuth client-credentials → create order → hosted buyer approval → status verification → capture), with itemized purchase units. A receipt with the capture ID lands in a persistent ledger.
- **Runs anywhere** — zero npm dependencies, Node 18+. Without PayPal keys it runs in a clearly-labeled simulator mode whose stub returns PayPal-shaped responses, so anyone can evaluate the full flow; the smoke test (`npm run smoke`, 28 assertions across 4 scenes) proves the lifecycle end to end.

## How we built it

Node.js (built-in `http`/`fetch` only — zero dependencies) with a small modular core: `lib/agent.js` (plan → negotiate → optimize → mandate → order → capture), `lib/paypal.js` (dual-mode PayPal Orders v2 client: real sandbox API, or a local stub with identical response shapes), `lib/llm.js` (env-gated Anthropic/OpenAI planner with deterministic fallback), `lib/catalog.js` (16 products, 8 sellers, private floors), `lib/ledger.js` (JSON-file mandate + receipts, swappable for Neon/D1), and a single-page UI that renders the agent's live trace, the negotiated cart, and the PayPal panel.

## Challenges we ran into

- **Trust is a UX problem, not just a logic problem.** The mandate only matters if a user can *see* the agent stop. We made every gate produce a trace line and a distinct UI state (held / blocked / refused) rather than silently failing.
- **Negotiation without leaking the floor.** The seller's minimum price had to stay out of the API, the UI, and even the run objects — we audited every response shape to keep the haggle fair and the demo honest.
- **Making it judge-runnable.** A demo that needs three accounts and two API keys doesn't get evaluated. The dual-mode PayPal client and zero-dependency server mean `npm start` is the entire setup; real sandbox credentials upgrade it in place.

## Accomplishments we're proud of

- A complete money lifecycle — negotiate → mandate → order → approve → capture → ledger — working end to end on the real PayPal Sandbox API.
- An agent that verifiably *refuses*: budget refusals and mandate blocks are first-class outcomes covered by the automated smoke test, not edge cases.
- Deterministic, reproducible demos: same goal in, same negotiated cart out — the recorded smoke run and demo numbers (e.g., $44.76 vs $53.75 list, $8.99 saved) match the live app exactly.

## What we learned

Agentic commerce isn't bottlenecked by an agent's ability to buy — it's bottlenecked by an owner's willingness to let it. Bounded autonomy (caps, allowlists, escalation thresholds, full traces) is the feature that turns a demo into something a business would actually switch on.

## What's next for CartPilot

- Real marketplace and merchant APIs behind the catalog interface; multi-seller carts with split PayPal orders.
- Mandates v2: per-category caps, vendor allowlists, recurring restock schedules, and team approvals.
- Hosted deployment with Neon/D1-backed ledgers and webhook-driven capture reconciliation (PayPal webhooks for CHECKOUT.ORDER.APPROVED / PAYMENT.CAPTURE.COMPLETED).

## Built with

- Node.js (zero-dependency server)
- PayPal Sandbox — Checkout Orders v2 API + OAuth 2.0 client credentials
- Anthropic Claude / OpenAI (optional, env-gated planning layer)
- Vanilla HTML/CSS/JS front end
- JSON ledger (Neon Postgres / Cloudflare D1-ready)

## AI tools statement (required by the hackathon)

CartPilot's purchasing agent was designed and implemented by the entrant with the assistance of AI coding tools (Claude, by Anthropic) used for code generation, review, and documentation during development. In the product itself, AI is used at runtime in the planning layer: when an `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is configured, the configured LLM parses the shopper's natural-language goal into structured purchasing requirements. No AI-generated media is used in the demo video; all screens shown are the live application, and all payments run on the PayPal sandbox (no real money).

## Try it out (links — fill at submission time)

- **GitHub repo:** <PUBLIC_REPO_URL>
- **Live demo:** <HOSTED_DEMO_URL or "run locally: npm start — see README">
- **Demo video (YouTube, public, <3 min):** <YOUTUBE_URL>

## Judging-criteria map (for our own checklist before submitting)

| Criterion | Where CartPilot answers it |
|---|---|
| Use of PayPal + AI | Real Sandbox Orders v2 lifecycle (create → approve → capture) driven by the agent's planning + negotiation |
| Agentic Commerce | Agent shops, negotiates, decides, escalates, and pays autonomously inside a mandate |
| Creativity | The mandate model + refusal behavior; negotiation with hidden seller floors |
| Impact | Bounded autonomy is the adoption blocker for business purchasing agents — CartPilot is a working pattern for it |
| Execution / demo quality | Zero-setup run, deterministic scenes, recorded smoke test (28/28), <3-min scripted video (DEMO-SCRIPT.md) |
