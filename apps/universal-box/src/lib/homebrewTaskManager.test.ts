import { describe, expect, it } from "vitest";
import {
  formatHomebrewDuration,
  homebrewEventBelongsToActiveJob,
  homebrewTaskOutcome,
  homebrewTaskVisualState,
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



describe("Homebrew task visual states", () => {
  it("distinguishes running, cancellation, and observed final outcomes", () => {
    expect(homebrewTaskVisualState(true, false, "正在执行 · 任务 #12")).toBe("running");
    expect(homebrewTaskVisualState(true, true, "已请求取消，正在等待进程结束…")).toBe("cancelling");
    expect(homebrewTaskVisualState(false, false, "操作成功完成")).toBe("success");
    expect(homebrewTaskVisualState(false, false, "操作失败，请检查日志")).toBe("failed");
    expect(homebrewTaskVisualState(false, false, "操作已取消")).toBe("cancelled");
    expect(homebrewTaskVisualState(false, false, " ")).toBe("idle");
    expect(homebrewTaskVisualState(false, false, "取消请求失败")).toBe("failed");
  });
});

describe("Homebrew event identity and task lifetime", () => {
  it("accepts a current job and ignores a stale or duplicate job", () => {
    expect(homebrewEventBelongsToActiveJob(12, 12, true, new Set())).toBe(true);
    expect(homebrewEventBelongsToActiveJob(11, 12, true, new Set())).toBe(false);
    expect(homebrewEventBelongsToActiveJob(12, 12, true, new Set([12]))).toBe(false);
  });

  it("allows an immediate completion before start IPC returns, but not after idle", () => {
    expect(homebrewEventBelongsToActiveJob(1, null, true, new Set())).toBe(true);
    expect(homebrewEventBelongsToActiveJob(1, null, false, new Set())).toBe(false);
    expect(homebrewEventBelongsToActiveJob(0, null, true, new Set())).toBe(false);
    expect(homebrewEventBelongsToActiveJob(Number.MAX_SAFE_INTEGER + 1, null, true, new Set())).toBe(false);
  });
});
