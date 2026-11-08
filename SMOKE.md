# Smoke test record

Command: `npm run smoke` (boots the real server on an ephemeral port, stub PayPal
mode, isolated temp ledger; drives four full agent scenes over HTTP).
Environment: Node v24.22.1, no credentials set. Run twice consecutively on
2026-11-03 — identical pass both times.

```
[smoke] server up — paypalMode=stub llm=rules
  PASS  health reports stub PayPal mode
  PASS  health reports built-in planner
[smoke] scene 1: coffee + paper towels, under $60, auto-approved
  PASS  run created an order
  PASS  cart has 2 lines
  PASS  coffee quantity parsed as 2
  PASS  negotiation beat list price
  PASS  cart within the $60 goal budget
  PASS  order total matches cart total
  PASS  approve link present (PayPal-shaped)
  PASS  trace shows negotiation
  PASS  buyer approval moves order to BUYER_APPROVED
  PASS  capture completes the run
  PASS  receipt has a capture id
  PASS  order status is COMPLETED
  PASS  ledger recorded the purchase
  PASS  ledger total matches
[smoke] scene 2: bulk stock-up held by the mandate, then approved
  PASS  run held for owner approval
  PASS  no PayPal order exists while held
  PASS  held cart is above the $50 auto-approve limit
  PASS  quantities parsed as 3 mugs / 2 notebooks
  PASS  owner approval creates the order
  PASS  approved run completes
[smoke] scene 3: essentials over the stated budget — agent refuses
  PASS  run blocked by budget
  PASS  no order created for the blocked run
[smoke] scene 4: category outside the mandate allowlist — blocked
  PASS  run blocked by mandate
  PASS  no order created for the mandate-blocked run
  PASS  ledger still holds exactly the 2 completed purchases

[smoke] ALL SCENES PASSED
```

## Verified demo numbers (same build, manual API run)

| Scene | Goal | Result | Cart | List | Saved |
|---|---|---|---|---|---|
| 1 | 2 bags of coffee + paper towels, under $60 | Order created → approved → captured | $44.76 | $53.75 | $8.99 (17%) |
| 2 | 3 mug sets + 2 notebook packs | Held by mandate (>$50 auto-approve) → owner approved → captured | $103.29 | $125.97 | $22.68 (18%) |
| 3 | Desk lamp + wireless mouse, under $40 | **BLOCKED_BUDGET** — essentials $47.14 > $40; agent refused, no order | — | — | — |

Scene 1 trace excerpt (verbatim from the API):

```
plan      | Shopping list: 1 x Recycled Paper Towels, 12 Rolls; 2 x Ethiopian Yirgacheffe Coffee Beans 1kg.
negotiate | Negotiating with CleanSupply for "Recycled Paper Towels, 12 Rolls" (list $16.75). Opening offer $13.74.
negotiate | CleanSupply countered at $15.09.
negotiate | Agent raised to $14.42; CleanSupply accepted — $2.33 under list.
negotiate | Highland Roasters accepted $15.17 — $3.33 under list.
budget    | Final cart $44.76 (list $53.75, negotiated savings $8.99).
mandate   | Mandate check passed (categories + total budget).
paypal    | PayPal order created (stub mode), status CREATED, total $44.76. Awaiting buyer approval.
```
