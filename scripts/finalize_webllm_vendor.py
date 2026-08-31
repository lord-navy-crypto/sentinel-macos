#!/usr/bin/env python3
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"expected patch anchor missing in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# The static embedded filesystem now owns /vendor/webllm-0.2.82.mjs.
replace_once(
    "main.go",
    "\n\tmux.HandleFunc(webLLMRuntimePath, a.handleWebLLMRuntime)\n",
    "\n",
)

# A release build must refuse to package Sentinel if the vendored runtime,
# provenance, or license is missing.
replace_once(
    "build-desktop-macos.sh",
    '  "web/app/action-dock.js"\n  "web/app/runtime.js"',
    '  "web/app/action-dock.js"\n'
    '  "web/vendor/webllm-0.2.82.mjs"\n'
    '  "web/vendor/WEBLLM-LICENSE.txt"\n'
    '  "web/vendor/README.md"\n'
    '  "web/app/runtime.js"',
)
replace_once(
    "build-desktop-macos.sh",
    'done\n\nif [[ -e "$HERE/web/app/scan-center.js"',
    '''done

WEBLLM_RUNTIME="$HERE/web/vendor/webllm-0.2.82.mjs"
WEBLLM_LICENSE="$HERE/web/vendor/WEBLLM-LICENSE.txt"
WEBLLM_PROVENANCE="$HERE/web/vendor/README.md"
if [[ "$(wc -c < "$WEBLLM_RUNTIME")" -le 100000 ]]; then
  echo "Vendored WebLLM runtime is missing or unexpectedly small." >&2
  exit 2
fi
grep -Fq 'Apache License' "$WEBLLM_LICENSE" || { echo "Vendored WebLLM license is missing Apache-2.0 text." >&2; exit 2; }
grep -Fq '@mlc-ai/web-llm' "$WEBLLM_PROVENANCE" || { echo "Vendored WebLLM provenance is missing." >&2; exit 2; }

if [[ -e "$HERE/web/app/scan-center.js"''',
)

p = Path("local_ai_contract_test.go")
s = p.read_text()
s = s.replace('\tbridge := readLocalAIContractFile(t, "webllm_runtime.go")\n', '')

old = '''\tfor _, want := range []string{"webLLMRuntimePath = \\"/vendor/webllm-0.2.82.mjs\\"", "webLLMRuntimeURL  = \\"https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.82/lib/index.js\\"", "handleWebLLMRuntime", "WebLLM 0.2.82 same-origin bridge"} {
\t\tif !strings.Contains(bridge, want) { t.Fatalf("same-origin WebLLM runtime bridge missing %q", want) }
\t}
'''
new = '''\tvendorInfo, err := os.Stat("web/vendor/webllm-0.2.82.mjs")
\tif err != nil { t.Fatalf("vendored WebLLM runtime missing: %v", err) }
\tif vendorInfo.Size() <= 100000 { t.Fatalf("vendored WebLLM runtime unexpectedly small: %d bytes", vendorInfo.Size()) }
\tvendorReadme := readLocalAIContractFile(t, "web/vendor/README.md")
\tvendorLicense := readLocalAIContractFile(t, "web/vendor/WEBLLM-LICENSE.txt")
\tfor _, want := range []string{"@mlc-ai/web-llm", "0.2.82", "loopback origin", "Model weights are not bundled"} {
\t\tif !strings.Contains(vendorReadme, want) { t.Fatalf("vendored WebLLM provenance missing %q", want) }
\t}
\tif !strings.Contains(vendorLicense, "Apache License") { t.Fatal("vendored WebLLM Apache-2.0 license text is missing") }
'''
if old not in s:
    raise SystemExit("first Local AI bridge contract block not found")
s = s.replace(old, new, 1)

s = s.replace('\n\t\t"mux.HandleFunc(webLLMRuntimePath, a.handleWebLLMRuntime)",', '')
old = '''\tif !strings.Contains(bridge, "webLLMRuntimeURL") || !strings.Contains(bridge, "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.82/lib/index.js") {
\t\tt.Fatal("Sentinel server must own the pinned upstream WebLLM fetch behind the same-origin bridge")
\t}
'''
new = '''\tif strings.Contains(server, "webLLMRuntimeURL") || strings.Contains(server, "handleWebLLMRuntime") || strings.Contains(server, "cdn.jsdelivr.net/npm/@mlc-ai/web-llm") {
\t\tt.Fatal("Sentinel must serve the packaged WebLLM runtime directly; runtime CDN proxy code returned")
\t}
\tvendorInfo, err := os.Stat("web/vendor/webllm-0.2.82.mjs")
\tif err != nil || vendorInfo.Size() <= 100000 { t.Fatal("packaged WebLLM runtime is missing or invalid") }
'''
if old not in s:
    raise SystemExit("second Local AI bridge contract block not found")
s = s.replace(old, new, 1)
p.write_text(s)

# The temporary server-side CDN proxy is no longer part of the product.
Path("webllm_runtime.go").unlink(missing_ok=False)

# Strong post-conditions before the workflow is allowed to commit.
ai = Path("web/app/ai.js").read_text()
worker = Path("web/app/ai-worker.js").read_text()
main = Path("main.go").read_text()
build = Path("build-desktop-macos.sh").read_text()
runtime = Path("web/vendor/webllm-0.2.82.mjs")
license_text = Path("web/vendor/WEBLLM-LICENSE.txt").read_text()
provenance = Path("web/vendor/README.md").read_text()

assert runtime.stat().st_size > 100000
assert "Apache License" in license_text
assert "@mlc-ai/web-llm" in provenance
assert "WEBLLM_URL = '/vendor/webllm-0.2.82.mjs'" in ai
assert "import('/vendor/webllm-0.2.82.mjs')" in worker
assert "https://esm.run/@mlc-ai/web-llm" not in ai + worker
assert "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm" not in ai + worker
assert "handleWebLLMRuntime" not in main
assert "web/vendor/webllm-0.2.82.mjs" in build

print(f"Vendored WebLLM runtime ready: {runtime.stat().st_size} bytes")
