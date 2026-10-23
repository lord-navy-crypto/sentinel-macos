// SPDX-License-Identifier: MPL-2.0
// Sentinel 3.6 Engineering Operations Intelligence — bounded operational evidence
// derived from the existing in-memory Task Center. No second task database.
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)return;
  const MARKER='Sentinel 3.6 Engineering Operations Intelligence';
  const HOST_ID='engineeringOperationsBand';
  const MIN_RATE_WINDOW_MS=60000;
  let lastRenderSignature='';

  function esc(value){return S.esc?S.esc(String(value??'')):String(value??'');}
  function tasks(){return S.TaskCenter?.tasks?[...S.TaskCenter.tasks.values()]:[];}
  function duration(ms){
    if(!(ms>=0))return '—';
    const seconds=Math.round(ms/1000);
    if(seconds<60)return `${seconds}s`;
    const minutes=Math.floor(seconds/60),rest=seconds%60;
    return `${minutes}m ${rest}s`;
  }
  function median(values){
    const rows=values.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!rows.length)return null;
    const mid=Math.floor(rows.length/2);
    return rows.length%2?rows[mid]:(rows[mid-1]+rows[mid])/2;
  }
  function pct(part,total){return total>0?`${(part/total*100).toFixed(0)}%`:'—';}
  function renderSignature(){
    return tasks().map(t=>[
      t.id,t.status,Number(t.progress)||0,Boolean(t.indeterminate),t.detail||'',t.source||'',t.kind||'',
      Number(t.startedAt)||0,Number(t.completedAt)||0,Boolean(t.stalled),Number(t.signalCount)||1,
    ].join('~')).sort().join('|');
  }

  function summarize(){
    const rows=tasks(),now=Date.now();
    const active=rows.filter(t=>t.status==='running');
    const done=rows.filter(t=>t.status==='done');
    const failed=rows.filter(t=>t.status==='failed');
    const cancelled=rows.filter(t=>t.status==='cancelled');
    const terminal=rows.filter(t=>t.status!=='running'&&Number(t.completedAt)>0&&Number(t.startedAt)>0);
    const cycleRows=terminal.map(t=>Number(t.completedAt)-Number(t.startedAt)).filter(ms=>ms>=0);
    const first=rows.length?Math.min(...rows.map(t=>Number(t.startedAt)||now)):now;
    const last=rows.length?Math.max(...rows.map(t=>Number(t.completedAt)||Number(t.startedAt)||first)):now;
    const observedSpan=Math.max(0,last-first);
    const throughput=observedSpan>=MIN_RATE_WINDOW_MS?done.length/(observedSpan/60000):null;
    const stalled=active.filter(t=>t.stalled);
    const groupedSignals=rows.reduce((n,t)=>n+Math.max(0,Number(t.signalCount||1)-1),0);
    const sources=new Map();
    for(const task of rows){
      const name=String(task.source||task.kind||'Unspecified source').trim()||'Unspecified source';
      const row=sources.get(name)||{name,total:0,active:0,done:0,failed:0,cancelled:0,cycle:[]};
      row.total++;
      if(task.status==='running')row.active++;
      else if(task.status==='done')row.done++;
      else if(task.status==='failed')row.failed++;
      else if(task.status==='cancelled')row.cancelled++;
      if(task.status!=='running'&&Number(task.completedAt)>0&&Number(task.startedAt)>0)row.cycle.push(Number(task.completedAt)-Number(task.startedAt));
      sources.set(name,row);
    }
    const sourceRows=[...sources.values()].sort((a,b)=>b.active-a.active||b.total-a.total||a.name.localeCompare(b.name));
    return {rows,active,done,failed,cancelled,terminal,cycleRows,first,last,observedSpan,throughput,stalled,groupedSignals,sourceRows};
  }

  function metric(label,value,detail){return `<article class="eo-metric"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(detail)}</small></article>`;}

  function sourceTable(sourceRows){
    if(!sourceRows.length)return '<div class="eo-empty">No retained task-source evidence is available yet.</div>';
    return `<div class="eo-table-wrap"><table class="eo-table"><thead><tr><th>Source / subsystem</th><th>WIP</th><th>Done</th><th>Failed</th><th>Cancelled</th><th>Median cycle</th></tr></thead><tbody>${sourceRows.slice(0,10).map(row=>`<tr><td>${esc(row.name)}</td><td>${row.active}</td><td>${row.done}</td><td>${row.failed}</td><td>${row.cancelled}</td><td>${esc(duration(median(row.cycle)))}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function interpretation(summary){
    const notes=[];
    if(summary.active.length>=4)notes.push('Multiple concurrent operations are visible. This is an interaction/coordination pressure signal, not a measured cognitive-workload score.');
    if(summary.stalled.length)notes.push(`${summary.stalled.length} running task(s) currently satisfy Sentinel’s stall-visibility rule.`);
    if(summary.failed.length)notes.push(`${summary.failed.length} retained task failure(s) are visible and should be reviewed by source before treating them as one common failure mode.`);
    if(!notes.length&&summary.rows.length)notes.push('The retained task window does not currently show a high-concurrency, stalled, or failed-work signal. This is not a reliability certificate.');
    if(!summary.rows.length)notes.push('No retained Task Center operations are available yet, so process-performance interpretation is unavailable.');
    return notes.map(x=>`<li>${esc(x)}</li>`).join('');
  }

  function render(){
    const d=summarize();
    const terminalCount=d.done.length+d.failed.length+d.cancelled.length;
    const cycle=median(d.cycleRows);
    const rate=d.throughput==null?'building window…':`${d.throughput.toFixed(2)} done/min`;
    return `<section id="${HOST_ID}" class="eo-band" data-engineering-operations="1">
      <div class="eo-head"><div><span>IOE + SYSTEMS ENGINEERING</span><h3>Engineering Operations / 工程运行</h3><p>Bounded operational evidence from the existing Task Center. This is a process-observation layer, not a second task collector.</p></div><small>${d.rows.length} retained task record(s)</small></div>
      <div class="eo-grid">
        ${metric('WIP',String(d.active.length),'Currently running operations')}
        ${metric('Median terminal cycle',duration(cycle),`${d.cycleRows.length} completed/failed/cancelled cycle observation(s)`)}
        ${metric('Observed throughput',rate,d.throughput==null?'Needs at least 60s retained observation span':'Retained-session completion rate, not steady-state capacity')}
        ${metric('Done outcomes',`${d.done.length} / ${terminalCount||0}`,`${pct(d.done.length,terminalCount)} of terminal retained outcomes`)}
        ${metric('Failed / cancelled',`${d.failed.length} / ${d.cancelled.length}`,'Outcome evidence; cancellation is not treated as failure')}
        ${metric('Stalled now',String(d.stalled.length),`${d.groupedSignals} duplicate task signal(s) grouped in retained history`)}
      </div>
      <div class="eo-columns">
        <section><div class="eo-kicker">SYSTEM / INTERFACE LOAD</div><h4>Where work is coming from</h4>${sourceTable(d.sourceRows)}</section>
        <section><div class="eo-kicker">INTERPRETATION</div><h4>What the current process evidence suggests</h4><ul>${interpretation(d)}</ul></section>
      </div>
      <div class="eo-boundaries">
        <section><b>ENGINEERING BRIDGE</b><p><strong>IOE:</strong> WIP, cycle time, throughput, outcome mix and source load. <strong>Systems engineering:</strong> subsystem/interface visibility and technical performance evidence. <strong>Human factors:</strong> concurrent-work visibility. <strong>Quality/reliability:</strong> retained failure and stall evidence.</p></section>
        <section><b>NOT ESTABLISHED</b><p>No stationary arrival process, service-time distribution, queue discipline, cost/objective function, controlled experiment, MTBF, causal relationship, optimal concurrency level, or safe capacity limit is established from this bounded in-memory task history. Little’s Law or optimization claims are therefore not inferred.</p></section>
      </div>
    </section>`;
  }

  function ensure(){
    if(S.state?.lens!=='observatory')return;
    const stage=document.getElementById('evidenceStage');
    if(!stage)return;
    const signature=renderSignature();
    let host=document.getElementById(HOST_ID);
    if(!host){
      stage.insertAdjacentHTML('beforeend',render());
      lastRenderSignature=signature;
      return;
    }
    if(signature===lastRenderSignature)return;
    const replacement=document.createElement('div');
    replacement.innerHTML=render();
    host.replaceWith(replacement.firstElementChild);
    lastRenderSignature=signature;
  }

  function injectStyle(){
    if(document.querySelector('link[data-sentinel-engineering-operations-style]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/app/engineering-operations.css';
    link.dataset.sentinelEngineeringOperationsStyle='1';
    document.head.appendChild(link);
  }

  function loadBaselineExtension(){
    if(document.querySelector('script[data-sentinel-engineering-operations-baseline]'))return;
    const script=document.createElement('script');
    script.src='/app/engineering-operations-baseline.js';
    script.dataset.sentinelEngineeringOperationsBaseline='1';
    script.async=true;
    script.addEventListener('error',()=>console.warn('Sentinel Engineering Operations Baseline could not be loaded.'));
    document.body.appendChild(script);
  }

  function loadQualityExperimentExtension(){
    if(document.querySelector('script[data-sentinel-engineering-quality-experiment]'))return;
    const script=document.createElement('script');
    script.src='/app/engineering-quality-experiment.js';
    script.dataset.sentinelEngineeringQualityExperiment='1';
    script.async=true;
    script.addEventListener('error',()=>console.warn('Sentinel Engineering Quality & Experiment Readiness could not be loaded.'));
    document.body.appendChild(script);
  }

  function loadQueueReadinessExtension(){
    if(document.querySelector('script[data-sentinel-engineering-queue-readiness]'))return;
    const script=document.createElement('script');
    script.src='/app/engineering-queue-readiness.js';
    script.dataset.sentinelEngineeringQueueReadiness='1';
    script.async=true;
    script.addEventListener('error',()=>console.warn('Sentinel Queue & Capacity Model Readiness could not be loaded.'));
    document.body.appendChild(script);
  }

  function loadReliabilityReadinessExtension(){
    if(document.querySelector('script[data-sentinel-engineering-reliability-readiness]'))return;
    const script=document.createElement('script');
    script.src='/app/engineering-reliability-readiness.js';
    script.dataset.sentinelEngineeringReliabilityReadiness='1';
    script.async=true;
    script.addEventListener('error',()=>console.warn('Sentinel Reliability Exposure & Failure-Family Readiness could not be loaded.'));
    document.body.appendChild(script);
  }

  injectStyle();
  const observer=new MutationObserver(()=>ensure());
  observer.observe(document.getElementById('evidenceStage')||document.body,{childList:true,subtree:true});
  setInterval(ensure,2000);
  ensure();

  S.EngineeringOperations={marker:MARKER,summarize,render,renderSignature};
  window.__SENTINEL_ENGINEERING_OPERATIONS__={marker:MARKER};
  loadBaselineExtension();
  loadQualityExperimentExtension();
  loadQueueReadinessExtension();
  loadReliabilityReadinessExtension();
})();
