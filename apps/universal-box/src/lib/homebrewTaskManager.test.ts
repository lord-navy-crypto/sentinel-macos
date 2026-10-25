import { describe, expect, it } from "vitest";
import {
  formatHomebrewDuration,
  homebrewTaskOutcome,
  prependHomebrewTaskHistory,
  type HomebrewTaskRecord,
} from "./homebrewTaskManager";

function record(id: number, outcome: HomebrewTaskRecord["outcome"] = "success"): HomebrewTaskRecord {
  return {
    id,
    label: `任务 ${id}`,
    outcome,
    finishedAt: "12:00:00",
    durationMs: 1000,
    exitCode: outcome === "success" ? 0 : outcome === "cancelled" ? -15 : 1,
  };
}

describe("Homebrew task history helpers", () => {
  it("classifies success, failure, and requested cancellation", () => {
    expect(homebrewTaskOutcome(0, false)).toBe("success");
    expect(homebrewTaskOutcome(1, false)).toBe("failed");
    expect(homebrewTaskOutcome(null, false)).toBe("failed");
    expect(homebrewTaskOutcome(-15, true)).toBe("cancelled");
    expect(homebrewTaskOutcome(0, true)).toBe("success");
  });

  it("prepends newest tasks, deduplicates IDs, and enforces the history bound", () => {
    const old = [record(1), record(2), record(3)];
    expect(prependHomebrewTaskHistory(old, record(4)).map((item) => item.id)).toEqual([4, 1, 2, 3]);
    expect(prependHomebrewTaskHistory(old, record(2, "failed")).map((item) => item.id)).toEqual([2, 1, 3]);
    expect(prependHomebrewTaskHistory(old, record(5), 2).map((item) => item.id)).toEqual([5, 1]);
    expect(prependHomebrewTaskHistory(old, record(5), 0)).toEqual([]);
  });

  it("formats measured duration without inventing progress", () => {
    expect(formatHomebrewDuration(0)).toBe("0 秒");
    expect(formatHomebrewDuration(59_900)).toBe("59 秒");
    expect(formatHomebrewDuration(123_000)).toBe("2 分 3 秒");
    expect(formatHomebrewDuration(null)).toBe("未知");
    expect(formatHomebrewDuration(-1)).toBe("未知");
  });
});
