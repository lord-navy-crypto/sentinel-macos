import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HomebrewActionConfirmation,
  HomebrewInfoPanel,
  HomebrewOperationPanel,
  HomebrewStatusOverview,
  HomebrewSearchFeedback,
  HomebrewWorkflowProgress,
  type HomebrewActionRequest,
  type HomebrewJobPhase,
} from "./HomebrewWorkflowPanels";

function markup(node: ReactNode): string {
  return renderToStaticMarkup(node);
}

describe("Homebrew search workflow UI", () => {
  it("shows a distinct search-in-progress state and explains that stale results were cleared", () => {
    const html = markup(<HomebrewSearchFeedback phase="searching" kind="cask" query="firefox" resultCount={0} />);
    expect(html).toContain('data-testid="brew-search-feedback"');
    expect(html).toContain('data-phase="searching"');
    expect(html).toContain("正在搜索 Homebrew");
    expect(html).toContain("旧结果已清除");
    expect(html).toContain("Mac 应用（Cask）");
  });

  it("shows an explicit empty state instead of an unexplained blank results area", () => {
    const html = markup(<HomebrewSearchFeedback phase="empty" kind="cask" query="unknown-package" resultCount={0} />);
    expect(html).toContain('data-phase="empty"');
    expect(html).toContain("没有找到匹配项");
    expect(html).toContain("unknown-package");
    expect(html).toContain("更新 Homebrew 软件索引");
  });

  it("keeps result count and query together so a later edit cannot mislabel old results", () => {
    const html = markup(<HomebrewSearchFeedback phase="results" kind="cask" query="firefox" resultCount={3} />);
    expect(html).toContain('data-phase="results"');
    expect(html).toContain("firefox");
    expect(html).toContain("3 项");
    expect(markup(<HomebrewSearchFeedback phase="idle" kind="cask" query="" resultCount={0} />)).toBe("");
  });

  it("provides a recoverable failed-search state", () => {
    const html = markup(<HomebrewSearchFeedback phase="failed" kind="cask" query="firefox" resultCount={0} />);
    expect(html).toContain('data-phase="failed"');
    expect(html).toContain("搜索未完成");
    expect(html).toContain("错误信息");
  });

  it("clearly labels old results when the input changes before another search", () => {
    const html = markup(<HomebrewSearchFeedback phase="results" kind="cask" query="firefox" resultCount={3} queryChanged={true} />);
    expect(html).toContain('data-phase="stale"');
    expect(html).toContain("输入已更改，尚未重新搜索");
    expect(html).toContain("firefox");
    expect(html).toContain("3 项");
    expect(html).toContain("点击“搜索软件”后才会更新结果");
  });
});

describe("Homebrew connected workflow progress", () => {
  it("keeps search, confirmation, execution, and result steps in a predictable order", () => {
    const cases = [
      {step: "search" as const, current: "search", complete: [] as string[]},
      {step: "confirm" as const, current: "confirm", complete: ["search"]},
      {step: "execute" as const, current: "execute", complete: ["search", "confirm"]},
      {step: "result" as const, current: "result", complete: ["search", "confirm", "execute"]},
    ];
    for (const item of cases) {
      const html = markup(<HomebrewWorkflowProgress step={item.step} searchPhase="results" />);
      expect(html).toContain('data-testid="brew-workflow-progress"');
      expect(html).toContain('data-current-step="' + item.current + '"');
      expect(html).toContain('data-testid="brew-workflow-step-' + item.current + '"');
      for (const completeStep of item.complete) {
        expect(html).toContain('data-testid="brew-workflow-step-' + completeStep + '"');
        expect(html).toContain('data-state="complete"');
      }
    }
  });

  it("keeps the current search status visible in the workflow stepper", () => {
    const searching = markup(<HomebrewWorkflowProgress step="search" searchPhase="searching" />);
    const failed = markup(<HomebrewWorkflowProgress step="search" searchPhase="failed" />);
    const changedQuery = markup(<HomebrewWorkflowProgress step="search" searchPhase="results" queryChanged={true} />);
    expect(searching).toContain("正在搜索已提交的查询词");
    expect(failed).toContain("搜索失败；先查看错误提示");
    expect(changedQuery).toContain("正在准备新的查询；提交后更新搜索结果");
  });
});

describe("Homebrew operation progress UI", () => {
  const phases: Exclude<HomebrewJobPhase, "idle">[] = ["starting", "running", "cancelling", "success", "failed", "cancelled"];
  const expected: Record<Exclude<HomebrewJobPhase, "idle">, string> = {
    starting: "正在启动",
    running: "安装 / 更新进行中",
    cancelling: "正在取消",
    success: "成功",
    failed: "失败",
    cancelled: "已取消",
  };

  it("renders every required operation state with the actual log panel", () => {
    for (const phase of phases) {
      const html = markup(
        <HomebrewOperationPanel
          phase={phase}
          status=""
          actionLabel="安装 Firefox"
          log="Downloading package metadata"
          canCancel={phase === "running" || phase === "cancelling"}
          cancelPending={phase === "cancelling"}
          onCancel={() => undefined}
        />,
      );
      expect(html).toContain('data-testid="brew-operation-panel"');
      expect(html).toContain('data-phase="' + phase + '"');
      expect(html).toContain(expected[phase as Exclude<HomebrewJobPhase, "idle">]);
      expect(html).toContain("安装 Firefox");
      expect(html).toContain('data-testid="brew-operation-log"');
      expect(html).toContain("Downloading package metadata");
      expect(html).not.toContain("%");
    }
  });

  it("exposes cancellation only when an operation has a cancellable task ID", () => {
    const running = markup(
      <HomebrewOperationPanel phase="running" status="" actionLabel="升级 Git" log="" canCancel={true} cancelPending={false} onCancel={() => undefined} />,
    );
    const starting = markup(
      <HomebrewOperationPanel phase="starting" status="" actionLabel="升级 Git" log="" canCancel={false} cancelPending={false} onCancel={() => undefined} />,
    );
    const cancelling = markup(
      <HomebrewOperationPanel phase="cancelling" status="" actionLabel="升级 Git" log="" canCancel={true} cancelPending={true} onCancel={() => undefined} />,
    );
    expect(running).toContain('data-testid="brew-cancel-job"');
    expect(starting).not.toContain('data-testid="brew-cancel-job"');
    expect(cancelling).toContain('disabled=""');
    expect(cancelling).toContain("正在取消");
  });
});

describe("Homebrew action confirmation UI", () => {
  const action: HomebrewActionRequest = {
    operation: "install",
    kind: "cask",
    name: "firefox",
    label: "安装 Firefox",
    reason: "从 Homebrew 下载并安装该软件，会联网并修改本机软件环境。",
  };

  it("shows the pending-confirmation state, target, command preview, and explicit choices", () => {
    const html = markup(
      <HomebrewActionConfirmation
        action={action}
        disabled={false}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-phase="waiting-confirmation"');
    expect(html).toContain("等待确认");
    expect(html).toContain("安装 Firefox");
    expect(html).toContain("brew install --cask firefox");
    expect(html).toContain("确认并执行");
    expect(html).toContain('data-testid="brew-confirm-cancel"');
    expect(html).toContain("不会自动提权");
  });

  it("does not make the confirm action available when the workflow is busy", () => {
    const html = markup(
      <HomebrewActionConfirmation
        action={action}
        disabled={true}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="brew-confirm-run"');
    expect(html).toContain('disabled=""');
  });
});


describe("Homebrew status overview", () => {
  const baseProps = {
    native: true,
    installed: true,
    eventsReady: true,
    kind: "cask" as const,
    packagesCount: 12,
    loadingPackages: false,
    checkingUpdates: false,
    updatesChecked: true,
    outdatedKind: "cask" as const,
    outdatedCount: 3,
  };

  it("shows the native connection, installed count, and update count together", () => {
    const html = markup(<HomebrewStatusOverview {...baseProps} />);
    expect(html).toContain('data-testid="brew-status-overview"');
    expect(html).toContain('data-state="ready"');
    expect(html).toContain("本机已连接");
    expect(html).toContain("12 项");
    expect(html).toContain("3 项待更新");
    expect(html).toContain("Mac 应用（Cask）");
  });

  it("distinguishes browser preview and missing Homebrew from a connected native environment", () => {
    const previewProps = {...baseProps, native: false, installed: false};
    const missingProps = {...baseProps, installed: false, eventsReady: false};
    const connectingProps = {...baseProps, eventsReady: false};
    const preview = markup(<HomebrewStatusOverview {...previewProps} />);
    const missing = markup(<HomebrewStatusOverview {...missingProps} />);
    const connecting = markup(<HomebrewStatusOverview {...connectingProps} />);
    expect(preview).toContain("网页预览模式");
    expect(preview).toContain('class="brew-status-card environment" data-state="preview"');
    expect(missing).toContain("未检测到 Homebrew");
    expect(missing).toContain('class="brew-status-card environment" data-state="missing"');
    expect(connecting).toContain("正在连接任务管理器");
    expect(connecting).toContain('class="brew-status-card environment" data-state="connecting"');
  });

  it("does not show stale update counts for another category or while checking", () => {
    const uncheckedProps = {...baseProps, kind: "formula" as const};
    const checkingProps = {...baseProps, checkingUpdates: true};
    const currentProps = {...baseProps, outdatedCount: 0};
    const unchecked = markup(<HomebrewStatusOverview {...uncheckedProps} />);
    const checking = markup(<HomebrewStatusOverview {...checkingProps} />);
    const current = markup(<HomebrewStatusOverview {...currentProps} />);
    expect(unchecked).toContain("尚未检查");
    expect(unchecked).not.toContain("3 项待更新");
    expect(checking).toContain("正在检查");
    expect(current).toContain("已是最新");
  });

  it("keeps loading and unavailable package counts explicit", () => {
    const loadingProps = {...baseProps, loadingPackages: true};
    const unavailableProps = {...baseProps, native: false, installed: false};
    const loading = markup(<HomebrewStatusOverview {...loadingProps} />);
    const unavailable = markup(<HomebrewStatusOverview {...unavailableProps} />);
    expect(loading).toContain("正在读取…");
    expect(unavailable).toContain("暂不可用");
  });
});


describe("Homebrew package detail panel", () => {
  it("shows a visible loading state instead of a blank panel", () => {
    const html = markup(<HomebrewInfoPanel name="firefox" loading={true} info="" error="" onClose={() => undefined} />);
    expect(html).toContain('data-testid="brew-info-panel"');
    expect(html).toContain('data-state="loading"');
    expect(html).toContain("正在读取 firefox 的 Homebrew 详情");
    expect(html).toContain('role="status"');
  });

  it("shows details, explicit empty content, and recoverable errors", () => {
    const success = markup(<HomebrewInfoPanel name="firefox" loading={false} info="Name: firefox" error="" onClose={() => undefined} />);
    const empty = markup(<HomebrewInfoPanel name="firefox" loading={false} info="" error="" onClose={() => undefined} />);
    const failed = markup(<HomebrewInfoPanel name="firefox" loading={false} info="" error="network unavailable" onClose={() => undefined} />);
    expect(success).toContain('data-state="success"');
    expect(success).toContain("Name: firefox");
    expect(empty).toContain('data-state="empty"');
    expect(empty).toContain("没有返回详情内容");
    expect(failed).toContain('data-state="failed"');
    expect(failed).toContain("network unavailable");
    expect(failed).toContain('data-testid="brew-info-close"');
  });
});
