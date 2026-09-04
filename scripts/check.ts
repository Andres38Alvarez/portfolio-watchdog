import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkTarget, type Target } from "../lib/health-check.js";
import { diagnose } from "../lib/diagnose.js";
import { notify } from "../lib/ntfy.js";
import { openIncidentIssue, closeIncidentIssue } from "../lib/github-issues.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGETS_PATH = new URL("../config/targets.json", import.meta.url);
const STATE_PATH = new URL("../data/state.json", import.meta.url);

type TargetState = {
  status: "up" | "down";
  lastChange: string;
  issueNumber: number | null;
  lastCause?: string;
};
type State = Record<string, TargetState>;

function loadState(): State {
  if (!existsSync(STATE_PATH)) return {};
  return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
}

function saveState(state: State) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

async function main() {
  const targets: Target[] = JSON.parse(readFileSync(TARGETS_PATH, "utf-8"));
  const state = loadState();
  const now = new Date().toISOString();

  for (const target of targets) {
    const previous: TargetState = state[target.name] ?? {
      status: "up",
      lastChange: now,
      issueNumber: null,
    };

    const result = await checkTarget(target);
    console.log(
      `[${target.name}] ok=${result.ok} status=${result.status ?? "n/a"} latency=${result.latencyMs}ms`,
    );

    if (!result.ok && previous.status === "up") {
      // Transition: up -> down. Diagnose, alert, open an issue.
      const diagnosis = await diagnose(target, result);
      const issueNumber = await openIncidentIssue(target, result, diagnosis);

      await notify(
        `🔴 ${target.name} is down`,
        `${diagnosis.likely_cause}\nSeverity: ${diagnosis.severity}\nSuggested action: ${diagnosis.suggested_action}\n${target.url}`,
        "high",
      );

      state[target.name] = {
        status: "down",
        lastChange: now,
        issueNumber,
        lastCause: diagnosis.likely_cause,
      };
    } else if (result.ok && previous.status === "down") {
      // Transition: down -> up. Close the issue, send a recovery ping.
      if (previous.issueNumber) await closeIncidentIssue(previous.issueNumber, target);

      await notify("✅ Recovered", `${target.name} is responding normally again.\n${target.url}`);

      state[target.name] = { status: "up", lastChange: now, issueNumber: null };
    } else {
      // No state change -- keep the existing record as-is.
      state[target.name] = previous;
    }
  }

  mkdirSync(dirname(fileURLToPath(STATE_PATH)), { recursive: true });
  saveState(state);
}

main().catch((err) => {
  console.error("portfolio-watchdog run failed:", err);
  process.exit(1);
});
