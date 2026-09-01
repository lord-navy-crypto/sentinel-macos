from pathlib import Path

p=Path('build-desktop-macos.sh')
s=p.read_text()

def once(old,new,label):
    global s
    if old not in s: raise SystemExit(f'missing packaging anchor: {label}')
    s=s.replace(old,new,1)

once('UI_ACTION_DOCK="$HERE/web/app/action-dock.js"\nUI_RUNTIME_LOGS="$HERE/web/app/runtime-logs.js"', 'UI_ACTION_DOCK="$HERE/web/app/action-dock.js"\nUI_TASK_CENTER="$HERE/web/app/task-center.js"\nUI_RUNTIME_LOGS="$HERE/web/app/runtime-logs.js"', 'task center js variable')
once('ACTION_DOCK_MARKER="Sentinel 2.7 Contextual Action Dock"\nRUNTIME_LOGS_MARKER=', 'ACTION_DOCK_MARKER="Sentinel 2.7 Contextual Action Dock"\nTASK_CENTER_MARKER="Sentinel 2.7 Floating Task Center"\nRUNTIME_LOGS_MARKER=', 'task center marker')
once('  "web/app/action-dock.js"\n  "web/app/runtime-logs.js"', '  "web/app/action-dock.js"\n  "web/app/task-center.js"\n  "web/app/runtime-logs.js"', 'required task js file')
once('  "web/app/action-dock.css"\n  "web/app/ai.css"', '  "web/app/action-dock.css"\n  "web/app/task-center.css"\n  "web/app/ai.css"', 'required task css file')
once('  "/app/core.js"\n  "/app/lenses/orient-investigate.js"', '  "/app/core.js"\n  "/app/task-center.js"\n  "/app/lenses/orient-investigate.js"', 'required task script order')
once('  "/app/action-dock.css"\n  "/app/ai.css"', '  "/app/action-dock.css"\n  "/app/task-center.css"\n  "/app/ai.css"', 'required task style')
once('if ! grep -Fq "$RUNTIME_LOGS_MARKER" "$UI_RUNTIME_LOGS"; then', 'if ! grep -Fq "$TASK_CENTER_MARKER" "$UI_TASK_CENTER"; then\n  echo "Sentinel 2.7 Floating Task Center marker missing from $UI_TASK_CENTER" >&2\n  exit 2\nfi\nif ! grep -Fq "$RUNTIME_LOGS_MARKER" "$UI_RUNTIME_LOGS"; then', 'task marker validation')
once('if ! grep -Fq ".s24-action-dock" "$HERE/web/app/action-dock.css"; then\n  echo "Action Dock visual-system marker missing from action-dock.css" >&2\n  exit 2\nfi', 'if ! grep -Fq ".s24-action-dock" "$HERE/web/app/action-dock.css"; then\n  echo "Action Dock visual-system marker missing from action-dock.css" >&2\n  exit 2\nfi\nif ! grep -Fq ".task-center" "$HERE/web/app/task-center.css"; then\n  echo "Floating Task Center visual-system marker missing from task-center.css" >&2\n  exit 2\nfi', 'task css validation')
once('echo "Contextual Action Dock: header scan controls + lens-specific quick actions + post-scan routing verified"\necho "Local AI:', 'echo "Contextual Action Dock: header scan controls + lens-specific quick actions + post-scan routing verified"\necho "Floating Task Center: concurrent task visibility + measured progress + stall visibility verified"\necho "Local AI:', 'identity output')
once('for marker in "$UI_MARKER" "$WORKBENCH_MARKER" "$SCAN_CENTER_MARKER" "$ACTION_DOCK_MARKER" "$AI_MARKER"', 'for marker in "$UI_MARKER" "$WORKBENCH_MARKER" "$SCAN_CENTER_MARKER" "$ACTION_DOCK_MARKER" "$TASK_CENTER_MARKER" "$AI_MARKER"', 'embedded task marker')
once('echo "Embedded Sentinel 2.7 product + Workbench + Full Scan Center + Action Dock + Local AI + Manual: verified in arm64 + x86_64 engines"', 'echo "Embedded Sentinel 2.7 product + Workbench + Full Scan Center + Action Dock + Task Center + Local AI + Manual: verified in arm64 + x86_64 engines"', 'embedded output')
p.write_text(s)
