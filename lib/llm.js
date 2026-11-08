// Optional LLM planning layer.
//
// If ANTHROPIC_API_KEY or OPENAI_API_KEY is set, the shopper's free-text goal
// is sent to the model, which returns structured purchasing requirements as
// JSON. If no key is set (or the call fails), the caller falls back to the
// built-in deterministic planner in agent.js — so the demo, the judges, and
// the smoke test never depend on an API key being present.

export function llmProvider(env = process.env) {
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.OPENAI_API_KEY) return "openai";
  return "rules";
}

const SYSTEM = `You are the planning brain of CartPilot, a purchasing agent.
Given a shopper's goal, output ONLY a JSON object of this shape:
{
  "requirements": [
    { "match": "<product keyword or short product phrase>", "quantity": <int>, "essential": <bool> }
  ],
  "budget": <number or null>,
  "note": "<one short sentence explaining the plan>"
}
Rules: quantities default to 1. "essential" is true for items the shopper explicitly named or demanded a minimum of.
Budget is a dollar number only if the shopper stated one. No prose outside the JSON.`;

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("LLM did not return JSON");
  return JSON.parse(text.slice(start, end + 1));
}

export async function planWithLLM(goal, env = process.env) {
  const provider = llmProvider(env);
  if (provider === "rules") return null;

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        max_tokens: 512,
        system: SYSTEM,
        messages: [{ role: "user", content: goal }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = await res.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return extractJson(text);
  }

  // OpenAI
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: goal },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}`);
  const data = await res.json();
  return extractJson(data.choices[0].message.content);
}
