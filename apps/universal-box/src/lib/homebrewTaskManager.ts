export type HomebrewTaskOutcome = "success" | "failed" | "cancelled";

export interface HomebrewTaskRecord {
  id: number;
  label: string;
  outcome: HomebrewTaskOutcome;
  finishedAt: string;
  durationMs: number | null;
  exitCode: number | null;
}

/** Classify the observed process result without pretending a cancellation succeeded before exit. */
export function homebrewTaskOutcome(
  exitCode: number | null,
  cancelRequested: boolean,
): HomebrewTaskOutcome {
  if (cancelRequested && exitCode !== 0) return "cancelled";
  return exitCode === 0 ? "success" : "failed";
}

/** Newest-first, duplicate-resistant, bounded history; callers should store metadata only. */
export function prependHomebrewTaskHistory(
  history: readonly HomebrewTaskRecord[],
  entry: HomebrewTaskRecord,
  limit = 8,
): HomebrewTaskRecord[] {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(0, Math.min(20, Math.floor(limit)))
    : 8;
  if (safeLimit === 0) return [];
  return [entry, ...history.filter((item) => item.id !== entry.id)].slice(0, safeLimit);
}

/** Format observed wall-clock duration, not a fabricated progress percentage. */
export function formatHomebrewDuration(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) return "未知";
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes} 分` : `${minutes} 分 ${remainder} 秒`;
}
