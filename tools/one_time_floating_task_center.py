from pathlib import Path

TASK_JS = r'''// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)throw new Error('Sentinel application core did not load before Task Center.');

  const MARKER='Sentinel 2.7 Floating Task Center';
  const tasks=new Map();
  let serial=0,expanded=false,pinned=false,ticker=null;
  const originalApi=S.api;
  const originalDownload=S.download;

  const QUIET_PATHS=['/api/runtime/logs','/api/storage/jobs?id=','/api/changes/status','/api/changes/events'];
  const LABELS=[
    ['/api/search/deep','Deep Search'],['/api/system/query/structured','System Analysis'],['/api/system/query','System Query'],
    ['/api/quick-check','Easy Scan'],['/api/security/audit','Security Audit'],['/api/security/investigate','Investigation'],
    ['/api/incidents','Case Correlation'],['/api/intelligence/graph','Evidence Graph'],['/api/intelligence/timeline','Timeline Analysis'],
    ['/api/object/story','Object Story'],['/api/behavior','Behavior Capture'],['/api/trust/compare','Reference Compare'],
    ['/api/trust/capture','Reference Capture'],['/api/changes/review','Change Review'],['/api/diagnostics/export','Diagnostics Export'],
    ['/api/actions/preview','Safe Change Preview'],['/api/actions/execute','Safe Change Execute'],['/api/storage/scan','Storage Scan']
  ];

  function id(){return `task-${Date.now().toString(36)}-${(++serial).toString(36)}`;}
  function now(){return Date.now();}
  function esc(v){return S.esc?S.esc(v):String(v??'');}
  function clamp(v){return Math.max(0,Math.min(100,Number(v||0)));}
  function elapsed(ms){const sec=Math.max(0,Math.floor(ms/1000));if(sec<60)return `${sec}s`;const min=Math.floor(sec/60),rest=sec%60;return `${min}m ${String(rest).padStart(2,'0')}s`;}
  function quiet(url,options){if(options?.task===false)return true;return QUIET_PATHS.some(x=>String(url).includes(x));}
  function requestLabel(url,method){const hit=LABELS.find(([path])=>String(url).includes(path));if(hit)return hit[1];const clean=String(url).split('?')[0].replace(/^\/api\//,'').replaceAll('/',' · ').replaceAll('-',' ');return `${String(method||'GET').toUpperCase()} ${clean||'request'}`;}
  function requestSource(url){const clean=String(url).split('?')[0].replace(/^\/api\//,'').split('/')[0];return clean||'Local engine';}
  function log(level,event,message,fields={}){if(typeof S.runtimeLog==='function')void S.runtimeLog(level,'task',event,message,fields);}

  function ensureUI(){
    if(document.getElementById('sentinelTaskCenter'))return;
    const wrap=document.createElement('section');wrap.id='sentinelTaskCenter';wrap.className='task-center';wrap.setAttribute('aria-label','Sentinel running tasks');
    wrap.innerHTML=`<button type="button" class="task-center-toggle" data-task-center="toggle" aria-expanded="false"><span class="task-center-pulse"></span><b>Tasks</b><span id="taskCenterBadge">0</span></button><div id="taskCenterPanel" class="task-center-panel" hidden><header><div><span>LOCAL TASKS</span><strong id="taskCenterTitle">No active work</strong></div><div class="task-center-head-actions"><button type="button" data-task-center="pin" title="Keep panel open">◇</button><button type="button" data-task-center="clear" title="Clear completed tasks">Clear</button><button type="button" data-task-center="collapse" aria-label="Collapse Task Center">×</button></div></header><div id="taskCenterPressure" class="task-center-pressure" hidden></div><div id="taskCenterList" class="task-center-list"></div><footer><span id="taskCenterFooter">Tasks remain local to this Sentinel session.</span></footer></div>`;
    document.body.appendChild(wrap);
  }

  function visibleTasks(){return [...tasks.values()].filter(t=>t.visible!==false).sort((a,b)=>{const ar=['running','queued'].includes(a.status),br=['running','queued'].includes(b.status);if(ar!==br)return ar?-1:1;return b.startedAt-a.startedAt;}).slice(0,14);}
  function activeTasks(){return [...tasks.values()].filter(t=>['running','queued'].includes(t.status));}
  function statusText(t){if(t.status==='running'&&t.stalled)return 'Possibly stalled';if(t.status==='running')return t.measured?`${Math.round(t.progress)}%`:'Working';if(t.status==='queued')return 'Queued';if(t.status==='complete')return 'Complete';if(t.status==='failed')return 'Failed';if(t.status==='cancelled')return 'Cancelled';return t.status;}
  function render(){
    ensureUI();
    const active=activeTasks(),all=visibleTasks(),badge=document.getElementById('taskCenterBadge'),title=document.getElementById('taskCenterTitle'),list=document.getElementById('taskCenterList'),panel=document.getElementById('taskCenterPanel'),toggle=document.querySelector('.task-center-toggle'),pressure=document.getElementById('taskCenterPressure');
    if(badge)badge.textContent=String(active.length);
    if(title)title.textContent=active.length?`${active.length} running · ${all.length} visible`:'No active work';
    if(toggle){toggle.classList.toggle('active',active.length>0);toggle.setAttribute('aria-expanded',expanded?'true':'false');}
    if(panel)panel.hidden=!expanded;
    if(pressure){if(active.length>=5){pressure.hidden=false;pressure.textContent=`${active.length} tasks are active. Sentinel may queue or reject additional expensive local analysis to keep the Mac responsive.`;}else pressure.hidden=true;}
    if(!list)return;
    if(!all.length){list.innerHTML='<div class="task-center-empty">No running or recently completed tasks.</div>';return;}
    list.innerHTML=all.map(t=>{
      const age=now()-t.startedAt,last=now()-t.lastUpdate;
      const progress=t.measured?`<div class="task-progress-row"><progress max="100" value="${clamp(t.progress)}"></progress><b>${Math.round(clamp(t.progress))}%</b></div>`:`<div class="task-progress-row indeterminate"><div class="task-indeterminate"><i></i></div><b>—</b></div>`;
      const cancel=t.cancel&&['running','queued'].includes(t.status)?`<button type="button" class="task-cancel" data-task-cancel="${esc(t.id)}">${t.cancelRequested?'Cancelling…':'Cancel'}</button>`:'';
      return `<article class="task-item ${esc(t.status)} ${t.stalled?'stalled':''}"><div class="task-item-top"><div><span>${esc(t.source||'Sentinel')}</span><strong>${esc(t.label)}</strong></div><em>${esc(statusText(t))}</em></div>${progress}<div class="task-detail">${esc(t.detail||(!t.measured&&t.status==='running'?'Progress cannot be measured for this operation.':''))}</div><div class="task-meta"><span>Elapsed ${elapsed(age)}</span><span>${t.status==='running'?`Last update ${elapsed(last)} ago`:esc(t.finishedLabel||'')}</span>${cancel}</div></article>`;
    }).join('');
  }

  function trim(){const terminal=[...tasks.values()].filter(t=>!['running','queued'].includes(t.status)).sort((a,b)=>(b.finishedAt||0)-(a.finishedAt||0));for(const t of terminal.slice(12))tasks.delete(t.id);}
  function start(meta={}){
    ensureUI();const task={id:id(),label:String(meta.label||'Sentinel task'),source:String(meta.source||'Sentinel'),detail:String(meta.detail||''),status:meta.status||'running',measured:Boolean(meta.measured),progress:clamp(meta.progress||0),startedAt:now(),lastUpdate:now(),finishedAt:0,finishedLabel:'',stalled:false,visible:meta.visible!==false,cancel:typeof meta.cancel==='function'?meta.cancel:null,cancelRequested:false,showAfter:Number(meta.showAfter||0)};
    if(task.showAfter>0){task.visible=false;setTimeout(()=>{const live=tasks.get(task.id);if(live&&['running','queued'].includes(live.status)){live.visible=true;if(!pinned)expanded=true;render();}},task.showAfter);}else if(!pinned)expanded=true;
    tasks.set(task.id,task);trim();render();log('info','task-start',task.label,{task_id:task.id,source:task.source,measured:task.measured});return task.id;
  }
  function update(taskID,patch={}){const t=tasks.get(taskID);if(!t)return null;if(patch.label!=null)t.label=String(patch.label);if(patch.source!=null)t.source=String(patch.source);if(patch.detail!=null)t.detail=String(patch.detail);if(patch.progress!=null){t.progress=clamp(patch.progress);t.measured=patch.measured!==false;}if(patch.measured!=null)t.measured=Boolean(patch.measured);if(patch.status)t.status=patch.status;t.lastUpdate=now();t.stalled=false;if(t.visible===false&&patch.visible)t.visible=true;render();return t;}
  function terminal(taskID,status,detail=''){const t=tasks.get(taskID);if(!t)return null;t.status=status;t.progress=status==='complete'&&t.measured?100:t.progress;t.detail=String(detail||t.detail||'');t.finishedAt=now();t.lastUpdate=t.finishedAt;t.stalled=false;t.finishedLabel=elapsed(t.finishedAt-t.startedAt);if(t.visible===false&&t.finishedAt-t.startedAt<500){tasks.delete(taskID);render();return null;}t.visible=true;log(status==='failed'?'error':status==='cancelled'?'warn':'info',`task-${status}`,t.label,{task_id:t.id,duration_ms:t.finishedAt-t.startedAt,detail:t.detail});trim();render();return t;}
  const complete=(taskID,detail='')=>terminal(taskID,'complete',detail);
  const fail=(taskID,detail='')=>terminal(taskID,'failed',detail);
  const cancelled=(taskID,detail='')=>terminal(taskID,'cancelled',detail);
  function queue(taskID,detail='Waiting for an analysis slot…'){return update(taskID,{status:'queued',detail});}
  async function requestCancel(taskID){const t=tasks.get(taskID);if(!t?.cancel||t.cancelRequested)return;t.cancelRequested=true;t.detail='Cancellation requested…';t.lastUpdate=now();render();try{await t.cancel();t.detail='Cancellation requested; waiting for the task to acknowledge it.';}catch(error){t.cancelRequested=false;t.detail=`Cancel request failed: ${error?.message||String(error)}`;}render();}

  async function trackedApi(url,options={}){
    if(quiet(url,options))return originalApi(url,options);
    const cleanOptions={...options};delete cleanOptions.task;const method=cleanOptions.method||'GET';
    const taskID=start({label:requestLabel(url,method),source:requestSource(url),detail:'Local request in progress',measured:false,showAfter:450});
    try{const data=await originalApi(url,cleanOptions);complete(taskID,'Local request completed.');return data;}catch(error){if(error?.status===429){const t=tasks.get(taskID);if(t){t.visible=true;t.status='queued';t.detail='Sentinel is busy with other expensive local analysis. This request was not started.';t.finishedAt=now();t.finishedLabel=elapsed(t.finishedAt-t.startedAt);render();}log('warn','task-capacity','Local analysis capacity gate rejected a request.',{url:String(url)});}else fail(taskID,error?.message||String(error));throw error;}
  }
  async function trackedDownload(url,name){const taskID=start({label:'Export '+String(name||'artifact'),source:'Export',detail:'Preparing local download',measured:false,showAfter:150});try{const v=await originalDownload(url,name);complete(taskID,'Export completed.');return v;}catch(error){fail(taskID,error?.message||String(error));throw error;}}

  document.addEventListener('click',event=>{
    const control=event.target.closest('[data-task-center]');if(control){const a=control.dataset.taskCenter;if(a==='toggle'){expanded=!expanded;}if(a==='collapse'){expanded=false;pinned=true;}if(a==='pin'){pinned=!pinned;expanded=true;control.textContent=pinned?'◆':'◇';}if(a==='clear'){for(const [key,t] of tasks)if(!['running','queued'].includes(t.status))tasks.delete(key);}render();return;}
    const cancel=event.target.closest('[data-task-cancel]');if(cancel)void requestCancel(cancel.dataset.taskCancel);
  });

  ticker=setInterval(()=>{let changed=false;for(const t of activeTasks()){const stalled=now()-t.lastUpdate>=30000;if(stalled!==t.stalled){t.stalled=stalled;changed=true;}}if(changed||expanded)render();},1000);
  window.addEventListener('beforeunload',()=>{if(ticker)clearInterval(ticker);});

  S.api=trackedApi;S.download=trackedDownload;
  S.TaskCenter={marker:MARKER,start,update,complete,fail,cancelled,queue,requestCancel,tasks,render};
  ensureUI();render();
})();
'''

TASK_CSS = r'''/* SPDX-License-Identifier: MPL-2.0 */
.task-center{position:fixed;right:18px;bottom:64px;z-index:1800;font-family:inherit;color:var(--text,#e8edf4)}
.task-center-toggle{min-width:102px;height:38px;border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:999px;background:color-mix(in srgb,#111827 92%,transparent);color:#f8fafc;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 12px;box-shadow:0 10px 32px rgba(0,0,0,.24);backdrop-filter:blur(18px);cursor:pointer}
.task-center-toggle #taskCenterBadge{min-width:20px;height:20px;border-radius:999px;background:#263244;display:grid;place-items:center;font-size:11px}
.task-center-toggle.active #taskCenterBadge{background:#16a34a;color:white}.task-center-pulse{width:8px;height:8px;border-radius:50%;background:#94a3b8}.task-center-toggle.active .task-center-pulse{background:#22c55e;box-shadow:0 0 0 0 rgba(34,197,94,.45);animation:taskPulse 1.6s infinite}
.task-center-panel{position:absolute;right:0;bottom:46px;width:min(390px,calc(100vw - 28px));max-height:min(68vh,720px);overflow:hidden;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:18px;background:color-mix(in srgb,#0b1220 94%,transparent);box-shadow:0 24px 70px rgba(0,0,0,.36);backdrop-filter:blur(24px);display:flex;flex-direction:column}
.task-center-panel[hidden]{display:none}.task-center-panel header{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 12px;border-bottom:1px solid rgba(148,163,184,.15)}.task-center-panel header>div:first-child{display:grid;gap:2px}.task-center-panel header span{font-size:10px;letter-spacing:.14em;color:#94a3b8}.task-center-panel header strong{font-size:14px}.task-center-head-actions{display:flex;gap:5px}.task-center-head-actions button{border:0;background:rgba(148,163,184,.1);color:inherit;border-radius:8px;padding:6px 8px;cursor:pointer}
.task-center-pressure{margin:10px 10px 0;padding:9px 10px;border-radius:10px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.25);font-size:11px;line-height:1.4;color:#fbbf24}.task-center-list{padding:10px;display:grid;gap:8px;overflow:auto}.task-center-empty{padding:22px 12px;text-align:center;color:#94a3b8;font-size:12px}.task-item{border:1px solid rgba(148,163,184,.14);border-radius:13px;padding:10px;background:rgba(15,23,42,.76);display:grid;gap:8px}.task-item.complete{opacity:.72}.task-item.failed,.task-item.stalled{border-color:rgba(248,113,113,.38)}.task-item.cancelled{border-color:rgba(245,158,11,.32)}.task-item-top{display:flex;justify-content:space-between;gap:12px}.task-item-top>div{display:grid;min-width:0}.task-item-top span{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8}.task-item-top strong{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.task-item-top em{font-style:normal;font-size:11px;color:#86efac;white-space:nowrap}.task-item.failed .task-item-top em,.task-item.stalled .task-item-top em{color:#fca5a5}.task-item.cancelled .task-item-top em{color:#fcd34d}
.task-progress-row{display:grid;grid-template-columns:1fr 38px;align-items:center;gap:8px}.task-progress-row progress{width:100%;height:8px;accent-color:#22c55e}.task-progress-row>b{font-size:10px;text-align:right;color:#86efac}.task-indeterminate{height:8px;border-radius:999px;background:rgba(148,163,184,.12);overflow:hidden;position:relative}.task-indeterminate i{position:absolute;inset:0 auto 0 -38%;width:38%;border-radius:inherit;background:#22c55e;animation:taskIndeterminate 1.35s ease-in-out infinite}.task-detail{font-size:11px;line-height:1.35;color:#cbd5e1;word-break:break-word}.task-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:#94a3b8;font-size:9px}.task-meta .task-cancel{margin-left:auto;border:1px solid rgba(248,113,113,.25);border-radius:7px;background:rgba(248,113,113,.08);color:#fecaca;font-size:10px;padding:4px 7px;cursor:pointer}.task-center-panel footer{border-top:1px solid rgba(148,163,184,.12);padding:8px 12px;color:#64748b;font-size:9px}
@keyframes taskPulse{70%{box-shadow:0 0 0 7px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}@keyframes taskIndeterminate{0%{left:-38%}55%{left:58%}100%{left:110%}}
@media(max-width:720px){.task-center{right:10px;bottom:58px}.task-center-panel{width:calc(100vw - 20px);max-height:62vh}}
'''

# New Task Center assets.
Path('web/app/task-center.js').write_text(TASK_JS)
Path('web/app/task-center.css').write_text(TASK_CSS)

# Wire assets immediately after core so subsequent modules receive wrapped api/download.
p=Path('web/index.html');s=p.read_text()
old='  <link rel="stylesheet" href="/app/action-dock.css">\n  <link rel="stylesheet" href="/app/ai.css">'
new='  <link rel="stylesheet" href="/app/action-dock.css">\n  <link rel="stylesheet" href="/app/task-center.css">\n  <link rel="stylesheet" href="/app/ai.css">'
if old not in s: raise SystemExit('index css anchor missing')
s=s.replace(old,new,1)
old='  <script src="/app/core.js"></script>\n  <script src="/app/lenses/orient-investigate.js"></script>'
new='  <script src="/app/core.js"></script>\n  <script src="/app/task-center.js"></script>\n  <script src="/app/lenses/orient-investigate.js"></script>'
if old not in s: raise SystemExit('index js anchor missing')
p.write_text(s.replace(old,new,1))

# Storage gets a first-class measured task using the server's real phase_percent.
p=Path('web/app/lenses/system.js');s=p.read_text()
old="  async function startStorage(form){if(state.scanTimer)clearTimeout(state.scanTimer);const fd=new FormData(form);busy('Starting scan','Bounded localhost request');const job=await api('/api/storage/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:fd.get('scope'),min_mb:Number(fd.get('min')),limit:Number(fd.get('limit'))})});state.scanJob=job.id;pollStorage();}"
new="  async function startStorage(form){if(state.scanTimer)clearTimeout(state.scanTimer);const fd=new FormData(form);busy('Starting scan','Bounded localhost request');const job=await api('/api/storage/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:fd.get('scope'),min_mb:Number(fd.get('min')),limit:Number(fd.get('limit'))}),task:false});state.scanJob=job.id;if(S.TaskCenter){state.storageTask=S.TaskCenter.start({label:'Storage measurement',source:'Storage',detail:'Starting bounded traversal…',measured:true,progress:1,cancel:async()=>{if(state.scanJob)await api('/api/storage/cancel?id='+encodeURIComponent(state.scanJob),{method:'POST',task:false});}});}pollStorage();}"
if old not in s: raise SystemExit('storage start anchor missing')
s=s.replace(old,new,1)
old="activity(phase.replaceAll('_',' '),phasePct,detail);const steps=$$('#storagePipeline .s24-step')"
new="activity(phase.replaceAll('_',' '),phasePct,detail);if(state.storageTask&&S.TaskCenter)S.TaskCenter.update(state.storageTask,{progress:phasePct,detail:`${phase.replaceAll('_',' ')} · ${detail}`,measured:true});const steps=$$('#storagePipeline .s24-step')"
if old not in s: raise SystemExit('storage progress anchor missing')
s=s.replace(old,new,1)
old="if(j.status==='running'){state.scanTimer=setTimeout(pollStorage,500);return;}if(j.status==='failed')throw new Error(j.error||'Storage scan failed');if(j.result)renderStorageResult(j.result,j.status);activity(j.status==='cancelled'?'Cancelled':'Complete',100,j.status==='cancelled'?'Partial measured result preserved when available.':'Building storage report complete.');}catch(e){notice(e.message);activity('Error',0,e.message);}}"
new="if(j.status==='running'){state.scanTimer=setTimeout(pollStorage,500);return;}if(j.status==='failed')throw new Error(j.error||'Storage scan failed');if(j.result)renderStorageResult(j.result,j.status);if(state.storageTask&&S.TaskCenter){if(j.status==='cancelled')S.TaskCenter.cancelled(state.storageTask,'Storage measurement cancelled; partial result may be preserved.');else S.TaskCenter.complete(state.storageTask,'Storage measurement and report complete.');state.storageTask='';}activity(j.status==='cancelled'?'Cancelled':'Complete',100,j.status==='cancelled'?'Partial measured result preserved when available.':'Building storage report complete.');}catch(e){if(state.storageTask&&S.TaskCenter){S.TaskCenter.fail(state.storageTask,e.message||String(e));state.storageTask='';}notice(e.message);activity('Error',0,e.message);}}"
if old not in s: raise SystemExit('storage terminal anchor missing')
p.write_text(s.replace(old,new,1))

# Full Scan gets one measured parent task; stage count remains the source of truth.
p=Path('web/app/full-scan.js');s=p.read_text()
old="    outcome: 'IDLE',\n    lastSummary: null,\n  };"
new="    outcome: 'IDLE',\n    lastSummary: null,\n    taskID: '',\n  };"
if old not in s: raise SystemExit('full scan state anchor missing')
s=s.replace(old,new,1)
old="    fullScan.storageJob = '';\n    fullScan.startedAt = Date.now();"
new="    fullScan.storageJob = '';\n    fullScan.startedAt = Date.now();\n    if (S.TaskCenter) fullScan.taskID = S.TaskCenter.start({label: 'Full Scan', source: 'Scan Center', detail: 'Preparing comprehensive retained evidence baseline…', measured: true, progress: 0, cancel: async () => { fullScan.cancelRequested = true; }});"
if old not in s: raise SystemExit('full scan start anchor missing')
s=s.replace(old,new,1)
old="    const active = fullScan.stages.find(s => s.status === 'running');\n    activity(fullScan.running ? 'Full Scan' : fullScan.outcome === 'FAILED' ? 'Error' : 'Ready', pct, active ? active.label : `${terminal}/${fullScan.stages.length} Full Scan stages`);"
new="    const active = fullScan.stages.find(s => s.status === 'running');\n    if (fullScan.taskID && S.TaskCenter) S.TaskCenter.update(fullScan.taskID, {progress: pct, measured: true, detail: active ? `${active.label} · ${terminal}/${fullScan.stages.length} stages complete` : `${terminal}/${fullScan.stages.length} Full Scan stages`});\n    activity(fullScan.running ? 'Full Scan' : fullScan.outcome === 'FAILED' ? 'Error' : 'Ready', pct, active ? active.label : `${terminal}/${fullScan.stages.length} Full Scan stages`);"
if old not in s: raise SystemExit('full scan progress anchor missing')
s=s.replace(old,new,1)
old="    if (S.Workbench && typeof S.Workbench.recordEvent === 'function') {\n      S.Workbench.recordEvent('full-scan', `Full Scan ${summary.outcome}.`, {outcome: summary.outcome, duration_ms: summary.duration_ms, ...counts});\n    }\n    return summary;"
new="    if (S.Workbench && typeof S.Workbench.recordEvent === 'function') {\n      S.Workbench.recordEvent('full-scan', `Full Scan ${summary.outcome}.`, {outcome: summary.outcome, duration_ms: summary.duration_ms, ...counts});\n    }\n    if (fullScan.taskID && S.TaskCenter) {\n      if (summary.outcome === 'FAILED') S.TaskCenter.fail(fullScan.taskID, `Full Scan failed · ${counts.failed} failed stage(s)`);\n      else if (summary.outcome === 'CANCELLED') S.TaskCenter.cancelled(fullScan.taskID, 'Full Scan cancelled by user.');\n      else S.TaskCenter.complete(fullScan.taskID, `Full Scan ${summary.outcome} · ${counts.done} done · ${counts.limited} limited`);\n      fullScan.taskID = '';\n    }\n    return summary;"
if old not in s: raise SystemExit('full scan terminal task anchor missing')
p.write_text(s.replace(old,new,1))

Path('floating_task_center_contract_test.go').write_text(r'''// SPDX-License-Identifier: MPL-2.0
package main

import (
    "os"
    "strings"
    "testing"
)

func TestFloatingTaskCenterContract(t *testing.T) {
    taskJS, err := os.ReadFile("web/app/task-center.js")
    if err != nil { t.Fatal(err) }
    taskCSS, err := os.ReadFile("web/app/task-center.css")
    if err != nil { t.Fatal(err) }
    index, err := os.ReadFile("web/index.html")
    if err != nil { t.Fatal(err) }
    system, err := os.ReadFile("web/app/lenses/system.js")
    if err != nil { t.Fatal(err) }
    scan, err := os.ReadFile("web/app/full-scan.js")
    if err != nil { t.Fatal(err) }
    js, css, page := string(taskJS), string(taskCSS), string(index)
    required := []string{"Sentinel 2.7 Floating Task Center", "Possibly stalled", "Progress cannot be measured", "task-start", "requestCancel", "showAfter:450"}
    for _, token := range required { if !strings.Contains(js, token) { t.Fatalf("Task Center missing %q", token) } }
    if !strings.Contains(css, "#22c55e") || !strings.Contains(css, "task-indeterminate") { t.Fatal("Task Center green measured/indeterminate progress styling missing") }
    if !strings.Contains(page, "/app/task-center.css") || !strings.Contains(page, "/app/task-center.js") { t.Fatal("Task Center assets are not wired into product index") }
    if strings.Index(page, "/app/task-center.js") > strings.Index(page, "/app/lenses/orient-investigate.js") { t.Fatal("Task Center must load before product modules so api/download wrappers are inherited") }
    if !strings.Contains(string(system), "Storage measurement") || !strings.Contains(string(system), "phasePct") || !strings.Contains(string(system), "S.TaskCenter.update") { t.Fatal("Storage measured progress is not connected to Task Center") }
    if !strings.Contains(string(scan), "label: 'Full Scan'") || !strings.Contains(string(scan), "S.TaskCenter.update(fullScan.taskID") { t.Fatal("Full Scan measured progress is not connected to Task Center") }
}
''')
