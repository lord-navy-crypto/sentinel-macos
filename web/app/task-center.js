// SPDX-License-Identifier: MPL-2.0
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
    try{const data=await originalApi(url,cleanOptions);complete(taskID,'Local request completed.');return data;}catch(error){if(error?.status===429){const t=tasks.get(taskID);if(t){t.visible=true;t.status='failed';t.detail='Capacity limited · Sentinel is busy with other expensive local analysis. This request was not started.';t.finishedAt=now();t.lastUpdate=t.finishedAt;t.finishedLabel=elapsed(t.finishedAt-t.startedAt);render();}log('warn','task-capacity','Local analysis capacity gate rejected a request.',{url:String(url)});}else fail(taskID,error?.message||String(error));throw error;}
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
