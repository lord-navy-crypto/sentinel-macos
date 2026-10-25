export type HomebrewSearchPhase = "idle" | "searching" | "results" | "empty" | "failed";
export type HomebrewJobPhase = "idle" | "starting" | "running" | "cancelling" | "success" | "failed" | "cancelled";
export type HomebrewActionRequest = {
  operation: "install" | "uninstall" | "upgrade" | "update" | "upgrade_all";
  kind?: "formula" | "cask";
  name?: string;
  label: string;
  reason: string;
};

type ActiveJobPhase = Exclude<HomebrewJobPhase, "idle">;

export function HomebrewSearchFeedback({
  phase,
  query,
  kind,
  resultCount,
}: {
  phase: HomebrewSearchPhase;
  query: string;
  kind: "formula" | "cask";
  resultCount: number;
}) {
  if (phase === "idle") return null;
  const term = query.trim();
  const category = kind === "cask" ? "Mac 应用（Cask）" : "命令行工具（Formula）";
  let title = "";
  let detail = "";
  if (phase === "searching") {
    title = "正在搜索 Homebrew";
    detail = "正在查询" + category + "中的“" + term + "”。旧结果已清除，避免误把上次结果当作本次结果。";
  } else if (phase === "results") {
    title = "搜索完成";
    detail = category + "中的“" + term + "”共找到 " + resultCount + " 项匹配软件。";
  } else if (phase === "empty") {
    title = "没有找到匹配项";
    detail = category + "中没有找到“" + term + "”。可以检查拼写、切换类别，或先更新 Homebrew 软件索引。";
  } else {
    title = "搜索未完成";
    detail = "搜索未能完成，请查看页面下方的错误信息后重试。";
  }
  return (
    <div
      className={"brew-search-feedback is-" + phase}
      data-testid="brew-search-feedback"
      data-phase={phase}
      role="status"
      aria-live="polite"
    >
      <span className="brew-state-dot" aria-hidden="true" />
      <div className="brew-search-feedback-copy">
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

const JOB_PRESENTATION: Record<ActiveJobPhase, { label: string; detail: string; logPlaceholder: string }> = {
  starting: {
    label: "正在启动",
    detail: "已提交本机操作，正在等待任务进程与任务编号返回。",
    logPlaceholder: "正在等待本机任务进程启动…",
  },
  running: {
    label: "安装 / 更新进行中",
    detail: "Homebrew 正在执行本次操作；下方显示收到的实时输出。",
    logPlaceholder: "正在等待 Homebrew 输出…",
  },
  cancelling: {
    label: "正在取消",
    detail: "取消请求已发送，正在等待实际进程退出后返回最终状态。",
    logPlaceholder: "正在等待进程退出事件…",
  },
  success: {
    label: "成功",
    detail: "任务已正常结束。请核对日志，并查看最近任务中的退出码。",
    logPlaceholder: "任务已结束，但没有收到可显示的输出文本。",
  },
  failed: {
    label: "失败",
    detail: "任务未正常完成。先查看标准错误输出，再结合最近任务中的退出码排查。",
    logPlaceholder: "任务已结束，但没有收到可显示的输出文本；请查看错误提示与最近任务退出码。",
  },
  cancelled: {
    label: "已取消",
    detail: "本次任务已结束，并根据取消请求记录为已取消。",
    logPlaceholder: "任务已取消，但没有收到可显示的输出文本。",
  },
};

export function HomebrewOperationPanel({
  phase,
  status,
  actionLabel,
  log,
  canCancel,
  cancelPending,
  onCancel,
}: {
  phase: ActiveJobPhase;
  status: string;
  actionLabel: string;
  log: string;
  canCancel: boolean;
  cancelPending: boolean;
  onCancel: () => void;
}) {
  const state = JOB_PRESENTATION[phase];
  const active = phase === "starting" || phase === "running" || phase === "cancelling";
  return (
    <div className={"brew-operation-panel is-" + phase} data-testid="brew-operation-panel" data-phase={phase}>
      <div className="brew-operation-header">
        <div className="brew-operation-title-line">
          <strong>操作进度与日志</strong>
          <span className={"brew-operation-status " + phase} data-phase={phase} role="status" aria-live="polite">
            {status || state.label}
          </span>
        </div>
        <p className="brew-operation-action">{actionLabel || "Homebrew 操作"}</p>
        <p className="brew-operation-guidance">{state.detail}</p>
      </div>
      {active && (
        <div className="brew-operation-progress" role="img" aria-label="任务仍在处理；没有可依赖的百分比进度">
          <span />
        </div>
      )}
      <pre aria-label="Homebrew 操作日志" data-testid="brew-operation-log">{log || state.logPlaceholder}</pre>
      {phase === "starting" && (
        <p className="brew-operation-note" role="status">正在建立本机任务会话；收到任务编号后才能发送取消请求。</p>
      )}
      {phase === "running" && (
        <p className="brew-operation-note">Homebrew 未提供可依赖的通用百分比；请以状态和实时日志判断进度。</p>
      )}
      {phase === "cancelling" && (
        <p className="brew-operation-note" role="status">取消请求已发送；任务会在实际进程退出后更新为最终状态。</p>
      )}
      {canCancel && (
        <button
          type="button"
          className="secondary-button"
          data-testid="brew-cancel-job"
          disabled={cancelPending || phase === "cancelling"}
          onClick={onCancel}
        >
          {cancelPending || phase === "cancelling" ? "正在取消…" : "取消操作"}
        </button>
      )}
    </div>
  );
}

function previewCommand(action: HomebrewActionRequest): string {
  if (action.operation === "update") return "brew update";
  if (action.operation === "upgrade_all") return "brew upgrade --" + (action.kind || "cask");
  return "brew " + action.operation + " --" + (action.kind || "cask") + " " + (action.name || "");
}

export function HomebrewActionConfirmation({
  action,
  disabled,
  onConfirm,
  onCancel,
}: {
  action: HomebrewActionRequest;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="terminal-confirm brew-confirmation"
      role="dialog"
      aria-modal="true"
      aria-label="确认 Homebrew 操作"
      data-testid="brew-action-confirmation"
      data-phase="waiting-confirmation"
    >
      <div className="brew-confirmation-heading">
        <span className="brew-confirmation-status" data-phase="waiting-confirmation" role="status">等待确认</span>
        <h3>确认操作：{action.label}</h3>
      </div>
      <p>{action.reason}</p>
      <div className="brew-confirmation-command">
        <strong>命令预览</strong>
        <code>{previewCommand(action)}</code>
      </div>
      <div className="brew-confirmation-safety">
        <strong>执行前检查</strong>
        <p>软件变更会影响本机环境。请核对目标、类别和命令；只有点击“确认并执行”后才会启动任务。</p>
        <p>软件名称会作为独立参数传递，不会拼接成可执行的 Shell 脚本；Sentinel 不会自动提权或收集管理员密码。</p>
      </div>
      <div className="actions">
        <button
          type="button"
          className="primary-button"
          data-testid="brew-confirm-run"
          disabled={disabled}
          onClick={onConfirm}
        >
          确认并执行
        </button>
        <button type="button" className="secondary-button" data-testid="brew-confirm-cancel" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}


export type HomebrewWorkflowStep = "search" | "confirm" | "execute" | "result";

const WORKFLOW_STEPS: {id: HomebrewWorkflowStep; title: string}[] = [
  {id: "search", title: "查找软件"},
  {id: "confirm", title: "确认操作"},
  {id: "execute", title: "执行与日志"},
  {id: "result", title: "结果与记录"},
];

export function HomebrewWorkflowProgress({step, searchPhase, queryChanged = false}: {
  step: HomebrewWorkflowStep;
  searchPhase: HomebrewSearchPhase;
  queryChanged?: boolean;
}) {
  const currentIndex = WORKFLOW_STEPS.findIndex(item => item.id === step);
  const searchDetail = queryChanged
    ? "正在准备新的查询；提交后更新搜索结果"
    : searchPhase === "searching"
    ? "正在搜索已提交的查询词"
    : searchPhase === "results"
      ? "已显示匹配项；可查看详情或选择操作"
      : searchPhase === "empty"
        ? "没有匹配项；检查类别或软件索引"
        : searchPhase === "failed"
          ? "搜索失败；先查看错误提示"
          : "搜索 Mac 应用或命令行工具";
  const detailByStep: Record<HomebrewWorkflowStep, string> = {
    search: searchDetail,
    confirm: "核对软件目标、类别、影响和命令，再决定执行或取消",
    execute: "查看实时日志；任务可取消时保留取消入口",
    result: "核对最终状态、退出码和最近任务记录",
  };
  return (
    <ol className="brew-workflow-progress" aria-label="Homebrew 操作流程"
      data-testid="brew-workflow-progress" data-current-step={step}>
      {WORKFLOW_STEPS.map((item, index) => {
        const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
        return (
          <li key={item.id} className={"brew-workflow-step is-" + state}
            data-testid={"brew-workflow-step-" + item.id} data-state={state}
            aria-current={state === "current" ? "step" : undefined}>
            <span className="brew-workflow-step-number" aria-hidden="true">
              {state === "complete" ? "✓" : index + 1}
            </span>
            <div className="brew-workflow-step-copy">
              <strong>{item.title}</strong>
              <small>{detailByStep[item.id]}</small>
            </div>
            <span className="brew-workflow-step-state">
              {state === "complete" ? "已完成" : state === "current" ? "当前步骤" : "待处理"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
