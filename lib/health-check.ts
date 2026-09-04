export type Target = { name: string; url: string };

export type CheckResult =
  | { ok: true; status: number; latencyMs: number }
  | { ok: false; status: number | null; latencyMs: number; error?: string; bodySnippet?: string };

async function attempt(url: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const bodySnippet = (await res.text().catch(() => "")).slice(0, 500);
      return { ok: false, status: res.status, latencyMs, bodySnippet };
    }
    return { ok: true, status: res.status, latencyMs };
  } catch (err) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Render's free tier spins services down after inactivity -- the first
 * request after a period idle can take 30-50s to wake up and may time out.
 * A single failed request is therefore not proof of a real incident, so we
 * retry once after a pause before treating it as "down". This directly
 * encodes a lesson learned the hard way earlier on these same deployments.
 */
export async function checkTarget(target: Target): Promise<CheckResult> {
  const first = await attempt(target.url);
  if (first.ok) return first;

  await new Promise((r) => setTimeout(r, 25000));
  return attempt(target.url);
}
