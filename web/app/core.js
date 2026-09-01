// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';

  const PRODUCT_MARKER = 'Sentinel 2.7 Native Frontend';
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    mission: 'orient',
    lens: 'status',
    scanJob: '',
    scanTimer: null,
    actionPreview: null,
    searchTimer: null,
    processRows: [],
    currentGraph: null,
  };

  const MISSIONS = [
    {id:'orient',mark:'●',label:'Orient',hint:'What matters?',lenses:['status','snapshot']},
    {id:'investigate',mark:'⌁',label:'Investigate',hint:'Build an explanation',lenses:['cases','search','relations','audit','object']},
    {id:'compare',mark:'Δ',label:'Compare',hint:'What changed?',lenses:['changes','behavior','reference']},
    {id:'system',mark:'▦',label:'System',hint:'Everyday Mac + evidence / 日常状态与证据',lenses:['machine','health','tools','processes','startup','persistence','background','network','storage']},
    {id:'act',mark:'↺',label:'Act',hint:'Reversible only',lenses:['reclaim','change']},
    {id:'limits',mark:'?',label:'Limits',hint:'What can be known?',lenses:['visibility','guide']},
  ];

  const LENSES = {
    status:{label:'Status',verb:'ORIENT',title:'What deserves attention now?',rule:'Read current state before interpreting isolated signals.'},
    snapshot:{label:'Snapshot',verb:'OBSERVE',title:'What should I inspect next?',rule:'One bounded read-only observation should produce a review queue, not a verdict.'},
    cases:{label:'Cases',verb:'CORRELATE',title:'Which observations belong together?',rule:'Use relationship strength and time to compress evidence into cases.'},
    search:{label:'Search',verb:'QUERY',title:'What exact object am I trying to understand?',rule:'Search known evidence first, then broaden scope deliberately.'},
    relations:{label:'Relations',verb:'CONNECT',title:'How are the objects connected?',rule:'Read edges together with object identity and time; an edge alone is not causality.'},
    audit:{label:'Audit',verb:'ASSESS',title:'Which evidence deserves review, and why?',rule:'Priority is an attention ranking, never malware probability.'},
    object:{label:'Object',verb:'VERIFY',title:'What can I establish about one exact path?',rule:'Identity evidence comes before interpretation.'},
    changes:{label:'Changes',verb:'WATCH',title:'What changed inside the scope I chose?',rule:'A bounded watch is better than pretending to observe the whole machine.'},
    behavior:{label:'Behavior',verb:'COMPARE',title:'What differs from the previous observation?',rule:'Difference is evidence pressure, not danger.'},
    reference:{label:'Reference',verb:'REFERENCE',title:'What differs from my approved reference?',rule:'Reference membership is context, not a permanent safety certificate.'},
    machine:{label:'Machine',verb:'CONTEXT',title:'What machine is producing this evidence?',rule:'Hardware and runtime explain capability and compatibility.'},
    health:{label:'Everyday Mac / 日常 Mac',verb:'OBSERVE',title:'How are resources, memory pressure, power and network activity changing?',rule:'Use bounded current samples and trends to explain load. Resource pressure is evidence, not a hardware-health certificate. / 使用有界样本和趋势解释负载，不输出硬件健康证书。'},
    tools:{label:'Terminal Tools / 终端工具',verb:'TOOLS',title:'Which macOS command-line capability do I need without memorising Terminal syntax?',rule:'Only allowlisted, typed, bounded tools are exposed. No arbitrary shell / 仅开放白名单、类型化、有边界的工具，不提供任意 shell。'},
    processes:{label:'Processes',verb:'LIVE',title:'What is running right now?',rule:'Treat a process as an identity connected to an executable and current activity.'},
    startup:{label:'Auto-start',verb:'DECLARE',title:'What is configured to launch automatically?',rule:'Persistence is common in legitimate software; configuration needs context.'},
    persistence:{label:'Persistence',verb:'COMPARE',title:'Did launch configuration change?',rule:'This compares bounded captures; it is not continuous surveillance.'},
    background:{label:'Background',verb:'REGISTER',title:'What background registrations exist?',rule:'Modern registrations complement classic LaunchAgent and LaunchDaemon evidence.'},
    network:{label:'Network',verb:'LIVE',title:'Which processes have TCP activity now?',rule:'A public endpoint is ordinary context, not suspicion by itself.'},
    storage:{label:'Storage',verb:'MEASURE',title:'Where is storage pressure coming from?',rule:'Measure first. Exact duplicates and filename heuristics must remain separate.'},
    reclaim:{label:'Reclaim',verb:'REVIEW',title:'What space is worth reviewing?',rule:'Estimate first. Nothing is deleted automatically.'},
    change:{label:'Safe Change',verb:'RESOLVE',title:'What is the smallest reversible change supported by evidence?',rule:'Preview impact, confirm explicitly, preserve recovery.'},
    visibility:{label:'Visibility',verb:'BOUND',title:'What can Sentinel actually see?',rule:'Missing visibility lowers confidence; it must never be converted into invented evidence.'},
    guide:{label:'Model',verb:'MODEL',title:'How should I use Sentinel?',rule:'Observe → connect → compare → verify → change only when evidence supports it.'},
  };

  const renderers = Object.create(null);
  const operations = Object.create(null);

  function esc(value){return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function bytes(value){let n=Number(value||0);if(!Number.isFinite(n)||n<=0)return '0 B';const units=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<units.length-1){n/=1024;i++;}return `${n.toFixed(n>=10||i===0?1:2)} ${units[i]}`;}
  function pct(a,b){return Number(b)>0?Math.round(Number(a||0)/Number(b)*100):0;}
  function fmt(value){if(!value)return '—';const d=typeof value==='number'?new Date(value*1000):new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString();}
  function sev(value){const v=String(value||'').toLowerCase();return v==='high'||v==='critical'||v==='elevated'?'bad':v==='review'||v==='warn'||v==='warning'?'warn':v==='good'||v==='healthy'||v==='ready'?'good':'focus';}
  function badge(text,cls=''){return `<span class="s24-badge ${cls}">${esc(text)}</span>`;}
  function notice(message){const node=$('#systemNotice');if(!node)return;node.textContent=message||'';node.hidden=!message;if(message)setTimeout(()=>{if(node.textContent===message)node.hidden=true;},7000);}
  function activity(label='Ready',percent=0,detail='Local engine · no cloud dependency'){const stateNode=$('#activityState'),progress=$('#activityProgress'),detailNode=$('#activityDetail');if(stateNode)stateNode.textContent=label;if(progress)progress.value=Math.max(0,Math.min(100,Number(percent||0)));if(detailNode)detailNode.textContent=detail;}
  function busy(label,detail='Working locally…'){activity(label,8,detail);}

  async function api(url,options={}){
    const headers={...(options.headers||{}),'X-Sentinel-Token':token};
    const response=await fetch(url,{...options,headers});
    const type=response.headers.get('content-type')||'';
    const data=type.includes('application/json')?await response.json().catch(()=>({error:`HTTP ${response.status}`})):null;
    if(!response.ok){
      const error=new Error(data?.error||`HTTP ${response.status}`);
      error.status=response.status;error.payload=data;error.url=url;
      throw error;
    }
    return data;
  }

  async function download(url,name){
    const response=await fetch(url,{headers:{'X-Sentinel-Token':token}});
    if(!response.ok){let message=`HTTP ${response.status}`;try{message=(await response.json()).error||message}catch{}throw new Error(message);}
    const blob=await response.blob();
    const href=URL.createObjectURL(blob);
    const anchor=document.createElement('a');anchor.href=href;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(href),1200);
  }

  function missionForLens(lens){return MISSIONS.find(m=>m.lenses.includes(lens))?.id||'orient';}
  function renderNavigation(){
    $('#missionRibbon').innerHTML=MISSIONS.map(m=>`<button class="s24-mission ${m.id===state.mission?'active':''}" type="button" data-mission="${m.id}"><span class="mark">${m.mark}</span><b>${m.label}</b><small>${m.hint}</small></button>`).join('');
    const mission=MISSIONS.find(m=>m.id===state.mission)||MISSIONS[0];
    $('#lensRail').innerHTML=mission.lenses.map(id=>`<button class="s24-lens ${id===state.lens?'active':''}" type="button" data-lens="${id}">${esc(LENSES[id].label)}</button>`).join('');
  }
  function question(extra=''){const lens=LENSES[state.lens];return `<section class="s24-question"><span class="verb">${esc(lens.verb)}</span><h1>${esc(lens.title)}</h1><p>${esc(lens.rule)}</p>${extra?`<div class="question-actions">${extra}</div>`:''}</section>`;}
  function band(index,title,body,description='',tools=''){return `<section class="s24-band"><div class="s24-band-index">${String(index).padStart(2,'0')}</div><div class="s24-band-body"><div class="s24-band-head"><div><h2>${esc(title)}</h2>${description?`<p>${esc(description)}</p>`:''}</div>${tools?`<div class="s24-band-tools">${tools}</div>`:''}</div>${body}</div></section>`;}
  function empty(text){return `<div class="s24-empty">${esc(text)}</div>`;}
  function ledger(rows){return `<div class="s24-ledger">${rows.map(([k,v,m=''])=>`<div class="s24-ledger-row"><span>${esc(k)}</span><b>${esc(v??'—')}</b><small>${esc(m)}</small></div>`).join('')}</div>`;}
  function table(headers,rows){return `<div class="s24-table-wrap"><table class="s24-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
  function primitiveRows(obj,limit=18){return Object.entries(obj||{}).filter(([,v])=>['string','number','boolean'].includes(typeof v)).slice(0,limit).map(([k,v])=>[k.replaceAll('_',' '),String(v)]);}
  function jsonContext(title,data,can='Observed local evidence from the selected Sentinel source.',cannot='Intent or safety beyond what the evidence establishes.'){$('#contextTitle').textContent=title;$('#contextBody').innerHTML=`<section class="s24-context-section"><h3>Can establish</h3><p>${esc(can)}</p></section><section class="s24-context-section"><h3>Do not infer</h3><p>${esc(cannot)}</p></section><section class="s24-context-section"><h3>Evidence</h3><pre>${esc(JSON.stringify(data,null,2))}</pre></section>`;$('#contextTray').hidden=false;}
  function closeContext(){const tray=$('#contextTray');if(tray)tray.hidden=true;}
  function registerLens(id,renderer){renderers[id]=renderer;}
  function registerOperation(id,handler){operations[id]=handler;}

  window.SentinelApp={
    PRODUCT_MARKER,token,$,$$,state,MISSIONS,LENSES,renderers,operations,
    esc,bytes,pct,fmt,sev,badge,notice,activity,busy,api,download,
    missionForLens,renderNavigation,question,band,empty,ledger,table,primitiveRows,jsonContext,closeContext,
    registerLens,registerOperation,
  };
})();
