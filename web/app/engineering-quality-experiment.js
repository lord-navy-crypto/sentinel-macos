// SPDX-License-Identifier: MPL-2.0
// Sentinel 3.8 Engineering Quality & Experiment Readiness — bounded SPC structure
// checks and in-memory single-factor comparative DOE planning. No automatic execution.
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)return;

  const MARKER='Sentinel 3.8 Engineering Quality & Experiment Readiness';
  const PANEL_ID='engineeringQualityExperiment';
  const MAX_LEVELS=8;
  const MAX_REPLICATES=10;
  let selectedSource='';
  let experimentPlan=null;
  let lastSignature='';
  let draft={
    factor:'',
    levels:'',
    response:'Terminal cycle time',
    replicates:3,
    randomize:true,
    constraints:'',
  };

  function esc(value){return S.esc?S.esc(String(value??'')):String(value??'');}
  function tasks(){return S.TaskCenter?.tasks?[...S.TaskCenter.tasks.values()]:[];}
  function baselineApi(){return S.EngineeringOperationsBaseline||null;}
  function sourceName(task){return String(task?.source||task?.kind||'Unspecified source').trim()||'Unspecified source';}
  function terminal(task){return task?.status!=='running'&&Number(task?.startedAt)>0&&Number(task?.completedAt)>0;}
  function cycle(task){return terminal(task)?Number(task.completedAt)-Number(task.startedAt):null;}
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
    return `${Math.floor(seconds/60)}m ${seconds%60}s`;
  }
  function baselineRows(){
    const api=baselineApi(),base=api?.baseline;
    if(!base)return [];
    return tasks().filter(task=>base.retainedTaskIds?.has(task.id));
  }
  function afterRows(){return baselineApi()?.afterRows?.()||[];}
  function sourceNames(){
    const base=baselineApi()?.baseline;
    if(!base)return [];
    const names=new Set((base.reference?.sources||[]).map(row=>row[0]));
    for(const task of afterRows())names.add(sourceName(task));
    return [...names].sort((a,b)=>a.localeCompare(b));
  }
  function sourceCapturedCount(name){
    const rows=baselineApi()?.baseline?.reference?.sources||[];
    return Number((rows.find(row=>row[0]===name)||[])[1]||0);
  }
  function phaseEvidence(rows,source){
    const scoped=source?rows.filter(task=>sourceName(task)===source):[];
    const terminalRows=scoped.filter(terminal).sort((a,b)=>Number(a.completedAt)-Number(b.completedAt));
    const cycles=terminalRows.map(cycle).filter(Number.isFinite);
    return {total:scoped.length,terminal:terminalRows.length,medianCycle:median(cycles),terminalRows,cycles};
  }

  function spcStructure(){
    const api=baselineApi(),base=api?.baseline;
    if(!base)return {hasBaseline:false,names:[],source:'',reference:null,after:null,capturedSourceCount:0};
    const names=sourceNames();
    if(selectedSource&&!names.includes(selectedSource))selectedSource='';
    const source=selectedSource;
    const reference=phaseEvidence(baselineRows(),source);
    const after=phaseEvidence(afterRows(),source);
    return {
      hasBaseline:true,
      names,
      source,
      reference,
      after,
      capturedSourceCount:source?sourceCapturedCount(source):0,
    };
  }

  function check(label,ok,detail,unknown=false){
    const cls=unknown?'unknown':ok?'good':'wait';
    const state=unknown?'NOT ESTABLISHED':ok?'EVIDENCE PRESENT':'WAITING';
    return `<div class="eqe-check ${cls}"><span>${esc(state)}</span><div><b>${esc(label)}</b><small>${esc(detail)}</small></div></div>`;
  }

  function spcPanel(){
    const d=spcStructure();
    if(!d.hasBaseline){
      return `<section class="eqe-section"><div class="eqe-title"><span>SPC STRUCTURE CHECK</span><h4>Define a comparable process before control limits</h4></div><div class="eqe-note"><b>Phase boundary required</b><p>Capture an Engineering Operations baseline first. Sentinel will not generate UCL/LCL or call a process statistically controlled without a deliberately defined reference process.</p></div></section>`;
    }
    const options=['<option value="">Choose one source / subsystem…</option>'].concat(d.names.map(name=>`<option value="${esc(name)}"${name===d.source?' selected':''}>${esc(name)}</option>`)).join('');
    const sourceDefined=Boolean(d.source);
    const both=sourceDefined&&d.reference.total>0&&d.after.total>0;
    const response=sourceDefined&&d.reference.terminal>0&&d.after.terminal>0;
    const fullReference=sourceDefined&&d.capturedSourceCount>0&&d.reference.total===d.capturedSourceCount;
    return `<section class="eqe-section">
      <div class="eqe-title"><span>SPC STRUCTURE CHECK</span><h4>Comparable-process evidence before control limits</h4><p>Select one source/subsystem as the process boundary. Initial quality characteristic: terminal cycle time.</p></div>
      <label class="eqe-field"><span>Process boundary</span><select data-eqe-source>${options}</select></label>
      <div class="eqe-checks">
        ${check('Reference phase exists',true,`Captured ${new Date(baselineApi().baseline.capturedAt).toLocaleString()}`)}
        ${check('Explicit subsystem/process boundary',sourceDefined,sourceDefined?d.source:'Choose one source; mixed-source history is not treated as one process.')}
        ${check('Comparable source observed in both phases',both,sourceDefined?`Reference raw rows ${d.reference.total}; after rows ${d.after.total}`:'Waiting for source selection.')}
        ${check('Cycle-time response observed in both phases',response,sourceDefined?`Reference terminal n=${d.reference.terminal}; after terminal n=${d.after.terminal}`:'Waiting for source selection.')}
        ${check('Reference raw-row coverage',fullReference,sourceDefined?`${d.reference.total} of ${d.capturedSourceCount} captured source row(s) still retained for row-level analysis.`:'Waiting for source selection.')}
        ${check('Independence / single stable distribution',false,'Task Center timing alone does not establish independence, identical conditions, or a single underlying distribution.',true)}
      </div>
      ${sourceDefined?`<div class="eo-table-wrap"><table class="eo-table"><thead><tr><th>Phase</th><th>Rows visible</th><th>Terminal cycle n</th><th>Median cycle</th></tr></thead><tbody><tr><td>Reference</td><td>${d.reference.total} / ${d.capturedSourceCount} captured</td><td>${d.reference.terminal}</td><td>${duration(d.reference.medianCycle)}</td></tr><tr><td>After</td><td>${d.after.total}</td><td>${d.after.terminal}</td><td>${duration(d.after.medianCycle)}</td></tr></tbody></table></div>`:''}
      <div class="eqe-note warn"><b>CONTROL CHART STATUS: DISABLED</b><p>No Shewhart, CUSUM, EWMA, UCL, LCL, common-cause, or special-cause conclusion is generated here. This layer checks structure and evidence availability only.</p></div>
    </section>`;
  }

  function randomIndex(max){
    if(!(globalThis.crypto&&typeof globalThis.crypto.getRandomValues==='function'))throw new Error('Cryptographic randomization is unavailable in this runtime.');
    const limit=Math.floor(0x100000000/max)*max;
    const buffer=new Uint32Array(1);
    let value;
    do{globalThis.crypto.getRandomValues(buffer);value=buffer[0];}while(value>=limit);
    return value%max;
  }
  function shuffle(rows){
    const out=[...rows];
    for(let i=out.length-1;i>0;i--){const j=randomIndex(i+1);[out[i],out[j]]=[out[j],out[i]];}
    return out;
  }
  function parseLevels(text){
    const levels=String(text||'').split(/[\n,]/).map(x=>x.trim()).filter(Boolean);
    return [...new Set(levels)];
  }
  function buildPlan(){
    const factor=draft.factor.trim();
    const levels=parseLevels(draft.levels);
    const response=draft.response.trim();
    const replicates=Math.max(2,Math.min(MAX_REPLICATES,Number(draft.replicates)||0));
    if(!factor)throw new Error('Name the experimental factor.');
    if(levels.length<2)throw new Error('Provide at least two distinct factor levels.');
    if(levels.length>MAX_LEVELS)throw new Error(`Use no more than ${MAX_LEVELS} levels in this bounded planner.`);
    if(!response)throw new Error('Name the response variable.');
    if(Number(draft.replicates)<2||Number(draft.replicates)>MAX_REPLICATES)throw new Error(`Replication target must be between 2 and ${MAX_REPLICATES}.`);
    let schedule=[];
    for(let rep=1;rep<=replicates;rep++)for(const level of levels)schedule.push({level,replicate:rep});
    if(draft.randomize)schedule=shuffle(schedule);
    schedule=schedule.map((row,index)=>({...row,run:index+1}));
    experimentPlan={createdAt:Date.now(),objective:'Comparative',factor,levels,response,replicates,randomized:Boolean(draft.randomize),constraints:draft.constraints.trim(),schedule};
  }
  function clearPlan(){experimentPlan=null;lastSignature='';ensure();}

  function planTable(){
    if(!experimentPlan)return '';
    return `<div class="eqe-plan"><div class="eqe-plan-head"><div><b>${esc(experimentPlan.factor)}</b><span>${experimentPlan.levels.length} levels × ${experimentPlan.replicates} replications = ${experimentPlan.schedule.length} planned runs</span></div><button type="button" class="s24-action" data-eqe-clear-plan>Clear plan</button></div><div class="eo-table-wrap"><table class="eo-table"><thead><tr><th>Run</th><th>${esc(experimentPlan.factor)} level</th><th>Replication</th><th>Response</th></tr></thead><tbody>${experimentPlan.schedule.map(row=>`<tr><td>${row.run}</td><td>${esc(row.level)}</td><td>${row.replicate}</td><td>${esc(experimentPlan.response)} · not recorded</td></tr>`).join('')}</tbody></table></div><div class="eqe-note"><b>RUN ORDER</b><p>${experimentPlan.randomized?'Randomized in-memory before display.':'Kept in entered level order; lack of randomization may allow run-order effects to confound interpretation.'}${experimentPlan.constraints?` Constraints noted: ${esc(experimentPlan.constraints)}`:''}</p></div></div>`;
  }

  function doePanel(){
    return `<section class="eqe-section">
      <div class="eqe-title"><span>DOE FOUNDATION</span><h4>Single-factor comparative experiment plan</h4><p>This planner defines factor levels, replication, response, constraints, and run order. It never changes Mac settings or starts the experiment automatically.</p></div>
      <form class="eqe-form" data-eqe-plan-form>
        <label class="eqe-field"><span>Objective</span><input value="Comparative" disabled></label>
        <label class="eqe-field"><span>Factor</span><input name="factor" value="${esc(draft.factor)}" placeholder="e.g. concurrency limit"></label>
        <label class="eqe-field wide"><span>Levels</span><input name="levels" value="${esc(draft.levels)}" placeholder="e.g. 2, 4, 6"></label>
        <label class="eqe-field"><span>Response</span><input name="response" value="${esc(draft.response)}" placeholder="e.g. terminal cycle time"></label>
        <label class="eqe-field"><span>Replications / level</span><input name="replicates" type="number" min="2" max="${MAX_REPLICATES}" value="${Number(draft.replicates)||3}"></label>
        <label class="eqe-field wide"><span>Constraints / nuisance conditions</span><input name="constraints" value="${esc(draft.constraints)}" placeholder="What must be held fixed or cannot be randomized?"></label>
        <label class="eqe-checkline"><input name="randomize" type="checkbox"${draft.randomize?' checked':''}><span>Randomize run order</span></label>
        <button type="submit" class="s24-action primary">Generate bounded run plan</button>
      </form>
      <div class="eqe-note"><b>EXPERIMENT BOUNDARY</b><p>Replication helps expose repeat variability; randomization protects against run-order effects. This planner does not claim significance, causality, or an optimum until actual response data and an appropriate analysis exist.</p></div>
      ${planTable()}
    </section>`;
  }

  function render(){
    return `<section id="${PANEL_ID}" class="eqe-panel" data-engineering-quality-experiment="1"><div class="eqe-head"><div><span>QUALITY + EXPERIMENT ENGINEERING</span><h3>Model readiness before statistical control or optimization</h3><p>Turn retained operational evidence into a defensible process definition and experiment plan before using stronger statistical claims.</p></div><small>local · in-memory · plan-only</small></div>${spcPanel()}${doePanel()}<div class="eqe-boundary"><b>NOT ESTABLISHED</b><p>No control limits, process capability, statistical significance, causal effect, queueing steady state, or optimization recommendation is inferred by this module.</p></div></section>`;
  }

  function signature(){
    const base=baselineApi()?.baseline;
    const after=afterRows().map(task=>[task.id,task.status,task.source||'',task.kind||'',Number(task.startedAt)||0,Number(task.completedAt)||0].join('~')).sort().join('|');
    const plan=experimentPlan?experimentPlan.schedule.map(row=>`${row.run}:${row.level}:${row.replicate}`).join('|'):'';
    return `${base?.capturedAt||0}|${selectedSource}|${after}|${plan}|${draft.factor}|${draft.levels}|${draft.response}|${draft.replicates}|${draft.randomize}|${draft.constraints}`;
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
    if(document.querySelector('link[data-sentinel-engineering-quality-experiment-style]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/app/engineering-quality-experiment.css';
    link.dataset.sentinelEngineeringQualityExperimentStyle='1';
    document.head.appendChild(link);
  }

  document.addEventListener('change',event=>{
    const source=event.target.closest('[data-eqe-source]');
    if(source){selectedSource=String(source.value||'');lastSignature='';ensure();return;}
    const form=event.target.closest('[data-eqe-plan-form]');
    if(form){const fd=new FormData(form);draft={factor:String(fd.get('factor')||''),levels:String(fd.get('levels')||''),response:String(fd.get('response')||''),replicates:Number(fd.get('replicates')||3),randomize:Boolean(fd.get('randomize')),constraints:String(fd.get('constraints')||'')};}
  });
  document.addEventListener('input',event=>{
    const form=event.target.closest('[data-eqe-plan-form]');
    if(!form)return;
    const fd=new FormData(form);
    draft={factor:String(fd.get('factor')||''),levels:String(fd.get('levels')||''),response:String(fd.get('response')||''),replicates:Number(fd.get('replicates')||3),randomize:Boolean(fd.get('randomize')),constraints:String(fd.get('constraints')||'')};
  });
  document.addEventListener('submit',event=>{
    const form=event.target.closest('[data-eqe-plan-form]');
    if(!form)return;
    event.preventDefault();
    const fd=new FormData(form);
    draft={factor:String(fd.get('factor')||''),levels:String(fd.get('levels')||''),response:String(fd.get('response')||''),replicates:Number(fd.get('replicates')||3),randomize:Boolean(fd.get('randomize')),constraints:String(fd.get('constraints')||'')};
    try{buildPlan();lastSignature='';ensure();S.notice?.(`DOE plan generated: ${experimentPlan.schedule.length} planned run(s).`);}catch(error){S.notice?.(error?.message||String(error));}
  });
  document.addEventListener('click',event=>{if(event.target.closest('[data-eqe-clear-plan]')){event.preventDefault();clearPlan();}});

  injectStyle();
  const observer=new MutationObserver(()=>ensure());
  observer.observe(document.getElementById('evidenceStage')||document.body,{childList:true,subtree:true});
  setInterval(ensure,2000);
  ensure();

  S.EngineeringQualityExperiment={marker:MARKER,spcStructure,buildPlan,get plan(){return experimentPlan;}};
  window.__SENTINEL_ENGINEERING_QUALITY_EXPERIMENT__={marker:MARKER};
})();
