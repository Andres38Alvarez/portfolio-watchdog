/**
 * Pushes a plain-text notification to a ntfy.sh topic. No account, no API
 * key, no email address involved -- see README for how to pick a topic
 * name and subscribe to it from the phone app or ntfy.sh/<topic> in a
 * browser. Silently no-ops if NTFY_TOPIC isn't configured, so the rest of
 * the pipeline (issues, state file) still works without it.
 */
export async function notify(title: string, message: string, priority: "default" | "high" = "default") {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;

  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers: {
        Title: title,
        Priority: priority,
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: message,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // A failed notification shouldn't crash the whole run -- the GitHub
    // Issue and state.json are the source of truth either way.
  }
}
