// SPDX-License-Identifier: MPL-2.0
// Sentinel 3.7 Engineering Operations Baseline — in-memory phase comparison.
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)return;
  const MARKER='Sentinel 3.7 Engineering Operations Baseline';
  const PANEL_ID='engineeringOperationsBaseline';
  const MIN_RATE_WINDOW_MS=60000;
  let baseline=null;
  let lastPanelSignature='';

  function esc(value){return S.esc?S.esc(String(value??'')):String(value??'');}
  function rows(){return S.TaskCenter?.tasks?[...S.TaskCenter.tasks.values()]:[];}
  function median(values){
    const data=values.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!data.length)return null;
    const mid=Math.floor(data.length/2);
    return data.length%2?data[mid]:(data[mid-1]+data[mid])/2;
  }
  function duration(ms){
    if(!Number.isFinite(ms)||ms<0)return '—';
    const seconds=Math.round(ms/1000);
    if(seconds<60)return `${seconds}s`;
    return `${Math.floor(seconds/60)}m ${seconds%60}s`;
  }
  function signedDuration(ms){
    if(!Number.isFinite(ms))return '—';
    const sign=ms>0?'+':ms<0?'−':'';
    return `${sign}${duration(Math.abs(ms))}`;
  }
  function percent(part,total){return total>0?part/total:null;}
  function fmtPct(value){return value==null?'—':`${(value*100).toFixed(0)}%`;}
  function fmtDelta(value,formatter=v=>String(v)){
    if(value==null||!Number.isFinite(value))return '—';
    const sign=value>0?'+':'';
    return `${sign}${formatter(value)}`;
  }

  function summarize(data){
    const now=Date.now();
    const active=data.filter(t=>t.status==='running');
    const done=data.filter(t=>t.status==='done');
    const failed=data.filter(t=>t.status==='failed');
    const cancelled=data.filter(t=>t.status==='cancelled');
    const terminal=data.filter(t=>t.status!=='running'&&Number(t.startedAt)>0&&Number(t.completedAt)>0);
    const cycles=terminal.map(t=>Number(t.completedAt)-Number(t.startedAt)).filter(ms=>ms>=0);
    const first=data.length?Math.min(...data.map(t=>Number(t.startedAt)||now)):now;
    const last=data.length?Math.max(...data.map(t=>Number(t.completedAt)||Number(t.startedAt)||first)):now;
    const span=Math.max(0,last-first);
    const throughput=span>=MIN_RATE_WINDOW_MS?done.length/(span/60000):null;
    const outcomeTotal=done.length+failed.length+cancelled.length;
    const sources=new Map();
    for(const task of data){
      const name=String(task.source||task.kind||'Unspecified source').trim()||'Unspecified source';
      sources.set(name,(sources.get(name)||0)+1);
    }
    return {
      taskCount:data.length,
      active:active.length,
      done:done.length,
      failed:failed.length,
      cancelled:cancelled.length,
      terminal:terminal.length,
      medianCycle:median(cycles),
      throughput,
      span,
      doneShare:percent(done.length,outcomeTotal),
      failureShare:percent(failed.length,outcomeTotal),
      cancellationShare:percent(cancelled.length,outcomeTotal),
      sources:[...sources.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),
    };
  }

  function captureBaseline(){
    const retained=rows();
    baseline={capturedAt:Date.now(),reference:summarize(retained),retainedTaskIds:new Set(retained.map(t=>t.id))};
    lastPanelSignature='';
    ensure();
    S.notice?.(`Engineering Operations baseline captured from ${retained.length} retained task record(s).`);
  }

  function clearBaseline(){
    baseline=null;
    lastPanelSignature='';
    ensure();
    S.notice?.('Engineering Operations baseline cleared.');
  }

  function afterRows(){
    if(!baseline)return [];
    return rows().filter(task=>Number(task.startedAt)>=baseline.capturedAt&&!baseline.retainedTaskIds.has(task.id));
  }

  function panelSignature(){
    if(!baseline)return 'no-baseline';
    const after=afterRows().map(t=>[
      t.id,t.status,Number(t.startedAt)||0,Number(t.completedAt)||0,t.source||'',t.kind||'',Boolean(t.stalled),
    ].join('~')).sort().join('|');
    return `${baseline.capturedAt}|${after}`;
  }

  function sourceShift(reference,after){
    if(!after.sources.length)return '<p>No post-baseline source evidence is available yet.</p>';
    const ref=new Map(reference.sources),post=new Map(after.sources);
    const totalAfter=Math.max(1,after.taskCount),totalRef=Math.max(1,reference.taskCount);
    const names=[...new Set([...reference.sources.map(x=>x[0]),...after.sources.map(x=>x[0])])];
    const data=names.map(name=>({name,ref:(ref.get(name)||0)/totalRef,after:(post.get(name)||0)/totalAfter}))
      .sort((a,b)=>Math.abs(b.after-b.ref)-Math.abs(a.after-a.ref)).slice(0,6);
    return `<div class="eob-source-shift">${data.map(row=>`<div><b>${esc(row.name)}</b><span>${fmtPct(row.ref)} → ${fmtPct(row.after)}</span><small>${fmtDelta(row.after-row.ref,v=>`${(v*100).toFixed(0)} pp`)}</small></div>`).join('')}</div>`;
  }

  function comparisonTable(reference,after){
    const cycleDelta=reference.medianCycle!=null&&after.medianCycle!=null?after.medianCycle-reference.medianCycle:null;
    const throughputDelta=reference.throughput!=null&&after.throughput!=null?after.throughput-reference.throughput:null;
    const doneDelta=reference.doneShare!=null&&after.doneShare!=null?after.doneShare-reference.doneShare:null;
    return `<div class="eo-table-wrap"><table class="eo-table"><thead><tr><th>Measure</th><th>Reference phase</th><th>After baseline</th><th>Directional delta</th></tr></thead><tbody>
      <tr><td>Retained task records</td><td>${reference.taskCount}</td><td>${after.taskCount}</td><td>${fmtDelta(after.taskCount-reference.taskCount)}</td></tr>
      <tr><td>Terminal observations</td><td>${reference.terminal}</td><td>${after.terminal}</td><td>${fmtDelta(after.terminal-reference.terminal)}</td></tr>
      <tr><td>Median terminal cycle</td><td>${duration(reference.medianCycle)}</td><td>${duration(after.medianCycle)}</td><td>${cycleDelta==null?'—':signedDuration(cycleDelta)}</td></tr>
      <tr><td>Observed throughput</td><td>${reference.throughput==null?'—':`${reference.throughput.toFixed(2)} done/min`}</td><td>${after.throughput==null?'—':`${after.throughput.toFixed(2)} done/min`}</td><td>${fmtDelta(throughputDelta,v=>`${v.toFixed(2)} done/min`)}</td></tr>
      <tr><td>Done share of terminal outcomes</td><td>${fmtPct(reference.doneShare)}</td><td>${fmtPct(after.doneShare)}</td><td>${fmtDelta(doneDelta,v=>`${(v*100).toFixed(0)} pp`)}</td></tr>
      <tr><td>Failed / cancelled</td><td>${reference.failed} / ${reference.cancelled}</td><td>${after.failed} / ${after.cancelled}</td><td>Review separately</td></tr>
      <tr><td>WIP snapshot</td><td>${reference.active}</td><td>${after.active}</td><td>${fmtDelta(after.active-reference.active)}</td></tr>
    </tbody></table></div>`;
  }

  function readiness(reference,after){
    const notes=[];
    if(!after.taskCount)notes.push('No post-baseline task has started yet. Phase comparison is waiting for new operations.');
    if(after.taskCount&&after.terminal===0)notes.push('Post-baseline work exists, but no terminal task observation is available yet. Cycle/outcome comparison remains incomplete.');
    if(after.span<MIN_RATE_WINDOW_MS)notes.push('The post-baseline observation span is under 60 seconds, so throughput remains unavailable rather than extrapolated.');
    if(after.terminal>0)notes.push('Directional before/after evidence is available, but no statistical significance or causal effect is claimed.');
    notes.push('SPC readiness is not established automatically. Control limits require a deliberately defined, repeatedly observed, comparable reference process; Sentinel does not infer that condition from Task Center history alone.');
    return `<ul>${notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
  }

  function render(){
    if(!baseline){
      return `<section id="${PANEL_ID}" class="eob-panel"><div class="eob-head"><div><span>PHASE BASELINE / BEFORE–AFTER</span><h4>Establish a bounded reference phase</h4><p>Capture the Task Center evidence currently retained in memory, then compare only operations that start after that phase boundary.</p></div><button type="button" class="s24-action primary" data-eob-capture>Capture baseline</button></div><div class="eob-note"><b>Boundary</b><p>A baseline is a reference snapshot, not a claim of normality, target performance, process control, or statistical stability. It resets when the app/reload resets this in-memory module.</p></div></section>`;
    }
    const after=summarize(afterRows());
    const reference=baseline.reference;
    return `<section id="${PANEL_ID}" class="eob-panel has-baseline">
      <div class="eob-head"><div><span>PHASE BASELINE / BEFORE–AFTER</span><h4>Reference vs post-baseline operations</h4><p>Baseline captured ${esc(new Date(baseline.capturedAt).toLocaleString())} from ${reference.taskCount} retained task record(s). Only later-starting tasks enter the after phase.</p></div><div class="eob-actions"><button type="button" class="s24-action" data-eob-capture>Replace baseline</button><button type="button" class="s24-action" data-eob-clear>Clear</button></div></div>
      ${comparisonTable(reference,after)}
      <div class="eob-columns"><section><div class="eo-kicker">SOURCE MIX</div><h4>Subsystem/interface mix shift</h4>${sourceShift(reference,after)}</section><section><div class="eo-kicker">READINESS / LIMITS</div><h4>What this comparison can support</h4>${readiness(reference,after)}</section></div>
      <div class="eob-note"><b>NOT ESTABLISHED</b><p>This phase comparison does not establish causality, statistical significance, common/special cause, process capability, control limits, queueing steady state, or an optimization recommendation. Those require a defined comparable process and additional repeated evidence.</p></div>
    </section>`;
  }

  function ensure(){
    if(S.state?.lens!=='observatory')return;
    const parent=document.getElementById('engineeringOperationsBand');
    if(!parent)return;
    const signature=panelSignature();
    const existing=document.getElementById(PANEL_ID);
    if(existing&&signature===lastPanelSignature)return;
    const holder=document.createElement('div');
    holder.innerHTML=render();
    if(existing)existing.replaceWith(holder.firstElementChild);
    else parent.appendChild(holder.firstElementChild);
    lastPanelSignature=signature;
  }

  function injectStyle(){
    if(document.querySelector('link[data-sentinel-engineering-operations-baseline-style]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/app/engineering-operations-baseline.css';
    link.dataset.sentinelEngineeringOperationsBaselineStyle='1';
    document.head.appendChild(link);
  }

  document.addEventListener('click',event=>{
    if(event.target.closest('[data-eob-capture]')){event.preventDefault();captureBaseline();return;}
    if(event.target.closest('[data-eob-clear]')){event.preventDefault();clearBaseline();}
  });

  injectStyle();
  const observer=new MutationObserver(()=>ensure());
  observer.observe(document.getElementById('evidenceStage')||document.body,{childList:true,subtree:true});
  setInterval(ensure,2000);
  ensure();

  S.EngineeringOperationsBaseline={marker:MARKER,captureBaseline,clearBaseline,summarize,afterRows,panelSignature,get baseline(){return baseline;}};
  window.__SENTINEL_ENGINEERING_OPERATIONS_BASELINE__={marker:MARKER};
})();
