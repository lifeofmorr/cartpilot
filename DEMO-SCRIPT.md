# Demo video script — CartPilot (target 2:30, hard cap 3:00)

**Recording setup**
- Run the app with PayPal **sandbox credentials set** if available (badge reads
  "PayPal: SANDBOX (live API)") so the hosted PayPal approval page appears on
  camera. If recording before credentials land, simulator mode is honest on
  screen too — the badge says SIMULATOR and the flow is identical.
- Mandate defaults loaded: total cap $200, auto-approve limit $50, all
  categories allowed. Clear the ledger first for a clean take
  (delete `data/ledger.json`, restart).
- Browser at 1280×720, 110% zoom. Cursor movements slow and deliberate.
- Narration: conversational, ~150 wpm. Total script ≈ 360 words ≈ 2:25.

---

## Shot list + narration

### 0:00–0:20 — The hook (homepage, full UI in frame)
**On screen:** CartPilot UI idle. Slow push-in on the header, then the mandate card.
**Narration:**
> "Everyone's building AI agents that can *talk* about shopping. CartPilot
> actually buys — with your money rules hard-coded in. It's a purchasing agent
> with a mandate: it negotiates with sellers, it cannot break your budget, and
> it pays through PayPal."

### 0:20–0:40 — The mandate
**On screen:** Click through the mandate card: $200 total cap, $50 auto-approve limit, category checkboxes. Click **Save mandate**.
**Narration:**
> "First, the mandate. A total cap of two hundred dollars. Anything under
> fifty, the agent may buy on its own. Above fifty, it must ask me first. And
> it can only buy from categories I allow. These aren't suggestions — the agent
> checks them before any order exists."

### 0:40–1:25 — Scene 1: it negotiates and pays
**On screen:** Click the chip **"Coffee run · under $60"**, then **Run the agent**. Let the trace play: plan → two negotiations → budget line → PayPal order created.
**Narration (over the trace):**
> "The goal: two bags of coffee and paper towels, under sixty dollars. Watch
> it negotiate — it opens below list, CleanSupply counters, they split the
> difference. Highland Roasters accepts its first offer. Final cart: forty-four
> seventy-six — seventeen percent under list — inside budget, inside the
> mandate, so it creates a real PayPal order on its own."
**On screen:** Click **Approve on PayPal** (sandbox) / **Simulate buyer approval** (simulator). On PayPal's sandbox page, log in as the sandbox buyer and approve (~5 seconds of footage, can be sped up). Return, click **Capture payment**. Receipt appears.
**Narration:**
> "The buyer approves on PayPal's own page — the agent never touches card
> details — then it captures. Payment complete, receipt written to the ledger."

### 1:25–2:00 — Scene 2: the mandate holds it
**On screen:** Click the chip **"New-starter stock-up"**, run it. Trace builds a $103.29 cart, then the status flips to *held*. Show the PayPal card: no order exists. Click **Approve this purchase (mandate)** → order created → approve → capture quickly.
**Narration:**
> "Now a bigger job: mugs and notebooks for new starters. It negotiates a
> hundred and three dollars — twenty-two dollars saved — but that's over my
> fifty-dollar auto-approve limit. So it stops. No PayPal order exists yet. The
> agent waits for *me*. I approve, and only then does it create the order and
> complete the purchase."

### 2:00–2:30 — Scene 3: it refuses to overspend
**On screen:** Click the chip **"Lamp + mouse · under $40"**, run it. The trace ends in **BLOCKED_BUDGET**, status line turns red: essentials $47.14 against a $40 budget.
**Narration:**
> "And when the goal itself is impossible — a lamp and a mouse under forty
> dollars, when the cheapest honest cart is forty-seven — CartPilot refuses.
> No order, no overspend, and a clear explanation. That's what a mandate
> means."

### 2:30–2:50 — Close
**On screen:** Scroll the ledger (two completed purchases, totals + savings), end on the header.
**Narration:**
> "CartPilot: an agent that shops, negotiates, and pays with PayPal — bounded
> by rules you set, transparent in everything it does. Built for the PayPal AI
> Hackathon, running entirely on the PayPal sandbox. Thank you."

---

## Production notes
- Keep every UI beat real-time except the PayPal sandbox login (may be trimmed
  to the approve click). Do not fake any screen.
- If a take runs long, cut Scene 2's capture steps (stop at the order-created
  moment) — the hold + approval is the story.
- Upload as a **public YouTube** video; paste the link into the Devpost
  submission (see `DEVPOST.md`). Title: "CartPilot — The Purchasing Agent With
  a Mandate (PayPal AI Hackathon)".
