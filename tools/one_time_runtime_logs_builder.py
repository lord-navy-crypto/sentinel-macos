from pathlib import Path

p = Path("build-desktop-macos.sh")
s = p.read_text()
replacements = [
    (
        'UI_ACTION_DOCK="$HERE/web/app/action-dock.js"\nUI_AI="$HERE/web/app/ai.js"',
        'UI_ACTION_DOCK="$HERE/web/app/action-dock.js"\nUI_RUNTIME_LOGS="$HERE/web/app/runtime-logs.js"\nUI_AI="$HERE/web/app/ai.js"',
    ),
    (
        'ACTION_DOCK_MARKER="Sentinel 2.7 Contextual Action Dock"\nAI_MARKER=',
        'ACTION_DOCK_MARKER="Sentinel 2.7 Contextual Action Dock"\nRUNTIME_LOGS_MARKER="Sentinel 2.7 Runtime Logs"\nAI_MARKER=',
    ),
    (
        '  "web/app/action-dock.js"\n  "web/app/ai.js"',
        '  "web/app/action-dock.js"\n  "web/app/runtime-logs.js"\n  "web/app/ai.js"',
    ),
    (
        '  "/app/action-dock.js"\n  "/app/ai.js"',
        '  "/app/action-dock.js"\n  "/app/runtime-logs.js"\n  "/app/ai.js"',
    ),
    (
        'if ! grep -Fq "$ACTION_DOCK_MARKER" "$UI_ACTION_DOCK"; then\n  echo "Sentinel 2.7 Action Dock marker missing from $UI_ACTION_DOCK" >&2\n  exit 2\nfi\nif ! grep -Fq "$AI_MARKER" "$UI_AI"; then',
        'if ! grep -Fq "$ACTION_DOCK_MARKER" "$UI_ACTION_DOCK"; then\n  echo "Sentinel 2.7 Action Dock marker missing from $UI_ACTION_DOCK" >&2\n  exit 2\nfi\nif ! grep -Fq "$RUNTIME_LOGS_MARKER" "$UI_RUNTIME_LOGS"; then\n  echo "Sentinel 2.7 Runtime Logs marker missing from $UI_RUNTIME_LOGS" >&2\n  exit 2\nfi\nif ! grep -Fq "$AI_MARKER" "$UI_AI"; then',
    ),
]
for old, new in replacements:
    if old not in s:
        raise SystemExit(f"missing desktop builder anchor: {old[:100]!r}")
    s = s.replace(old, new, 1)
p.write_text(s)
