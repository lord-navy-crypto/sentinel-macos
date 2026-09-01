from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"missing expected text in {path}: {old[:120]}")
    p.write_text(s.replace(old, new, 1))


replace_once(
    "web/app/ai.js",
    """      const appConfig={...ai.module.prebuiltAppConfig,cacheBackend:'cache'};AI.cacheBackend='cache';
      if(!appConfig.model_list?.some(record=>record.model_id===ai.model))throw new Error('Selected model is not present in WebLLM 0.2.82 prebuiltAppConfig.');
      ai.worker=new Worker('/app/ai-worker.js',{type:'module'});
      ai.engine=await ai.module.CreateWebWorkerMLCEngine(ai.worker,ai.model,{appConfig,initProgressCallback:updateProgress,logLevel:'WARN'});""",
    """      const appConfig={...ai.module.prebuiltAppConfig,useIndexedDBCache:false};AI.cacheBackend='cache';
      if(!appConfig.model_list?.some(record=>record.model_id===ai.model))throw new Error('Selected model is not present in WebLLM 0.2.82 prebuiltAppConfig.');
      const nativeAppView=Boolean(window.__sentinelNativeAppView);AI.executionBackend=nativeAppView?'main-thread':'web-worker';
      if(nativeAppView){
        ai.worker=null;
        ai.engine=await ai.module.CreateMLCEngine(ai.model,{appConfig,initProgressCallback:updateProgress,logLevel:'WARN'});
      }else{
        ai.worker=new Worker('/app/ai-worker.js',{type:'module'});
        ai.engine=await ai.module.CreateWebWorkerMLCEngine(ai.worker,ai.model,{appConfig,initProgressCallback:updateProgress,logLevel:'WARN'});
      }""",
)

replace_once(
    "desktop/SentinelDesktop.swift",
    """        let config = WKWebViewConfiguration()
        // Local AI uses WebLLM IndexedDB for multi-gigabyte model artifacts.
        // Persist the localhost WebKit store so an explicitly downloaded model
        // survives App View relaunch instead of being downloaded every time.
        config.websiteDataStore = .default()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
""",
    """        let config = WKWebViewConfiguration()
        // Persist Local AI artifacts and mark this container explicitly so the
        // frontend can avoid WebWorker execution inside WKWebView when needed.
        config.websiteDataStore = .default()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        let nativeMarker = WKUserScript(
            source: \"window.__sentinelNativeAppView = true;\",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(nativeMarker)
""",
)

replace_once(
    "web/app/ai-reliability.js",
    """      webgpu:Boolean(navigator.gpu),worker:Boolean(window.Worker),indexeddb:Boolean(window.indexedDB),
      secureContext:Boolean(window.isSecureContext||location.hostname==='127.0.0.1'||location.hostname==='localhost')""",
    """      webgpu:Boolean(navigator.gpu),worker:Boolean(window.Worker),indexeddb:Boolean(window.indexedDB),cacheAPI:Boolean(window.caches),
      secureContext:Boolean(window.isSecureContext||location.hostname==='127.0.0.1'||location.hostname==='localhost')""",
)

replace_once(
    "web/app/ai-reliability.js",
    """    ['WebGPU',c.webgpu?'Available':'Unavailable'],['Worker',c.worker?'Available':'Unavailable'],
    ['IndexedDB',c.indexeddb?'Available':'Unavailable'],['Loopback / secure context',c.secureContext?'OK':'Review'],
    ['Selected model',modelName()],['Loaded model',ai.loadedModel||'Not loaded'],
    ['Worker state',ai.worker?'Created':'Not created'],['Engine state',ai.engine?'Created':'Not created'],['Cache backend',AI.cacheBackend||'cache'],""",
    """    ['WebGPU',c.webgpu?'Available':'Unavailable'],['Worker',c.worker?'Available':'Unavailable'],
    ['Cache API',c.cacheAPI?'Available':'Unavailable'],['IndexedDB',c.indexeddb?'Available':'Unavailable'],['Loopback / secure context',c.secureContext?'OK':'Review'],
    ['Selected model',modelName()],['Loaded model',ai.loadedModel||'Not loaded'],
    ['Execution backend',AI.executionBackend||(window.__sentinelNativeAppView?'main-thread':'web-worker')],['Worker state',ai.worker?'Created':'Not created'],['Engine state',ai.engine?'Created':'Not created'],['Cache backend',AI.cacheBackend||'cache'],""",
)

replace_once(
    "web/app/ai-reliability.js",
    """    if(!c.worker||!c.indexeddb||!c.webgpu){await resetFailedLoad(`Prerequisite unavailable: ${!c.webgpu?'WebGPU ':''}${!c.worker?'Worker ':''}${!c.indexeddb?'IndexedDB ':''}`.trim());return;}""",
    """    const needsWorker=!window.__sentinelNativeAppView;
    if((needsWorker&&!c.worker)||!c.cacheAPI||!c.webgpu){await resetFailedLoad(`Prerequisite unavailable: ${!c.webgpu?'WebGPU ':''}${needsWorker&&!c.worker?'Worker ':''}${!c.cacheAPI?'Cache API ':''}`.trim());return;}""",
)

for path in ["desktop_conversion_test.go", "local_ai_contract_test.go"]:
    p = Path(path)
    p.write_text(p.read_text().replace("cacheBackend:'cache'", "useIndexedDBCache:false"))

p = Path("local_ai_contract_test.go")
s = p.read_text()
old = 'if strings.Contains(ai, "useIndexedDBCache:true") {\n\t\tt.Fatal("Local AI must use the explicit Cache API backend instead of the retired IndexedDB flag")\n\t}'
new = 'if strings.Contains(ai, "cacheBackend:\'cache\'") {\n\t\tt.Fatal("WebLLM 0.2.82 must not use the newer cacheBackend API")\n\t}\n\tfor _, want := range []string{"CreateMLCEngine", "__sentinelNativeAppView", "executionBackend"} {\n\t\tif !strings.Contains(ai, want) {\n\t\t\tt.Fatalf("Native direct Local AI fallback missing %q", want)\n\t\t}\n\t}'
if old not in s:
    raise SystemExit("local AI old cache guard not found")
p.write_text(s.replace(old, new, 1))

p = Path("desktop_conversion_test.go")
s = p.read_text()
s = s.replace('"config.websiteDataStore = .default()"}', '"config.websiteDataStore = .default()", "__sentinelNativeAppView", "WKUserScript"}')
p.write_text(s)

for path in ["build-desktop-macos.sh", ".github/workflows/ci.yml"]:
    p = Path(path)
    p.write_text(p.read_text().replace("cacheBackend:'cache'", "useIndexedDBCache:false"))

p = Path(".github/workflows/ci.yml")
s = p.read_text()
anchor = "            LC_ALL=C grep -aFq 'Sentinel 2.7 Local AI Reliability' \"$engine\"\n"
if anchor not in s:
    raise SystemExit("CI engine marker anchor missing")
s = s.replace(
    anchor,
    anchor
    + "            LC_ALL=C grep -aFq '__sentinelNativeAppView' \"$engine\"\n"
    + "            LC_ALL=C grep -aFq 'CreateMLCEngine' \"$engine\"\n",
    1,
)
p.write_text(s)
