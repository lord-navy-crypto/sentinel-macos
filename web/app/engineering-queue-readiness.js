// SPDX-License-Identifier: MPL-2.0
// Sentinel 3.9 Queue & Capacity Model Readiness — bounded queueing evidence
// over retained Task Center records. No queue model is enabled from timing evidence alone.
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)return;

  const MARKER='Sentinel 3.9 Queue & Capacity Model Readiness';
  const PANEL_ID='engineeringQueueReadiness';
  let selectedSource='';
  let lastSignature='';

  function esc(value){return S.esc?S.esc(String(value??'')):String(value??'');}
  function tasks(){return S.TaskCenter?.tasks?[...S.TaskCenter.tasks.values()]:[];}
  function sourceName(task){return String(task?.source||task?.kind||'Unspecified source').trim()||'Unspecified source';}
  function terminal(task){return task?.status!=='running'&&Number(task?.startedAt)>0&&Number(task?.completedAt)>0;}
  function mean(values){
    const rows=values.filter(Number.isFinite);
    if(!rows.length)return null;
    return rows.reduce((sum,v)=>sum+v,0)/rows.length;
  }
  function median(values){
    const rows=values.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!rows.length)return null;
    const mid=Math.floor(rows.length/2);
    return rows.length%2?rows[mid]:(rows[mid-1]+rows[mid])/2;
  }
  function stddev(values){
    const rows=values.filter(Number.isFinite);
    if(rows.length<2)return null;
    const avg=mean(rows);
    return Math.sqrt(rows.reduce((sum,v)=>sum+(v-avg)*(v-avg),0)/(rows.length-1));
  }
  function cv(values){
    const avg=mean(values),sd=stddev(values);
    return avg&&sd!=null?sd/avg:null;
  }
  function duration(ms){
    if(!Number.isFinite(ms)||ms<0)return '—';
    const seconds=Math.round(ms/1000);
    if(seconds<60)return `${seconds}s`;
    return `${Math.floor(seconds/60)}m ${seconds%60}s`;
  }
  function ratePerMin(count,spanMs){return spanMs>0?count/(spanMs/60000):null;}
  function fmtRate(value){return value==null?'—':`${value.toFixed(2)}/min`;}
  function fmtCv(value){return value==null?'—':value.toFixed(2);}

  function sourceNames(){return [...new Set(tasks().map(sourceName))].sort((a,b)=>a.localeCompare(b));}
  function scopedRows(){return selectedSource?tasks().filter(task=>sourceName(task)===selectedSource):[];}

  function concurrencyStats(rows){
    if(!rows.length)return {max:0,timeAverage:null,span:0,start:0,end:0,censored:false};
    const now=Date.now();
    const start=Math.min(...rows.map(task=>Number(task.startedAt)||now));
    const end=Math.max(...rows.map(task=>terminal(task)?Number(task.completedAt):now));
    const span=Math.max(0,end-start);
    const events=[];
    let censored=false;
    for(const task of rows){
      const s=Number(task.startedAt);
      if(!(s>0))continue;
      let e;
      if(terminal(task))e=Number(task.completedAt);
      else{e=now;censored=true;}
      events.push([s,1],[e,-1]);
    }
    events.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    let current=0,max=0,last=start,area=0;
    for(const [time,delta] of events){
      const t=Math.max(start,Math.min(end,time));
      if(t>last)area+=current*(t-last);
      current+=delta;
      max=Math.max(max,current);
      last=t;
    }
    if(end>last)area+=current*(end-last);
    return {max,timeAverage:span>0?area/span:null,span,start,end,censored};
  }

  function summarize(){
    const rows=scopedRows().filter(task=>Number(task.startedAt)>0).sort((a,b)=>Number(a.startedAt)-Number(b.startedAt));
    const starts=rows.map(task=>Number(task.startedAt));
    const interarrival=[];
    for(let i=1;i<starts.length;i++)if(starts[i]>=starts[i-1])interarrival.push(starts[i]-starts[i-1]);
    const terminalRows=rows.filter(terminal);
    const service=terminalRows.map(task=>Number(task.completedAt)-Number(task.startedAt)).filter(ms=>ms>=0);
    const conc=concurrencyStats(rows);
    const arrivals=rows.length;
    const completions=terminalRows.length;
    const arrivalRate=ratePerMin(arrivals,conc.span);
    const completionRate=ratePerMin(completions,conc.span);
    const meanCycle=mean(service);
    const finiteAccounting=!conc.censored&&arrivals>0&&arrivals===completions&&conc.span>0&&meanCycle!=null;
    const lambdaPerMs=finiteAccounting?arrivals/conc.span:null;
    const littleProduct=finiteAccounting?lambdaPerMs*meanCycle:null;
    const residual=finiteAccounting&&conc.timeAverage!=null?conc.timeAverage-littleProduct:null;
    return {
      rows,arrivals,completions,interarrival,service,arrivalRate,completionRate,meanCycle,
      medianCycle:median(service),interarrivalMean:mean(interarrival),interarrivalCv:cv(interarrival),serviceCv:cv(service),
      concurrency:conc,finiteAccounting,littleProduct,residual,
    };
  }

  function metric(label,value,detail){return `<article class="eqr-metric"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(detail)}</small></article>`;}
  function assumption(label,state,detail){
    const cls=state==='observed'?'good':state==='declared'?'note':'unknown';
    const text=state==='observed'?'OBSERVED':state==='declared'?'DECLARED':'NOT ESTABLISHED';
    return `<div class="eqr-assumption ${cls}"><span>${text}</span><div><b>${esc(label)}</b><small>${esc(detail)}</small></div></div>`;
  }

  function evidencePanel(d){
    const options=['<option value="">Choose one source / subsystem…</option>'].concat(sourceNames().map(name=>`<option value="${esc(name)}"${name===selectedSource?' selected':''}>${esc(name)}</option>`)).join('');
    return `<section class="eqr-section"><div class="eqr-title"><span>QUEUEING EVIDENCE</span><h4>Arrival, service and concurrency observations</h4><p>Choose one source/subsystem before interpreting timing as one process.</p></div><label class="eqr-field"><span>Process boundary</span><select data-eqr-source>${options}</select></label>${selectedSource?`<div class="eqr-grid">
      ${metric('Retained arrivals',String(d.arrivals),`${d.interarrival.length} interarrival interval(s)`)}
      ${metric('Terminal completions',String(d.completions),`${d.arrivals-d.completions} currently non-terminal/censored row(s)`)}
      ${metric('Observed arrival rate',fmtRate(d.arrivalRate),'Finite retained window; not a stationary-rate estimate')}
      ${metric('Observed completion rate',fmtRate(d.completionRate),'Finite retained window; not service capacity')}
      ${metric('Median cycle / service',duration(d.medianCycle),`${d.service.length} terminal observation(s)`)}
      ${metric('Max concurrency observed',String(d.concurrency.max),'Observed overlap, not a server-count measurement')}
      ${metric('Interarrival CV',fmtCv(d.interarrivalCv),'Descriptive variability only; Poisson arrivals are not inferred')}
      ${metric('Service-time CV',fmtCv(d.serviceCv),'Descriptive variability only; exponential service is not inferred')}
    </div>`:'<div class="eqr-note"><b>Process boundary required</b><p>Mixed Task Center sources are not treated as one queue.</p></div>'}</section>`;
  }

  function littlePanel(d){
    if(!selectedSource)return '';
    if(!d.finiteAccounting){
      return `<section class="eqr-section"><div class="eqr-title"><span>LITTLE’S LAW READINESS</span><h4>Finite-window accounting unavailable</h4></div><div class="eqr-note warn"><b>ACCOUNTING DIAGNOSTIC DISABLED</b><p>The selected retained window contains non-terminal/censored work, missing balance, or no measurable span. Sentinel does not substitute partial data into L = λW.</p></div><div class="eqr-note"><b>STABILITY NOT ESTABLISHED</b><p>Even a complete finite-window accounting check would not prove the long-run stability condition required for Little’s Law interpretation.</p></div></section>`;
    }
    return `<section class="eqr-section"><div class="eqr-title"><span>LITTLE’S LAW READINESS</span><h4>Finite-window accounting consistency</h4><p>This is an accounting diagnostic over a complete retained window, not a proof of steady state.</p></div><div class="eqr-grid">
      ${metric('Time-average WIP L',d.concurrency.timeAverage==null?'—':d.concurrency.timeAverage.toFixed(3),'Computed from retained task overlap area / observed span')}
      ${metric('λ × W',d.littleProduct==null?'—':d.littleProduct.toFixed(3),'Finite arrivals/span × mean terminal cycle time')}
      ${metric('Accounting residual',d.residual==null?'—':d.residual.toExponential(2),'Expected near zero for this closed finite retained window by construction')}
      ${metric('Observed span',duration(d.concurrency.span),'Finite observation window only')}
    </div><div class="eqr-note warn"><b>STABILITY STILL NOT ESTABLISHED</b><p>The diagnostic does not establish a stable long-run queue, stationary arrival/service rates, or validity of a particular stochastic queueing model.</p></div></section>`;
  }

  function assumptionPanel(d){
    if(!selectedSource)return '';
    return `<section class="eqr-section"><div class="eqr-title"><span>ASSUMPTION LEDGER</span><h4>What the evidence does and does not support</h4></div><div class="eqr-assumptions">
      ${assumption('Explicit source/subsystem boundary','observed',selectedSource)}
      ${assumption('Arrival timestamps','observed',`${d.arrivals} retained start event(s); ${d.interarrival.length} interarrival interval(s)`)}
      ${assumption('Terminal service/cycle times','observed',`${d.service.length} terminal duration observation(s)`)}
      ${assumption('Observed concurrency','observed',`Maximum overlap ${d.concurrency.max}; this is not server count`)}
      ${assumption('Server count','unknown','Task Center overlap does not reveal the number of independent service channels.')}
      ${assumption('Queue discipline','unknown','FCFS/FIFO, priority, processor sharing, and other disciplines are not inferred.')}
      ${assumption('Stationary arrival/service process','unknown','A bounded retained window does not establish time-invariant rates.')}
      ${assumption('Poisson arrivals','unknown','Interarrival variability alone does not establish a Poisson process.')}
      ${assumption('Exponential service times','unknown','Service-time variability alone does not establish an exponential distribution.')}
      ${assumption('Queue stability','unknown','No long-run bounded-queue condition is established from retained Task Center history.')}
    </div><div class="eqr-model-disabled"><b>M/M/1 STATUS: DISABLED</b><p>Single-server, Poisson-arrival, exponential-service and stability assumptions are not established. Sentinel therefore does not compute M/M/1 utilization, waiting-time, queue-length, or capacity conclusions.</p></div></section>`;
  }

  function render(){
    const d=summarize();
    return `<section id="${PANEL_ID}" class="eqr-panel" data-engineering-queue-readiness="1"><div class="eqr-head"><div><span>QUEUE + CAPACITY ENGINEERING</span><h3>Queue / Capacity Model Readiness</h3><p>Separate observed flow evidence from stochastic-model assumptions before using queueing formulas or capacity recommendations.</p></div><small>read-only · bounded · model-gated</small></div>${evidencePanel(d)}${littlePanel(d)}${assumptionPanel(d)}<div class="eqr-boundary"><b>NOT ESTABLISHED</b><p>No service capacity, utilization optimum, safe concurrency limit, waiting-time prediction, queue stability, or optimization recommendation is inferred by this module.</p></div></section>`;
  }

  function signature(){
    const rows=tasks().map(task=>[task.id,task.status,task.source||'',task.kind||'',Number(task.startedAt)||0,Number(task.completedAt)||0].join('~')).sort().join('|');
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
    if(document.querySelector('link[data-sentinel-engineering-queue-readiness-style]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/app/engineering-queue-readiness.css';
    link.dataset.sentinelEngineeringQueueReadinessStyle='1';
    document.head.appendChild(link);
  }

  document.addEventListener('change',event=>{
    const source=event.target.closest('[data-eqr-source]');
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

  S.EngineeringQueueReadiness={marker:MARKER,summarize,get source(){return selectedSource;}};
  window.__SENTINEL_ENGINEERING_QUEUE_READINESS__={marker:MARKER};
})();
