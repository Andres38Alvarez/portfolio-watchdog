import type { Target, CheckResult } from "./health-check.js";
import type { Diagnosis } from "./diagnose.js";

function repoParts(): { owner: string; repo: string } | null {
  const repo = process.env.GITHUB_REPOSITORY; // "owner/repo", set automatically in Actions
  if (!repo) return null;
  const [owner, name] = repo.split("/");
  return { owner, repo: name };
}

function authHeaders() {
  const token = process.env.GITHUB_TOKEN;
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

/**
 * Opens a GitHub Issue documenting the incident, with the AI diagnosis in
 * the body. Uses GITHUB_TOKEN, which GitHub Actions injects automatically
 * for every workflow run -- no personal email, password, or extra secret
 * needed for this part. Returns null (and no-ops) if run outside Actions
 * without a token configured, e.g. a local dry run.
 */
export async function openIncidentIssue(
  target: Target,
  result: CheckResult,
  diagnosis: Diagnosis,
): Promise<number | null> {
  const parts = repoParts();
  const token = process.env.GITHUB_TOKEN;
  if (!parts || !token) return null;

  const body = [
    `**URL:** ${target.url}`,
    `**HTTP status:** ${result.status ?? "no response"}`,
    "error" in result && result.error ? `**Error:** ${result.error}` : null,
    "",
    "**AI diagnosis**",
    `- Likely cause: ${diagnosis.likely_cause}`,
    `- Severity: ${diagnosis.severity}`,
    `- Suggested action: ${diagnosis.suggested_action}`,
    "",
    "_Opened automatically by [portfolio-watchdog](https://github.com/" +
      parts.owner +
      "/portfolio-watchdog)._",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const res = await fetch(`https://api.github.com/repos/${parts.owner}/${parts.repo}/issues`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      title: `🔴 ${target.name} is down`,
      body,
      labels: ["incident", `severity:${diagnosis.severity}`],
    }),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as { number?: number };
  return json.number ?? null;
}

/** Closes the incident issue and leaves a recovery comment. */
export async function closeIncidentIssue(issueNumber: number, target: Target) {
  const parts = repoParts();
  const token = process.env.GITHUB_TOKEN;
  if (!parts || !token) return;

  await fetch(`https://api.github.com/repos/${parts.owner}/${parts.repo}/issues/${issueNumber}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ state: "closed" }),
  });

  await fetch(
    `https://api.github.com/repos/${parts.owner}/${parts.repo}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        body: `✅ ${target.name} responded normally again -- closed automatically by portfolio-watchdog.`,
      }),
    },
  );
}
