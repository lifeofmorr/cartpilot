// PayPal Orders v2 client.
//
// Two modes, chosen by environment:
//  - SANDBOX: PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET are set. The client talks
//    to the real PayPal Sandbox API (default https://api-m.sandbox.paypal.com)
//    using the standard OAuth2 client-credentials flow, then creates, reads and
//    captures Orders v2 orders. No code path ever touches the live API unless
//    PAYPAL_API_BASE is deliberately changed.
//  - STUB ("simulator"): no credentials configured. A local in-memory stub
//    returns responses shaped exactly like the sandbox API (same fields:
//    id, intent, status, purchase_units, links, payer, captures) so the full
//    agent flow — and the smoke test — runs end to end with zero setup.
//    Mode is always visible: server logs it and /api/health reports it.

const money = (n) => n.toFixed(2);

export function createPayPalClient(env = process.env) {
  const clientId = env.PAYPAL_CLIENT_ID || "";
  const clientSecret = env.PAYPAL_CLIENT_SECRET || "";
  const base = (env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com").replace(/\/$/, "");
  const returnUrl = env.RETURN_URL || "http://localhost:4173/return";
  const cancelUrl = env.CANCEL_URL || "http://localhost:4173/cancel";

  if (clientId && clientSecret) {
    return new SandboxClient({ clientId, clientSecret, base, returnUrl, cancelUrl });
  }
  return new StubClient({ base, returnUrl });
}

class SandboxClient {
  constructor(cfg) {
    this.mode = "sandbox";
    this.cfg = cfg;
    this._token = null;
    this._tokenExp = 0;
  }

  async _accessToken() {
    if (this._token && Date.now() < this._tokenExp - 30_000) return this._token;
    const auth = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64");
    const res = await fetch(`${this.cfg.base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      throw new Error(`PayPal OAuth failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    this._token = data.access_token;
    this._tokenExp = Date.now() + data.expires_in * 1000;
    return this._token;
  }

  async _api(path, options = {}) {
    const token = await this._accessToken();
    const res = await fetch(`${this.cfg.base}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(`PayPal API ${options.method || "GET"} ${path} -> ${res.status}`);
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return data;
  }

  async createOrder({ items, total, description }) {
    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "cartpilot-cart",
          description: description || "CartPilot agent purchase",
          amount: {
            currency_code: "USD",
            value: money(total),
            breakdown: {
              item_total: { currency_code: "USD", value: money(total) },
            },
          },
          items: items.map((i) => ({
            name: i.name.slice(0, 127),
            quantity: String(i.quantity),
            unit_amount: {
              currency_code: "USD",
              value: money(i.unitPrice),
            },
          })),
        },
      ],
      application_context: {
        brand_name: "CartPilot",
        landing_page: "LOGIN",
        user_action: "PAY_NOW",
        return_url: this.cfg.returnUrl,
        cancel_url: this.cfg.cancelUrl,
      },
    };
    return this._api("/v2/checkout/orders", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getOrder(orderId) {
    return this._api(`/v2/checkout/orders/${orderId}`);
  }

  async captureOrder(orderId) {
    return this._api(`/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      body: "{}",
    });
  }

  // In sandbox mode the buyer approves on PayPal's hosted page (the "approve"
  // link from the created order). There is no merchant-side approve call.
  async buyerApprove() {
    throw new Error(
      "In sandbox mode the buyer approves on PayPal's hosted page — open the order's approve link, then capture."
    );
  }
}

// ---------------------------------------------------------------------------

let stubSeq = 1000;

class StubClient {
  constructor(cfg) {
    this.mode = "stub";
    this.cfg = cfg;
    this.orders = new Map();
  }

  _newId(prefix) {
    stubSeq += 1;
    return `${prefix}-${(stubSeq * 7919).toString(36).toUpperCase().padStart(8, "0")}`;
  }

  async createOrder({ items, total, description }) {
    const id = this._newId("STUBORDER");
    const order = {
      id,
      intent: "CAPTURE",
      status: "CREATED",
      purchase_units: [
        {
          reference_id: "cartpilot-cart",
          description: description || "CartPilot agent purchase",
          amount: {
            currency_code: "USD",
            value: money(total),
            breakdown: {
              item_total: { currency_code: "USD", value: money(total) },
            },
          },
          items: items.map((i) => ({
            name: i.name,
            quantity: String(i.quantity),
            unit_amount: { currency_code: "USD", value: money(i.unitPrice) },
          })),
        },
      ],
      links: [
        { href: `${this.cfg.base}/v2/checkout/orders/${id}`, rel: "self", method: "GET" },
        {
          href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
          rel: "approve",
          method: "GET",
        },
        { href: `${this.cfg.base}/v2/checkout/orders/${id}/capture`, rel: "capture", method: "POST" },
      ],
      create_time: new Date().toISOString(),
      _stub: true,
    };
    this.orders.set(id, order);
    return structuredClone(order);
  }

  async getOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) {
      const err = new Error(`Stub order not found: ${orderId}`);
      err.status = 404;
      throw err;
    }
    return structuredClone(order);
  }

  // Simulates the buyer clicking through PayPal's hosted approval page.
  async buyerApprove(orderId) {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Stub order not found: ${orderId}`);
    if (order.status !== "CREATED") {
      throw new Error(`Order ${orderId} cannot be approved from status ${order.status}`);
    }
    order.status = "APPROVED";
    order.payer = {
      name: { given_name: "Demo", surname: "Buyer" },
      email_address: "demo-buyer@example.com",
      payer_id: "STUBPAYER01",
      address: { country_code: "US" },
    };
    return structuredClone(order);
  }

  async captureOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Stub order not found: ${orderId}`);
    if (order.status !== "APPROVED") {
      const err = new Error(
        `Order ${orderId} is ${order.status}; PayPal requires status APPROVED before capture.`
      );
      err.status = 422;
      throw err;
    }
    const total = order.purchase_units[0].amount.value;
    order.status = "COMPLETED";
    order.purchase_units[0].payments = {
      captures: [
        {
          id: this._newId("STUBCAP"),
          status: "COMPLETED",
          amount: { currency_code: "USD", value: total },
          final_capture: true,
          create_time: new Date().toISOString(),
        },
      ],
    };
    return structuredClone(order);
  }
}

export function approveLink(order) {
  const link = (order.links || []).find((l) => l.rel === "approve");
  return link ? link.href : null;
}
