# CartPilot — the purchasing agent with a mandate

**Give an AI agent a goal and a budget. It shops, negotiates with sellers,
obeys your spending mandate, and pays with PayPal.**

CartPilot is an autonomous purchasing agent built for the PayPal AI Hackathon.
You describe what you need in plain language ("Buy 2 bags of coffee and paper
towels for the office, under $60") and set a **mandate** — a total budget cap,
an auto-approve limit, and the categories the agent may buy from. CartPilot
then:

1. **Plans** — parses the goal into a shopping list (quantities, essentials,
   budget). With an LLM key configured it uses the model; with no key it uses a
   built-in deterministic planner, so the demo always runs.
2. **Negotiates** — haggles with each marketplace seller over multiple rounds
   (opening offer → counter → split the difference). Sellers have private floor
   prices the agent never sees; in testing it lands **~17–18% under list**.
3. **Enforces the mandate** — before any money moves. A cart above the
   auto-approve limit is *held* for the owner's approval (no PayPal order
   exists yet). A cart outside the category allowlist, over the total cap, or
   whose essentials alone exceed the budget is **blocked outright** — the agent
   refuses to overspend, and explains why.
4. **Pays with PayPal** — creates a real **PayPal Sandbox Orders v2** order,
   sends the buyer to PayPal's hosted approval page, verifies the approval,
   captures the payment, and writes a receipt to a persistent ledger.
5. **Shows its work** — every decision lands in a live, human-readable trace.

---

## Quick start (judges: this is the whole setup)

Requirements: **Node.js 18+**. There are **no dependencies to install**.

```bash
git clone <this repo>
cd cartpilot
npm start
# open http://localhost:4173
```

That runs CartPilot in **simulator mode**: the complete agent flow works end
to end against a local stub that returns PayPal-shaped responses (same fields
as the real API), so you can evaluate everything with zero accounts.

### Turn on the real PayPal Sandbox (2 minutes)

1. Create a free sandbox app at
   [developer.paypal.com](https://developer.paypal.com) → *Apps & Credentials*
   → *Sandbox* → *Create App*.
2. Copy `.env.example` to `.env` (or export the variables) and fill in:

```bash
PAYPAL_CLIENT_ID=<your sandbox client id>
PAYPAL_CLIENT_SECRET=<your sandbox secret>
RETURN_URL=http://localhost:4173/return
CANCEL_URL=http://localhost:4173/cancel
```

3. Restart `npm start`. The header badge now reads **PayPal: SANDBOX (live
   API)**. When the agent creates an order, the "Approve on PayPal" button
   opens PayPal's real hosted sandbox approval page (log in with a sandbox
   buyer account); after approval you're redirected back and can capture.

Sandbox only: the client defaults to `https://api-m.sandbox.paypal.com` and
no code path performs live-money operations.

### Optional: real LLM planning

Set `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) and the planner upgrades to the
model for goal parsing and reasoning. Without a key the deterministic planner
handles the demo catalog's vocabulary. See `.env.example` for model overrides.

### Run the smoke test

```bash
npm run smoke
```

Boots the server and drives four scripted scenes over HTTP: an auto-approved
purchase, a mandate-held purchase released by the owner, a budget refusal, and
a mandate block — 28 assertions, all passing. Recorded output: `SMOKE.md`.

---

## The three demo scenes (try them in the UI)

| Goal (sample chips in the UI) | What happens |
|---|---|
| "Buy 2 bags of coffee and paper towels for the office, under $60" | Negotiates both lines to **$44.76** (list $53.75, saves $8.99), auto-approves under the default $50 limit, creates the PayPal order, captures after buyer approval. |
| "Stock up: 3 sets of mugs and 2 packs of notebooks for the new starters" | Builds a **$103.29** cart (saves $22.68) but that's above the auto-approve limit → the agent **holds** and asks the owner. Approve it and the PayPal order is created. |
| "Buy a desk lamp and a wireless mouse, under $40" | Essentials total $47.14 > $40 → **BLOCKED**. The agent refuses to overspend and creates no order. |

---

## How it works

```
server.js            Zero-dependency HTTP server + API + static UI
lib/agent.js         The agent: parse -> negotiate -> optimize -> mandate -> order -> capture
lib/paypal.js        PayPal Orders v2 client — real Sandbox API, or a local
                     stub with byte-shape-identical responses when no keys are set
lib/llm.js           Optional LLM planner (Anthropic / OpenAI), env-gated
lib/catalog.js       Demo marketplace: 16 products, 8 sellers, private floor prices
lib/ledger.js        JSON-file ledger: mandate + completed purchase receipts
public/              Single-page UI: mandate, goal, live trace, cart, PayPal panel, ledger
test/smoke.mjs       End-to-end smoke test (4 scenes, 28 assertions)
```

**API** (all JSON): `GET /api/health` · `GET /api/catalog` · `GET|POST
/api/mandate` · `POST /api/run` · `GET /api/run/:id` · `POST
/api/run/:id/approve-mandate` · `POST /api/run/:id/buyer-approve` (simulator
mode) · `POST /api/run/:id/capture` · `GET /api/ledger`.

**The mandate model** is the safety story of agentic commerce: the agent is
capable but *bounded*. Caps and allowlists are checked **before** an order
exists, large purchases escalate to a human, and every action is traced and
ledgered. Seller floor prices never leak — they are absent from the API, the
UI, and the run objects.

**Persistence** is a local JSON ledger by design (zero setup for judges). The
three ledger functions are the only storage surface, so swapping in Neon
Postgres or Cloudflare D1 for a hosted deployment is a one-file change.

## License

MIT — see `LICENSE`.
