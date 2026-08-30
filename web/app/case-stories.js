// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)throw new Error('Sentinel application core did not load before Case Stories.');
  const {$,api,busy,activity,notice,esc,fmt,sev,badge,question,band,empty,ledger,download,registerLens}=S;

  function listBlock(title,rows,kind=''){
    const values=rows||[];
    return `<div class="s24-diff-block ${kind}"><h3>${esc(title)}</h3>${values.length?`<div class="s24-diff-detail">${values.slice(0,30).map(x=>`<p>${esc(typeof x==='string'?x:(x.summary||x.label||x.code||x.detail||JSON.stringify(x)))}</p>`).join('')}</div>`:empty('None in retained evidence.')}</div>`;
  }

  function evolutionBlock(e){
    if(!e)return empty('No retained evolution model.');
    return ledger([
      ['Episodes',e.episode_count||0],
      ['Latest direction',e.latest_direction||'—'],
      ['Confidence delta',Number(e.confidence_delta||0)>=0?`+${Number(e.confidence_delta||0)}`:String(e.confidence_delta)],
      ['First episode',fmt(e.first_episode_at)],
      ['Latest episode',fmt(e.last_episode_at)],
      ['Gap',e.gap_seconds?`${e.gap_seconds} s`:'—'],
    ])+`<div class="s24-note">${esc(e.summary||'Evolution compares bounded retained episodes only.')}</div>`;
  }

  function episodeFeed(episodes){
    const rows=episodes||[];
    if(!rows.length)return empty('No bounded episode reconstruction is retained for this story.');
    return `<div class="s24-feed">${rows.slice().reverse().map(e=>`<div class="s24-feed-item"><time>${esc(fmt(e.started_at))}</time><div><h3>${esc(e.episode_id||'episode')}</h3><p>${esc((e.sources||[]).join(' + ')||'Retained evidence')} · ${Number(e.occurrences||0)} observation(s) · confidence ${Number(e.confidence||0)} ${esc(e.confidence_band||'')}</p>${(e.paths||[])[0]?`<code>${esc((e.paths||[])[0])}</code>`:''}</div><div class="meta">${badge(e.severity||'info',sev(e.severity))}</div></div>`).join('')}</div>`;
  }

  function eventTimeline(rows){
    const events=rows||[];
    if(!events.length)return empty('No ordered case timeline is retained.');
    return `<div class="s24-feed">${events.slice().reverse().slice(0,80).map(e=>`<div class="s24-feed-item"><time>${esc(fmt(e.at||e.time||e.timestamp))}</time><div><h3>${esc(e.source||e.kind||e.label||'Evidence')}</h3><p>${esc(e.detail||e.summary||e.kind||'')}</p>${e.path?`<code>${esc(e.path)}</code>`:''}</div><div class="meta">${badge(e.severity||'evidence',sev(e.severity))}</div></div>`).join('')}</div>`;
  }

  function storyRow(row,index){
    const v=row.view||{},incident=v.incident||row.incident||{},exp=v.explanation||row.explanation||{},evo=v.evolution||row.evolution||{},episodes=v.episodes||row.episodes||[],timeline=v.timeline||row.timeline||[];
    const stable=row.stable_id||incident.story_key||incident.stable_id||`story-${index+1}`;
    const episode=row.episode_id||incident.id||'';
    const path=incident.primary_path||row.primary_path||'';
    const facts=exp.observed_facts||[],derived=exp.derived_relationships||[],interpretation=exp.interpretation||[],unknowns=exp.unknowns||[];
    const sources=incident.sources||row.sources||[];
    return `<section class="s24-band" data-case-story="${esc(stable)}"><div class="s24-band-index">${String(index+1).padStart(2,'0')}</div><div class="s24-band-body"><div class="s24-band-head"><div><h2>${esc(incident.title||path||stable)}</h2><p>${esc(path||'No primary path')} · stable story ${esc(stable)}</p></div><div class="s24-band-tools">${badge(incident.severity||'review',sev(incident.severity))}${badge(row.state||'active','focus')}<button class="s24-action" type="button" data-case-export="${esc(episode)}">Export JSON</button>${path?`<button class="s24-action" type="button" data-case-object="${esc(encodeURIComponent(path))}">Object Story</button>`:''}</div></div>${ledger([['Stable story',stable],['Current episode',episode||'—'],['Occurrences',row.occurrence_count??episodes.reduce((n,e)=>n+Number(e.occurrences||0),0)],['First seen',fmt(row.first_seen||incident.created_at)],['Last seen',fmt(row.last_seen||incident.updated_at)],['Confidence',`${incident.confidence??0} · ${incident.confidence_band||'not scored'}`],['Sources',sources.join(' + ')||'—']])}<details open><summary>Explain why this is grouped</summary><div class="s24-diff-grid">${listBlock('Observed facts',facts)}${listBlock('Derived relationships',derived,'review')}${listBlock('Interpretation',interpretation)}${listBlock('Unknowns',unknowns,'review')}</div></details><div class="s24-split"><div><h3>Episode evolution</h3>${evolutionBlock(evo)}</div><div><h3>Retained episodes</h3>${episodeFeed(episodes)}</div></div><details><summary>Ordered evidence timeline</summary>${eventTimeline(timeline)}</details></div></section>`;
  }

  async function renderCasesV2(rebuild=false){
    busy(rebuild?'Rebuilding case stories':'Reading case stories','Stable object-centered stories + bounded episodes');
    const data=await api('/api/incidents/v2?history=1',{method:rebuild?'POST':'GET'});
    const rows=data.incidents||[];
    const active=rows.filter(x=>String(x.state||'active')!=='historical').length;
    const repeated=rows.filter(x=>Number(x.occurrence_count||0)>1||Number(x.view?.evolution?.episode_count||0)>1).length;
    const summary=ledger([['Stable stories',rows.length],['Active / current',active],['Repeated stories',repeated],['History included','Yes'],['Model','Story → episode → evidence']]);
    const body=rows.length?rows.slice(0,70).map(storyRow).join(''):empty('No correlated case stories are retained. Run Snapshot or collect evidence first.');
    $('#evidenceStage').innerHTML=question('<button class="s24-action primary" type="button" data-case-action="rebuild">Rebuild correlations</button><button class="s24-action" type="button" data-case-action="refresh">Refresh</button>')+band(1,'Story model',summary,'Stable Story IDs connect repeated bounded episodes without pretending they are one continuous incident.')+body;
    activity('Ready',100,`${rows.length} stable case stor${rows.length===1?'y':'ies'} loaded`);
  }

  document.addEventListener('click',async event=>{
    const action=event.target.closest('[data-case-action]');
    if(action){try{return await renderCasesV2(action.dataset.caseAction==='rebuild');}catch(e){notice(e.message);activity('Error',0,e.message);return;}}
    const object=event.target.closest('[data-case-object]');
    if(object){const path=decodeURIComponent(object.dataset.caseObject||'');if(path&&typeof S.openStory==='function')return S.openStory({path});}
    const exportButton=event.target.closest('[data-case-export]');
    if(exportButton){const id=exportButton.dataset.caseExport||'';if(!id)return notice('This story has no exportable current episode ID.');try{busy('Exporting case evidence');await download('/api/incidents/export?id='+encodeURIComponent(id),`sentinel-case-${id.slice(0,20)}.json`);activity('Ready',100,'Case evidence exported');}catch(e){notice(e.message);activity('Error',0,e.message);}}
  });

  registerLens('cases',()=>renderCasesV2(false));
  S.renderCases=renderCasesV2;
})();
