import type { Target, CheckResult } from "./health-check.js";

export type Diagnosis = {
  likely_cause: string;
  severity: "low" | "medium" | "high";
  suggested_action: string;
};

const FALLBACK: Diagnosis = {
  likely_cause: "AI diagnosis unavailable (OpenRouter request failed or returned an unexpected shape).",
  severity: "medium",
  suggested_action: "Check the service manually and inspect the raw HTTP status/error in this issue.",
};

/**
 * Asks a free OpenRouter model for a structured (JSON) incident diagnosis.
 * This is the part that makes the automation more than a wrapper around a
 * chat completion: the output is parsed and consumed programmatically by
 * the rest of the pipeline (issue title/labels, severity-based routing),
 * not just displayed as free text.
 */
export async function diagnose(target: Target, result: CheckResult): Promise<Diagnosis> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return FALLBACK;

  const errorLine = "error" in result ? result.error ?? "n/a" : "n/a";
  const bodyLine = "bodySnippet" in result ? result.bodySnippet ?? "n/a" : "n/a";

  const prompt = `You are an SRE assistant triaging an automated uptime check failure.

Service: ${target.name}
URL: ${target.url}
HTTP status: ${result.status ?? "no response"}
Error: ${errorLine}
Response body snippet: ${bodyLine}

Note: this service may run on a free hosting tier that spins down after
inactivity and takes time to wake up on the first request -- consider that
as one possible cause among others (e.g. expired database, misconfigured
env var, upstream API failure, real outage).

Reply with ONLY a JSON object, no markdown fences, no extra text, matching
exactly this shape:
{"likely_cause": "<one sentence>", "severity": "low"|"medium"|"high", "suggested_action": "<one sentence>"}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return FALLBACK;

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text: string = json.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);

    if (
      typeof parsed.likely_cause === "string" &&
      ["low", "medium", "high"].includes(parsed.severity) &&
      typeof parsed.suggested_action === "string"
    ) {
      return parsed;
    }
    return FALLBACK;
  } catch {
    return FALLBACK;
  }
}
