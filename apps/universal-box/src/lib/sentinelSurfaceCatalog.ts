/**
 * Evidence-backed expansion of original Sentinel GET-only API routes.
 * Every item has a fixed Rust allowlist key and maps to a real original Go endpoint.
 * This is NOT an API client for arbitrary paths, and no query starts automatically.
 */
export type SentinelLensId="overview"|"investigate"|"compare"|"system"|"actions"|"limits";
export type SentinelSurfaceItem={id:string;name:string;description:string;lens:SentinelLensId};
export const SENTINEL_EXTRA_READS:readonly SentinelSurfaceItem[]=[
  {
    "id": "mac-health",
    "name": "系统运行健康",
    "description": "实时健康指标",
    "lens": "overview"
  },
  {
    "id": "resource-current",
    "name": "CPU / 内存 / 资源现状",
    "description": "实时资源指标",
    "lens": "overview"
  },
  {
    "id": "resource-history",
    "name": "资源历史记录",
    "description": "已保留的资源采样",
    "lens": "overview"
  },
  {
    "id": "resource-rates",
    "name": "磁盘与网络吞吐率",
    "description": "采样计数器计算出的速率",
    "lens": "overview"
  },
  {
    "id": "what-changed",
    "name": "系统变化摘要",
    "description": "历史对照摘要",
    "lens": "overview"
  },
  {
    "id": "coverage",
    "name": "权限与证据覆盖图",
    "description": "不同数据源的可见范围",
    "lens": "overview"
  },
  {
    "id": "system-console",
    "name": "系统控制台目录",
    "description": "原系统可用查询分类（目录只读）",
    "lens": "overview"
  },
  {
    "id": "graph-v2",
    "name": "高级证据关联图 v2",
    "description": "原 Go Evidence Graph v2",
    "lens": "investigate"
  },
  {
    "id": "timeline-global",
    "name": "全局事件时间线",
    "description": "合并多个证据源的时间事件",
    "lens": "investigate"
  },
  {
    "id": "timeline-grouped",
    "name": "分组事件时间线",
    "description": "按事件类型组织的已保留记录",
    "lens": "investigate"
  },
  {
    "id": "incidents",
    "name": "异常事件与 Case Stories",
    "description": "原系统事件及调查案例概览",
    "lens": "investigate"
  },
  {
    "id": "behavior-history",
    "name": "行为变化历史",
    "description": "已保存的系统行为观测",
    "lens": "compare"
  },
  {
    "id": "behavior-health",
    "name": "行为数据质量",
    "description": "采样与持久化状态",
    "lens": "compare"
  },
  {
    "id": "trust-history",
    "name": "信任基线版本历史",
    "description": "原系统保留的参考记录",
    "lens": "compare"
  },
  {
    "id": "trust-health",
    "name": "信任基线健康",
    "description": "保存、备份与完整性状态",
    "lens": "compare"
  },
  {
    "id": "change-status",
    "name": "变化监控运行状态",
    "description": "只读监视器状态，不启动监控",
    "lens": "compare"
  },
  {
    "id": "change-events",
    "name": "最近的变化事件",
    "description": "原 Go 监测事件缓存",
    "lens": "compare"
  },
  {
    "id": "change-history",
    "name": "变化历史",
    "description": "有界历史事件记录",
    "lens": "compare"
  },
  {
    "id": "launch-services",
    "name": "Launch Services 详细资料",
    "description": "系统启动服务目录",
    "lens": "system"
  },
  {
    "id": "storage-graph",
    "name": "存储空间结构图",
    "description": "按需检查当前用户目录（可能较慢）",
    "lens": "system"
  },
  {
    "id": "storage-jobs",
    "name": "存储扫描任务状态",
    "description": "只读任务进度与取消状态",
    "lens": "system"
  },
  {
    "id": "persistence",
    "name": "登录持久化痕迹",
    "description": "原系统持久化状态",
    "lens": "system"
  },
  {
    "id": "action-status",
    "name": "安全操作就绪状态",
    "description": "原引擎操作控制状态",
    "lens": "actions"
  },
  {
    "id": "action-health",
    "name": "安全执行引擎健康",
    "description": "原 Sentinel 操作审计健康",
    "lens": "actions"
  },
  {
    "id": "action-journal",
    "name": "安全操作审计日志",
    "description": "已记录的操作与审批记录",
    "lens": "actions"
  },
  {
    "id": "action-vault",
    "name": "隔离保管库清单",
    "description": "只读隔离项、恢复仍在原 WebView",
    "lens": "actions"
  },
  {
    "id": "self-health",
    "name": "Sentinel 自身健康",
    "description": "组件与服务状态",
    "lens": "limits"
  },
  {
    "id": "update-status",
    "name": "更新检查状态",
    "description": "本机已知版本和更新状态",
    "lens": "limits"
  },
  {
    "id": "advanced-sensor",
    "name": "高级传感器状态",
    "description": "EndpointSecurity 权限与就绪情况",
    "lens": "limits"
  },
  {
    "id": "openguin-status",
    "name": "本地智能服务状态",
    "description": "原系统智能分析连接状态",
    "lens": "limits"
  },
  {
    "id": "pre-regression",
    "name": "运行回归预检查",
    "description": "原 Sentinel 回归门禁状态",
    "lens": "limits"
  }
] as const;

export const SENTINEL_LEGACY_ONLY=[
 {title:"高级检查与调查",tasks:"深度文件搜索、对象完整性调查、进程关联、手动系统查询、深度事件导出"},
 {title:"安全操作与隔离恢复",tasks:"预览确认、安全执行、隔离/恢复、信任参考点创建/回滚"},
 {title:"持续监测和捕获",tasks:"启停变化监控、选定目录采样、手动资源采集、事件存档"},
 {title:"专题维护与数据整理",tasks:"大文件/重复文件调查、应用体积、下载目录审阅、存储分析与导出"}
] as const;
/** These functions are intentionally kept in the original guarded WebView for now.
 * Never represent these as independent React execution commands. */

/** Existing bridge keys that previously lacked a dedicated All Tools search card. */
export const SENTINEL_BASE_EXTRA_CARDS:readonly SentinelSurfaceItem[]=[
  {
    "id": "profile",
    "name": "设备系统信息",
    "description": "macOS 配置与运行环境",
    "lens": "overview"
  },
  {
    "id": "quick-check",
    "name": "Easy Scan 快速检查",
    "description": "显式触发原系统快速证据采集",
    "lens": "overview"
  },
  {
    "id": "capabilities",
    "name": "传感器与探测能力",
    "description": "哪些原系统证据功能可以使用",
    "lens": "limits"
  },
  {
    "id": "startup",
    "name": "系统启动项目",
    "description": "登录项及启动服务概览",
    "lens": "system"
  },
  {
    "id": "background",
    "name": "后台任务服务",
    "description": "后台登记信息",
    "lens": "system"
  },
  {
    "id": "network-history",
    "name": "网络历史轨迹",
    "description": "已保留的历史网络数据",
    "lens": "system"
  },
  {
    "id": "trust",
    "name": "当前参考基线状态",
    "description": "读取已存在的信任参考点",
    "lens": "compare"
  },
  {
    "id": "runtime-logs",
    "name": "原引擎运行日志",
    "description": "运行错误和状态消息",
    "lens": "limits"
  }
];
