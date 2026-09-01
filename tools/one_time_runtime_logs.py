from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"missing expected text in {path}: {old[:140]!r}")
    p.write_text(s.replace(old, new, 1))


replace_once(
    "main.go",
    "\tnetworkHistory *networkHistoryManager\n}",
    "\tnetworkHistory *networkHistoryManager\n\tlogs           *runtimeLogBuffer\n}",
)

replace_once(
    "main.go",
    "\ttoken := randomToken(24)\n\tintel := newIntelligenceManager()\n\ta := &app{",
    "\ttoken := randomToken(24)\n\tlogs := newRuntimeLogBuffer()\n\tlog.SetOutput(runtimeLogOutput(logs, os.Stderr))\n\tintel := newIntelligenceManager()\n\ta := &app{",
)

replace_once(
    "main.go",
    "\t\tnetworkHistory: newNetworkHistoryManager(*ephemeral),\n\t}",
    "\t\tnetworkHistory: newNetworkHistoryManager(*ephemeral), logs: logs,\n\t}",
)

replace_once(
    "main.go",
    "\tmux.HandleFunc(\"/api/doctor\", a.auth(a.handleDoctor))\n",
    "\tmux.HandleFunc(\"/api/doctor\", a.auth(a.handleDoctor))\n\tmux.HandleFunc(\"/api/runtime/logs\", a.auth(a.handleRuntimeLogs))\n",
)

replace_once(
    "main.go",
    "\tserver := &http.Server{\n\t\tHandler:           securityHeaders(a.requestGuard(mux)),",
    "\ta.logs.append(\"info\", \"backend\", \"engine-ready\", \"Sentinel local engine is ready.\", map[string]any{\"version\": sentinelVersion, \"desktop\": *desktopMode, \"ephemeral\": *ephemeral})\n\tserver := &http.Server{\n\t\tHandler:           securityHeaders(a.runtimeLogHTTP(a.requestGuard(mux))),",
)

replace_once(
    "web/index.html",
    "  <script src=\"/app/action-dock.js\"></script>\n  <script src=\"/app/ai.js\"></script>",
    "  <script src=\"/app/action-dock.js\"></script>\n  <script src=\"/app/runtime-logs.js\"></script>\n  <script src=\"/app/ai.js\"></script>",
)

replace_once(
    "web/app/ai.js",
    "  function updateProgress(report){ai.progress=Number(report?.progress||0);ai.progressText=report?.text||'Loading model…';const p=$('#aiLoadProgress'),t=$('#aiProgressText');if(p)p.value=Math.max(0,Math.min(1,ai.progress));if(t)t.textContent=ai.progressText;activity('Local AI',Math.round(ai.progress*100),ai.progressText);}",
    "  function runtimeLogEvent(level,event,message,fields={}){if(typeof S.runtimeLog==='function')void S.runtimeLog(level,'local-ai',event,message,fields);}\n  function updateProgress(report){ai.progress=Number(report?.progress||0);ai.progressText=report?.text||'Loading model…';runtimeLogEvent('info','init-progress',ai.progressText,{progress:ai.progress,model:ai.model,execution_backend:AI.executionBackend||'pending',cache_backend:AI.cacheBackend||'pending'});const p=$('#aiLoadProgress'),t=$('#aiProgressText');if(p)p.value=Math.max(0,Math.min(1,ai.progress));if(t)t.textContent=ai.progressText;activity('Local AI',Math.round(ai.progress*100),ai.progressText);}",
)

old_load = """  async function loadAI(){
    if(!supportsLocalAI())throw new Error('WebGPU is not available in this browser/WebView.');
    if(ai.loading)return;
    ai.loading=true;ai.progress=0;ai.progressText='Loading WebLLM runtime…';renderAI();
    try{
      if(ai.engine){try{await ai.engine.unload();}catch{}ai.engine=null;ai.loadedModel=null;}
      if(ai.worker){ai.worker.terminate();ai.worker=null;}
      ai.module=ai.module||await import(WEBLLM_URL);
      const appConfig={...ai.module.prebuiltAppConfig,useIndexedDBCache:false};AI.cacheBackend='cache';
      if(!appConfig.model_list?.some(record=>record.model_id===ai.model))throw new Error('Selected model is not present in WebLLM 0.2.82 prebuiltAppConfig.');
      const nativeAppView=Boolean(window.__sentinelNativeAppView);AI.executionBackend=nativeAppView?'main-thread':'web-worker';
      if(nativeAppView){
        ai.worker=null;
        ai.engine=await ai.module.CreateMLCEngine(ai.model,{appConfig,initProgressCallback:updateProgress,logLevel:'WARN'});
      }else{
        ai.worker=new Worker('/app/ai-worker.js',{type:'module'});
        ai.engine=await ai.module.CreateWebWorkerMLCEngine(ai.worker,ai.model,{appConfig,initProgressCallback:updateProgress,logLevel:'WARN'});
      }
      ai.loadedModel=ai.model;ai.progress=1;ai.progressText='Model ready in local WebGPU memory.';notice('Local AI model ready: '+currentModel().name+'.');
    }finally{ai.loading=false;renderAI();}
    if(ai.pendingPrompt&&ai.pendingAutoRun)setTimeout(()=>runPendingPrompt(),0);
  }
  async function unloadAI(){if(ai.engine)await ai.engine.unload().catch(()=>{});if(ai.worker)ai.worker.terminate();ai.engine=null;ai.worker=null;ai.loadedModel=null;ai.generating=false;ai.progress=0;ai.progressText='Model unloaded from memory. Cached model files remain local.';renderAI();}
"""
new_load = """  async function loadAI(){
    if(!supportsLocalAI())throw new Error('WebGPU is not available in this browser/WebView.');
    if(ai.loading)return;
    ai.loading=true;ai.progress=0;ai.progressText='Loading WebLLM runtime…';runtimeLogEvent('info','load-start','Local AI model load started.',{model:ai.model,native_app_view:Boolean(window.__sentinelNativeAppView)});renderAI();
    try{
      if(ai.engine){try{await ai.engine.unload();}catch{}ai.engine=null;ai.loadedModel=null;}
      if(ai.worker){ai.worker.terminate();ai.worker=null;}
      ai.module=ai.module||await import(WEBLLM_URL);runtimeLogEvent('info','runtime-imported','WebLLM runtime module imported.',{runtime:WEBLLM_URL});
      const appConfig={...ai.module.prebuiltAppConfig,useIndexedDBCache:false};AI.cacheBackend='cache';
      if(!appConfig.model_list?.some(record=>record.model_id===ai.model))throw new Error('Selected model is not present in WebLLM 0.2.82 prebuiltAppConfig.');
      const nativeAppView=Boolean(window.__sentinelNativeAppView);AI.executionBackend=nativeAppView?'main-thread':'web-worker';runtimeLogEvent('info','engine-selected','Local AI execution backend selected.',{model:ai.model,execution_backend:AI.executionBackend,cache_backend:AI.cacheBackend});
      if(nativeAppView){
        ai.worker=null;
        ai.engine=await ai.module.CreateMLCEngine(ai.model,{appConfig,initProgressCallback:updateProgress,logLevel:'WARN'});
      }else{
        ai.worker=new Worker('/app/ai-worker.js',{type:'module'});
        ai.engine=await ai.module.CreateWebWorkerMLCEngine(ai.worker,ai.model,{appConfig,initProgressCallback:updateProgress,logLevel:'WARN'});
      }
      ai.loadedModel=ai.model;ai.progress=1;ai.progressText='Model ready in local WebGPU memory.';runtimeLogEvent('info','model-ready','Local AI model is ready in WebGPU memory.',{model:ai.model,execution_backend:AI.executionBackend});notice('Local AI model ready: '+currentModel().name+'.');
    }catch(error){runtimeLogEvent('error','load-error',error?.message||String(error),{model:ai.model,progress:ai.progress,progress_text:ai.progressText,execution_backend:AI.executionBackend||'pending',cache_backend:AI.cacheBackend||'pending'});throw error;
    }finally{ai.loading=false;renderAI();}
    if(ai.pendingPrompt&&ai.pendingAutoRun)setTimeout(()=>runPendingPrompt(),0);
  }
  async function unloadAI(){runtimeLogEvent('info','unload','Local AI model unloaded from memory.',{model:ai.loadedModel||ai.model});if(ai.engine)await ai.engine.unload().catch(()=>{});if(ai.worker)ai.worker.terminate();ai.engine=null;ai.worker=null;ai.loadedModel=null;ai.generating=false;ai.progress=0;ai.progressText='Model unloaded from memory. Cached model files remain local.';renderAI();}
"""
replace_once("web/app/ai.js", old_load, new_load)

replace_once(
    "web/app/ai.js",
    "    }catch(error){ai.conversation[ai.conversation.length-1].content='Local AI error: '+(error?.message||String(error));notice(error?.message||String(error));activity('Error',0,error?.message||String(error));}",
    "    }catch(error){runtimeLogEvent('error','generation-error',error?.message||String(error),{model:ai.loadedModel||ai.model});ai.conversation[ai.conversation.length-1].content='Local AI error: '+(error?.message||String(error));notice(error?.message||String(error));activity('Error',0,error?.message||String(error));}",
)

# Existing frontend contract counts explicit product scripts.
for path in ["desktop_conversion_test.go", ".github/workflows/ci.yml"]:
    p=Path(path); s=p.read_text(); s=s.replace('"$(grep -c \'<script src=\' web/index.html)" -eq 16', '"$(grep -c \'<script src=\' web/index.html)" -eq 17')
    s=s.replace('Canonical modules: 16 scripts + 7 styles', 'Canonical modules: 17 scripts + 7 styles')
    p.write_text(s)

# Make the new product module part of syntax/distribution contracts when anchors exist.
p=Path('.github/workflows/ci.yml'); s=p.read_text()
s=s.replace('          node --check web/app/action-dock.js\n          node --check web/app/ai.js', '          node --check web/app/action-dock.js\n          node --check web/app/runtime-logs.js\n          node --check web/app/ai.js')
s=s.replace("          grep -Fq '/app/action-dock.js' web/index.html\n          grep -Fq '/app/ai.css' web/index.html", "          grep -Fq '/app/action-dock.js' web/index.html\n          grep -Fq '/app/runtime-logs.js' web/index.html\n          grep -Fq '/app/ai.css' web/index.html")
p.write_text(s)

p=Path('desktop_conversion_test.go'); s=p.read_text()
s=s.replace('"/app/action-dock.js"', '"/app/action-dock.js", "/app/runtime-logs.js"', 1)
p.write_text(s)
