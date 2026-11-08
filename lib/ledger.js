// Tiny JSON-file ledger: persists the owner's mandate and every completed
// purchase. Zero dependencies and zero setup — the file is created on first
// write. (For a hosted deployment this can be swapped for Neon Postgres or
// Cloudflare D1 behind the same three functions; the demo keeps it local so
// judges can run it anywhere.)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function createLedger(path) {
  const file = path || process.env.LEDGER_PATH || "./data/ledger.json";

  function load() {
    if (!existsSync(file)) {
      return { mandate: null, entries: [] };
    }
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return { mandate: null, entries: [] };
    }
  }

  function save(data) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 2));
  }

  return {
    getMandate() {
      return load().mandate;
    },
    setMandate(mandate) {
      const data = load();
      data.mandate = mandate;
      save(data);
      return mandate;
    },
    addEntry(entry) {
      const data = load();
      data.entries.push(entry);
      save(data);
      return entry;
    },
    entries() {
      return load().entries;
    },
    totalSpent() {
      return load().entries.reduce((s, e) => s + (e.total || 0), 0);
    },
  };
}
