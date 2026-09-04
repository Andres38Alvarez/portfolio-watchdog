# Portfolio Watchdog

A scheduled health check for my deployed portfolio projects (Cuban Art
Across, Zettelkasten Explorer, Nexarte, Raum Klima), with AI-generated
incident diagnosis instead of a bare "it's down" alert.

Every 30 minutes, a GitHub Actions workflow:

1. Requests each URL in [`config/targets.json`](config/targets.json). If a
   check fails, it retries once after a pause (free hosting tiers like
   Render's spin down after inactivity and can take 30-50s to wake up on
   the first request -- that's not a real incident).
2. On a genuine failure, sends the HTTP status/error to a free model via
   [OpenRouter](https://openrouter.ai/), asking for a structured JSON
   diagnosis (`likely_cause`, `severity`, `suggested_action`) rather than
   free-form text -- the output is parsed and used programmatically (issue
   title, labels), not just displayed.
3. Opens a GitHub Issue with that diagnosis, and closes it automatically
   with a recovery comment once the service responds normally again.
4. Pushes a plain-text push notification via [ntfy.sh](https://ntfy.sh/) --
   no account, no email address, just a topic name.
5. Commits the updated `data/state.json` back to the repo, so the whole
   thing has no external database -- same stateless philosophy as the
   Raum Klima v2 project.

## Why no email or Slack

Both would have meant tying this to a personal inbox or creating a new
chat-app account. ntfy.sh needs neither: pick a long, non-guessable topic
name (e.g. `andy-watchdog-8f2k1x`), and either install the
[ntfy app](https://ntfy.sh/) (Android/iOS) and subscribe to that topic, or
just open `https://ntfy.sh/andy-watchdog-8f2k1x` in a browser tab and leave
it open for web push. Free for up to 250 messages/day. Since the public
server has no auth by default, anyone who guesses your exact topic name
could also read or post to it -- that's why the name should be long and
random, not something like `andy-alerts`.

## One-time setup

1. **Create the GitHub repo.** Make a new repository (private is fine)
   named `portfolio-watchdog` under your GitHub account -- don't
   initialize it with a README, this project already has one.
2. **Push this code** (see below).
3. **Add two repository secrets** — Settings → Secrets and variables →
   Actions → "New repository secret":
   - `OPENROUTER_API_KEY` — a free key from
     [openrouter.ai](https://openrouter.ai/) (sign in with GitHub/Google,
     no card required for the free-tier models used here).
   - `NTFY_TOPIC` — your chosen topic name, e.g. `andy-watchdog-8f2k1x`.

   `GITHUB_TOKEN` does **not** need to be added — GitHub Actions injects it
   automatically for every run.
4. **Subscribe to your ntfy topic** from the app or the web page above.
5. **Trigger a test run** — Actions tab → "Portfolio Watchdog" →
   "Run workflow". Check the run log, and check
   `data/state.json` gets committed back.

## Running locally

```bash
npm install
cp .env.example .env.local
# fill in OPENROUTER_API_KEY and NTFY_TOPIC in .env.local
node --env-file=.env.local --import tsx scripts/check.ts
```

Without `GITHUB_TOKEN`/`GITHUB_REPOSITORY` set, the issue-tracking step is
skipped automatically (useful for a local dry run) and everything else
still works.

## Project structure

```
config/targets.json     -- the URLs being watched
lib/health-check.ts      -- fetch + retry logic
lib/diagnose.ts           -- OpenRouter call, structured JSON diagnosis
lib/ntfy.ts                -- push notification
lib/github-issues.ts        -- open/close incident issues
scripts/check.ts              -- orchestrates one run, updates data/state.json
data/state.json                -- current up/down status per target (committed by CI)
.github/workflows/watchdog.yml  -- the schedule
```
