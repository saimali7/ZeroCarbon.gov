"use client";

import { useCallback, useState } from "react";
import type { ActiveRun } from "../../_lib/runs";
import { HomeAssistant } from "./home-assistant";
import { HomeGreeting } from "./home-greeting";
import { RunsPanel } from "./runs-panel";

/**
 * Start page: the assistant (drop a submission folder, watch the review run) and the list of
 * review runs to open. The two share the active run so the list can show it live.
 */
export function HomeScreen() {
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [runsVersion, setRunsVersion] = useState(0);
  const refreshRuns = useCallback(() => setRunsVersion((v) => v + 1), []);

  return (
    <div className="flex flex-col gap-8">
      <HomeGreeting />
      <HomeAssistant onRunChange={setActiveRun} onRunsChanged={refreshRuns} />
      <RunsPanel activeRun={activeRun} refreshKey={runsVersion} />
    </div>
  );
}
