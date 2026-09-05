// SPDX-License-Identifier: MPL-2.0
// Sentinel 4.0 Reliability Exposure & Failure-Family Readiness — bounded operational
// reliability evidence over retained Task Center records. No hazard/ROCOF/MTBF model.
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)return;

  const MARKER='Sentinel 4.0 Reliability Exposure & Failure-Family Readiness';
  const PANEL_ID='engineeringReliabilityReadiness';
  let selectedSource='';
  let lastSignature='';

  function esc(value){return S.esc?S.esc(String(value??'')):String(value??'');}
  function tasks(){return S.TaskCenter?.tasks?[...S.TaskCenter.tasks.values()]:[];}
  function sourceName(task){return String(task?.source||task?.kind||'Unspecified source').trim()||'Unspecified source';}
  function terminal(task){return task?.status!=='running'&&Number(task?.startedAt)>0&&Number(task?.completedAt)>0;}
  function runtime(task,now=Date.now()){
    const start=Number(task?.startedAt)||0;
    if(!(start>0))return null;
    const end=terminal(task)?Number(task.completedAt):now;
    return end>=start?end-start:null;
  }
  function sum(values){return values.filter(Number.isFinite).reduce((total,value)=>total+value,0);}
  function median(values){
    const rows=values.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!rows.length)return null;
    const mid=Math.floor(rows.length/2);
    return rows.length%2?rows[mid]:(rows[mid-1]+rows[mid])/2;
  }
  function duration(ms){
    if(!Number.isFinite(ms)||ms<0)return '—';
    const seconds=Math.round(ms/1000);
    if(seconds<60)return `${seconds}s`;
    const minutes=Math.floor(seconds/60),rest=seconds%60;
    if(minutes<60)return `${minutes}m ${rest}s`;
    const hours=Math.floor(minutes/60),mins=minutes%60;
    return `${hours}h ${mins}m`;
  }
  function pct(part,total){return total>0?part/total:null;}
  function fmtPct(value){return value==null?'—':`${(value*100).toFixed(1)}%`;}
  function sourceNames(){return [...new Set(tasks().map(sourceName))].sort((a,b)=>a.localeCompare(b));}
  function scopedRows(){return selectedSource?tasks().filter(task=>sourceName(task)===selectedSource):[];}

  function normalizeMessage(value){
    let text=String(value||'').trim().toLowerCase();
    if(!text)return 'No failure detail recorded';
    text=text.replace(/\/[^\s]+/g,'<path>');
    text=text.replace(/\b\d+(?:\.\d+)?\b/g,'#');
    text=text.replace(/\s+/g,' ');
    return text.slice(0,180);
  }

  function failureFamilies(rows){
    const families=new Map();
    for(const task of rows.filter(task=>task.status==='failed')){
      const signature=`${task.kind||'operation'} · ${normalizeMessage(task.detail)}`;
      const row=families.get(signature)||{signature,count:0,kind:task.kind||'operation',example:task.detail||'No failure detail recorded',durations:[]};
      row.count++;
      const d=runtime(task);
      if(Number.isFinite(d))row.durations.push(d);
      families.set(signature,row);
    }
    return [...families.values()].sort((a,b)=>b.count-a.count||a.signature.localeCompare(b.signature));
  }

  function summarize(rows=scopedRows()){
    const now=Date.now();
    const done=rows.filter(task=>task.status==='done');
    const failed=rows.filter(task=>task.status==='failed');
    const cancelled=rows.filter(task=>task.status==='cancelled');
    const running=rows.filter(task=>task.status==='running');
    const evaluable=[...done,...failed];
    const evaluableDurations=evaluable.map(task=>runtime(task,now)).filter(Number.isFinite);
    const cancelledDurations=cancelled.map(task=>runtime(task,now)).filter(Number.isFinite);
    const runningDurations=running.map(task=>runtime(task,now)).filter(Number.isFinite);
    const evaluableExposureMs=sum(evaluableDurations);
    const nonEvaluableExposureMs=sum(cancelledDurations)+sum(runningDurations);
    const failureShare=pct(failed.length,evaluable.length);
    const incidencePer100=failureShare==null?null:failureShare*100;
    const operationHours=evaluableExposureMs/3600000;
    const incidencePerTaskHour=operationHours>0?failed.length/operationHours:null;
    return {
      rows,done,failed,cancelled,running,evaluable,evaluableDurations,cancelledDurations,runningDurations,
      evaluableExposureMs,nonEvaluableExposureMs,failureShare,incidencePer100,incidencePerTaskHour,
      medianEvaluableRuntime:median(evaluableDurations),families:failureFamilies(rows),
    };
  }

  function metric(label,value,detail){return `<article class="err-metric"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(detail)}</small></article>`;}
  function status(label,state,detail){
    const cls=state==='observed'?'good':'unknown';
    return `<div class="err-status ${cls}"><span>${state==='observed'?'OBSERVED':'NOT ESTABLISHED'}</span><div><b>${esc(label)}</b><small>${esc(detail)}</small></div></div>`;
  }

  function familiesTable(rows){
    if(!rows.length)return '<div class="err-note"><b>No failed retained outcomes</b><p>No message-derived family can be formed in this selected source window. Lack of failures is not proof of high reliability.</p></div>';
    return `<div class="eo-table-wrap"><table class="eo-table"><thead><tr><th>Message-derived family</th><th>Count</th><th>Kind</th><th>Median failed runtime</th></tr></thead><tbody>${rows.slice(0,10).map(row=>`<tr><td><code>${esc(row.signature)}</code></td><td>${row.count}</td><td>${esc(row.kind)}</td><td>${duration(median(row.durations))}</td></tr>`).join('')}</tbody></table></div><div class="err-note warn"><b>FAMILY ≠ ROOT CAUSE</b><p>Families use normalized local Task Center detail text for review convenience. Similar text may have different causes, and different text may share one cause.</p></div>`;
  }

  function evidencePanel(d){
    const options=['<option value="">Choose one source / subsystem…</option>'].concat(sourceNames().map(name=>`<option value="${esc(name)}"${name===selectedSource?' selected':''}>${esc(name)}</option>`)).join('');
    return `<section class="err-section"><div class="err-title"><span>OPERATIONAL RELIABILITY EVIDENCE</span><h4>Normalize retained failures by explicit operation exposure</h4><p>Choose one source/subsystem. Sentinel treats Task Center records as operation outcomes, not as a population of physical components.</p></div><label class="err-field"><span>Process boundary</span><select data-err-source>${options}</select></label>${selectedSource?`<div class="err-grid">
      ${metric('Evaluable outcomes',String(d.evaluable.length),`${d.done.length} done + ${d.failed.length} failed`)}
      ${metric('Observed failure share',fmtPct(d.failureShare),'Failed / (done + failed); cancellation excluded')}
      ${metric('Failures / 100 evaluable ops',d.incidencePer100==null?'—':d.incidencePer100.toFixed(1),'Descriptive operation-outcome normalization, not population reliability')}
      ${metric('Evaluable operation-time',duration(d.evaluableExposureMs),'Sum of retained done+failed task runtimes; not system uptime')}
      ${metric('Failure incidences / task-hour',d.incidencePerTaskHour==null?'—':d.incidencePerTaskHour.toFixed(3),'Failures divided by summed evaluable operation-time; not hazard or ROCOF')}
      ${metric('Median evaluable runtime',duration(d.medianEvaluableRuntime),'Done+failed retained operations only')}
      ${metric('Cancelled / running',`${d.cancelled.length} / ${d.running.length}`,'Non-evaluable / open observations kept separate')}
      ${metric('Non-evaluable/open task-time',duration(d.nonEvaluableExposureMs),'Cancelled + currently running operation-time, reported separately')}
    </div>`:'<div class="err-note"><b>Process boundary required</b><p>Mixed Task Center sources are not treated as one reliability population or one repairable system.</p></div>'}</section>`;
  }

  function readinessPanel(d){
    if(!selectedSource)return '';
    return `<section class="err-section"><div class="err-title"><span>MODEL READINESS</span><h4>Reliability assumptions remain separate from outcome counts</h4></div><div class="err-status-grid">
      ${status('Explicit source/subsystem boundary','observed',selectedSource)}
      ${status('Evaluable terminal outcomes','observed',`${d.evaluable.length} done/failed retained operation(s)`)}
      ${status('Open / non-evaluable observations','observed',`${d.running.length} running; ${d.cancelled.length} cancelled`)}
      ${status('System uptime / power-on exposure','unknown','Task runtimes are operation-time exposure and may overlap; they are not system clock exposure.')}
      ${status('Repair events and restoration state','unknown','Task Center failure completion does not establish a repair, replacement, or restoration event.')}
      ${status('Homogeneous population / repeated unit definition','unknown','Retained tasks may represent different commands, inputs, and conditions even within one source.')}
      ${status('Independent censoring mechanism','unknown','Running/cancelled observations are kept separate; cancellation may be informative and is not assumed random.')}
      ${status('Constant ROCOF / exponential inter-failure model','unknown','No HPP assumption is inferred from retained task failures.')}
      ${status('Lifetime distribution','unknown','No Weibull, exponential, lognormal, or other lifetime model is fitted automatically.')}
    </div><div class="err-model-disabled"><b>MTBF / HAZARD / ROCOF STATUS: DISABLED</b><p>Sentinel does not calculate physical-component hazard rate, repairable-system ROCOF, MTBF, survival probability, or reliability growth from Task Center records alone.</p></div></section>`;
  }

  function render(){
    const d=summarize();
    return `<section id="${PANEL_ID}" class="err-panel" data-engineering-reliability-readiness="1"><div class="err-head"><div><span>QUALITY + RELIABILITY ENGINEERING</span><h3>Reliability Exposure & Failure-Family Readiness</h3><p>Normalize retained operational outcomes without pretending Task Center records are physical lifetime or repair-process data.</p></div><small>read-only · bounded · model-gated</small></div>${evidencePanel(d)}${selectedSource?`<section class="err-section"><div class="err-title"><span>FAILURE-FAMILY REVIEW</span><h4>Cluster repeated local error messages for investigation</h4><p>Message families help triage repeated symptoms. They do not establish engineering failure modes or root cause.</p></div>${familiesTable(d.families)}</section>`:''}${readinessPanel(d)}<div class="err-boundary"><b>NOT ESTABLISHED</b><p>No physical reliability, survival function, hazard rate, ROCOF, MTBF, lifetime distribution, reliability-growth trend, causal failure mode, or maintenance recommendation is inferred by this module.</p></div></section>`;
  }

  function signature(){
    const rows=tasks().map(task=>[task.id,task.status,task.source||'',task.kind||'',task.detail||'',Number(task.startedAt)||0,Number(task.completedAt)||0].join('~')).sort().join('|');
    return `${selectedSource}|${rows}`;
  }
  function ensure(){
    if(S.state?.lens!=='observatory')return;
    const parent=document.getElementById('engineeringOperationsBand');
    if(!parent)return;
    const sig=signature();
    const existing=document.getElementById(PANEL_ID);
    if(existing&&sig===lastSignature)return;
    const holder=document.createElement('div');
    holder.innerHTML=render();
    if(existing)existing.replaceWith(holder.firstElementChild);
    else parent.appendChild(holder.firstElementChild);
    lastSignature=sig;
  }
  function injectStyle(){
    if(document.querySelector('link[data-sentinel-engineering-reliability-readiness-style]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/app/engineering-reliability-readiness.css';
    link.dataset.sentinelEngineeringReliabilityReadinessStyle='1';
    document.head.appendChild(link);
  }

  document.addEventListener('change',event=>{
    const source=event.target.closest('[data-err-source]');
    if(!source)return;
    selectedSource=String(source.value||'');
    lastSignature='';
    ensure();
  });

  injectStyle();
  const observer=new MutationObserver(()=>ensure());
  observer.observe(document.getElementById('evidenceStage')||document.body,{childList:true,subtree:true});
  setInterval(ensure,2000);
  ensure();

  S.EngineeringReliabilityReadiness={marker:MARKER,summarize,failureFamilies,get source(){return selectedSource;}};
  window.__SENTINEL_ENGINEERING_RELIABILITY_READINESS__={marker:MARKER};
})();
