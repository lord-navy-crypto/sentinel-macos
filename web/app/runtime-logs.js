// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)throw new Error('Sentinel application core did not load before Runtime Logs.');
  const {$,api,question,band,ledger,registerLens,activity,notice}=S;

  const MARKER='Sentinel 2.7 Runtime Logs';
  const logState={timer:null,paused:false,source:'all',level:'all',entries:[],lastSequence:0};

  async function runtimeLog(level='info',source='client',event='event',message='',fields={}){
    try{
      return await api('/api/runtime/logs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({level,source,event,message,fields})});
    }catch{return null;}
  }
  S.runtimeLog=runtimeLog;
  S.RUNTIME_LOG_MARKER=MARKER;
  void runtimeLog('info',window.__sentinelNativeAppView?'native':'client','frontend-ready','Sentinel frontend runtime logging is ready.',{container:window.__sentinelNativeAppView?'native-app-view':'browser'});

  function stopTimer(){if(logState.timer){clearInterval(logState.timer);logState.timer=null;}}
  function schedule(){stopTimer();if(!logState.paused&&S.state.lens==='runtime-logs')logState.timer=setInterval(()=>refreshLogs(true),1200);}
  function fmtTime(value){const d=new Date(value);return Number.isNaN(d.getTime())?String(value||''):d.toLocaleTimeString(undefined,{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3});}
  function fieldsText(fields){if(!fields||!Object.keys(fields).length)return '';try{return JSON.stringify(fields);}catch{return String(fields);}}
  function line(entry){const fields=fieldsText(entry.fields);return `${fmtTime(entry.time)}  #${entry.sequence}  ${String(entry.level||'info').toUpperCase().padEnd(5)}  ${String(entry.source||'client').padEnd(10)}  ${entry.event||'event'}  ${entry.message||''}${fields?'  '+fields:''}`;}
  function filtered(){return logState.entries.filter(e=>(logState.source==='all'||e.source===logState.source)&&(logState.level==='all'||e.level===logState.level));}
  function renderStream(){
    const out=$('#runtimeLogStream');if(!out)return;
    const rows=filtered();
    out.textContent=rows.length?rows.map(line).join('\n'):'No matching runtime log entries yet.';
    if(!logState.paused)out.scrollTop=out.scrollHeight;
    const count=$('#runtimeLogCount');if(count)count.textContent=`${rows.length} visible / ${logState.entries.length} retained in this view`;
  }
  async function refreshLogs(incremental=false){
    if(incremental&&S.state.lens!=='runtime-logs'){stopTimer();return;}
    if(logState.paused&&incremental)return;
    try{
      const after=incremental?logState.lastSequence:0;
      const data=await api(`/api/runtime/logs?after=${after}&limit=2000`);
      const incoming=data.entries||[];
      if(incremental)logState.entries.push(...incoming);else logState.entries=incoming;
      if(logState.entries.length>2000)logState.entries=logState.entries.slice(-2000);
      if(incoming.length)logState.lastSequence=Number(incoming[incoming.length-1].sequence||logState.lastSequence);
      renderStream();
      activity('Runtime Logs',100,logState.paused?'Paused':'Live · polling local engine every 1.2 s');
    }catch(error){notice(error?.message||String(error));activity('Error',0,error?.message||String(error));}
  }
  async function copyLogs(){
    const text=filtered().map(line).join('\n');
    if(!text)return notice('There are no visible log lines to copy.');
    try{await navigator.clipboard.writeText(text);notice(`Copied ${filtered().length} runtime log lines.`);}catch{notice('Clipboard access was unavailable. Select the log text and copy it manually.');}
  }
  async function clearLogs(){
    await api('/api/runtime/logs',{method:'DELETE'});
    logState.entries=[];logState.lastSequence=0;
    await refreshLogs(false);
    notice('Runtime log buffer cleared.');
  }
  async function renderLogs(){
    stopTimer();
    $('#evidenceStage').innerHTML=question('<button type="button" class="s24-action primary" data-runtime-log="refresh">Refresh now</button><button type="button" class="s24-action" data-runtime-log="pause">Pause live view</button><button type="button" class="s24-action" data-runtime-log="copy">Copy visible logs</button>')+
      band(1,'Runtime log status',ledger([['Retention','2,000 most recent events','Bounded in memory'],['Storage','Memory only','Cleared when Sentinel exits'],['Secrets','Session credentials redacted','Token/query values are not intentionally logged'],['Update mode','Live polling','1.2 second interval']]),'One local event stream combines backend, HTTP, Native/App View and Local AI lifecycle evidence.')+
      band(2,'Filters',`<div class="s24-form two"><label class="s24-field"><span>Source</span><select id="runtimeLogSource"><option value="all">All sources</option><option value="backend">backend</option><option value="http">http</option><option value="native">native</option><option value="local-ai">local-ai</option><option value="scan">scan</option><option value="storage">storage</option><option value="client">client</option></select></label><label class="s24-field"><span>Level</span><select id="runtimeLogLevel"><option value="all">All levels</option><option value="debug">debug</option><option value="info">info</option><option value="warn">warn</option><option value="error">error</option></select></label></div>`)+
      band(3,'Live event stream',`<div class="s24-band-head"><div><p id="runtimeLogCount">Loading…</p></div><div class="s24-band-tools"><button type="button" class="s24-action" data-runtime-log="clear">Clear buffer</button></div></div><pre id="runtimeLogStream" style="max-height:55vh;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.5">Loading runtime logs…</pre>`,'For Local AI troubleshooting, the final local-ai progress/error event is usually the most useful boundary. HTTP entries record method, path, status and duration only.');
    const src=$('#runtimeLogSource'),lvl=$('#runtimeLogLevel');if(src)src.value=logState.source;if(lvl)lvl.value=logState.level;
    await refreshLogs(false);schedule();
  }

  document.addEventListener('change',event=>{
    if(event.target?.id==='runtimeLogSource'){logState.source=event.target.value;renderStream();}
    if(event.target?.id==='runtimeLogLevel'){logState.level=event.target.value;renderStream();}
  });
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-runtime-log]');if(!button)return;
    try{
      const action=button.dataset.runtimeLog;
      if(action==='refresh')return await refreshLogs(false);
      if(action==='pause'){logState.paused=!logState.paused;button.textContent=logState.paused?'Resume live view':'Pause live view';schedule();activity('Runtime Logs',100,logState.paused?'Paused':'Live');return;}
      if(action==='copy')return await copyLogs();
      if(action==='clear')return await clearLogs();
    }catch(error){notice(error?.message||String(error));}
  });

  const system=S.MISSIONS.find(m=>m.id==='system');if(system&&!system.lenses.includes('runtime-logs'))system.lenses.push('runtime-logs');
  S.LENSES['runtime-logs']={label:'Runtime Logs',verb:'TRACE',title:'What is Sentinel doing in the background?',rule:'Use bounded runtime events to locate a stage or failure; logs are operational evidence, not a security verdict.'};
  registerLens('runtime-logs',renderLogs);
  window.addEventListener('beforeunload',stopTimer);
})();
