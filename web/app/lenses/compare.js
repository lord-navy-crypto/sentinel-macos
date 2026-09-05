// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';
  const S=window.SentinelApp;
  const {$,api,busy,activity,esc,bytes,fmt,sev,badge,question,band,empty,ledger,primitiveRows,registerLens}=S;

  function historyWindowControls(active){
    return `<div class="question-actions">${[[1,'1h'],[6,'6h'],[24,'24h'],[168,'7d']].map(([hours,label])=>`<button class="s24-action ${Number(active)===hours?'primary':''}" type="button" data-history-hours="${hours}">${label}</button>`).join('')}<button class="s24-action" type="button" data-history-workbench="1">Open Workbench</button></div>`;
  }

  function sourceCoverage(sources){
    if(!sources?.length)return empty('No source coverage metadata was returned.');
    return `<div class="s24-feed">${sources.map(x=>`<div class="s24-feed-item"><span>${esc((x.source||'source').toUpperCase())}</span><div><h3>${esc(x.available?'Evidence available':'No retained evidence')}</h3><p>${esc(x.note||'')}</p>${x.latest_at?`<code>latest ${esc(fmt(x.latest_at))}</code>`:''}</div><div class="meta">${badge(`${Number(x.count||0)} retained`)}${x.persistent?badge('PERSISTENT','good'):badge('SESSION')}${x.partial?badge('PARTIAL','warn'):''}</div></div>`).join('')}</div>`;
  }

  function observedHistory(rows){
    if(!rows?.length)return empty('No retained observation falls inside this window. Check source coverage before concluding that nothing changed.');
    return `<div class="s24-feed">${rows.map(x=>`<div class="s24-feed-item"><time>${esc(fmt(x.at))}</time><div><h3>${esc(x.label||x.kind||'Observation')}</h3><p>${esc(x.detail||'')}</p>${x.path?`<code>${esc(x.path)}</code>`:''}</div><div class="meta">${badge(x.source||'evidence')}${x.severity?badge(x.severity,sev(x.severity)):''}${x.partial?badge('PARTIAL','warn'):''}${x.path?`<button class="s24-action" type="button" data-history-path="${esc(encodeURIComponent(x.path))}">Workbench</button>`:''}</div></div>`).join('')}</div>`;
  }

  function correlatedHistory(rows){
    if(!rows?.length)return empty('No multi-source temporal cluster was found in this bounded window.');
    return `<div class="s24-feed">${rows.map(x=>`<div class="s24-feed-item"><time>${esc(fmt(x.last_at))}</time><div><h3>${esc((x.sources||[]).join(' + ')||'Cross-source correlation')}</h3><p>${esc(x.summary||'')}</p><code>${esc(x.boundary||'Temporal proximity is not causation.')}</code></div><div class="meta">${badge(`${(x.event_ids||[]).length} events`)}${badge('CORRELATED','focus')}</div></div>`).join('')}</div>`;
  }

  function evidenceBoundaries(d){
    const interpreted=(d.interpretation||[]).map(x=>`<p>${esc(x)}</p>`).join('')||'<p>No bounded interpretation was produced.</p>';
    const unknown=(d.not_established||[]).map(x=>`<p>${esc(x)}</p>`).join('')||'<p>No additional boundary returned.</p>';
    const limits=(d.limitations||[]).map(x=>`<p>${esc(x)}</p>`).join('');
    return `<div class="s24-split"><div class="s24-note good"><b>INTERPRETATION</b>${interpreted}</div><div class="s24-note"><b>NOT ESTABLISHED</b>${unknown}</div></div>${limits?`<div class="s24-note warn"><b>LIMITATIONS</b>${limits}</div>`:''}`;
  }

  async function renderChanges(hours=24){
    const windowHours=Math.max(1,Math.min(720,Number(hours)||24));
    busy('Reading retained evidence',`What Changed · ${windowHours}h`);
    const [history,d]=await Promise.all([
      api('/api/history/what-changed?hours='+encodeURIComponent(windowHours)),
      api('/api/changes/events')
    ]);
    const s=d.status||{},events=d.events||[];
    const status=ledger([['Status',s.running?'Running':'Stopped'],['Mode',s.mode||'stopped'],['Events',s.event_count??events.length],['History',s.history_entries||0],['Needs rescan',s.needs_rescan?'YES':'No'],['Dropped signals',s.dropped_signals||0]]);
    const controls=`<form class="s24-form" data-form="change-watch"><label class="s24-field"><span>Watch scope</span><select name="preset"><option value="persistence">Persistence</option><option value="downloads">Downloads</option><option value="workspace">Workspace</option></select></label><label class="s24-field"><span>Fallback interval</span><select name="interval"><option value="1500">1.5 s</option><option value="2500" selected>2.5 s</option><option value="5000">5 s</option></select></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Start watch</button><button class="s24-action" type="button" data-do="stop-watch">Stop</button><button class="s24-action" type="button" data-do="review-watch">Reinspect</button></div></form>`;
    const feed=events.length?`<div class="s24-feed">${events.slice().reverse().map(e=>`<div class="s24-feed-item"><time>${esc(fmt(e.at))}</time><div><h3>${esc((e.path||'').split('/').pop()||e.kind||'Change')}</h3><p>${esc(e.why||e.kind||'')}</p><code>${esc(e.path||'')}</code></div><div class="meta">${badge(e.severity||'info',sev(e.severity))}${e.needs_rescan?badge('RESCAN','bad'):''}</div></div>`).join('')}</div>`:empty('No change events in this session.');

    const header=`<div class="s24-note"><b>${esc(history.marker||'What Changed')}</b><br>${esc(history.note||'Aggregated retained evidence only.')}</div>${historyWindowControls(windowHours)}`;
    $('#evidenceStage').innerHTML=question()+band(1,'What changed?',header,`${windowHours} hour retained-evidence window · generated ${fmt(history.generated_at)}`)+band(2,'Source coverage',sourceCoverage(history.sources),'Availability means Sentinel has retained evidence from that source; it is not a whole-system coverage claim.')+band(3,'Observed',observedHistory(history.observed),'Directly retained or derived before/after evidence from existing Sentinel stores. No new scan is triggered by this view.')+band(4,'Correlated in time',correlatedHistory(history.correlated),'Only cross-source observations close in time are grouped. The raw observations remain authoritative.')+band(5,'Interpretation boundary',evidenceBoundaries(history))+band(6,'Change Monitor',controls,'Optional live/session watch. This remains separate from retained cross-source history.')+band(7,'Monitor continuity',status,'Dropped/root-changed conditions must create rescan-required state rather than false confidence.')+band(8,'Observed changes · current watch',feed,'Current session watch evidence; retained History Fusion remains above.');
    activity('Ready',100,`What Changed loaded · ${windowHours}h`);
  }

  async function renderBehavior(){busy('Comparing','Behavior baseline');const [d,h]=await Promise.all([api('/api/behavior'),api('/api/behavior/health').catch(()=>null)]);const last=d.last_diff||{},changes=last.changes||[];const summary=ledger([['Baseline',d.has_baseline?'Available':'Not captured'],['Captured',d.baseline_at||'—'],['History',`${d.history_entries||0} / 40`],['Mode',d.persistence_mode||'persistent-local'],['Evidence index',last.risk_index??'—'],['Band',last.risk_band||'—']]);const feed=changes.length?`<div class="s24-feed">${changes.map(c=>`<div class="s24-feed-item"><span>${esc((c.kind||'change').replaceAll('_',' '))}</span><div><h3>${esc(c.title||'Change')}</h3><p>${esc((c.evidence||[]).join(' · '))}</p></div><div class="meta">${badge(c.severity||'info',sev(c.severity))}</div></div>`).join('')}</div>`:empty('No latest behavior difference is available.');$('#evidenceStage').innerHTML=question('<button class="s24-action primary" data-do="capture-behavior">Capture & compare</button>')+band(1,'Reference state',summary)+band(2,'Differences',feed,'Repeated behavior is not automatically learned as safe.')+(h?band(3,'Baseline health',ledger(primitiveRows(h,10))):'');activity('Ready',100,'Behavior state loaded');}

  async function renderReference(){busy('Reading reference','Trust profile');const [d,h]=await Promise.all([api('/api/trust/status'),api('/api/trust/health').catch(()=>null)]);const last=d.last_drift||{},changes=last.changes||[];const summary=ledger([['Profile',d.has_profile?'Available':'Not established'],['Updated',fmt(d.updated_at)],['Objects',d.objects||0],['Mode',d.persistence_mode||'persistent-local'],['Drift index',last.drift_index??'—'],['Coverage',last.profile_coverage!=null?`${last.profile_coverage}%`:'—']]);const feed=changes.length?`<div class="s24-feed">${changes.map(c=>`<div class="s24-feed-item"><span>${esc(c.kind||'drift')}</span><div><h3>${esc(c.title||'Reference difference')}</h3><p>${esc((c.evidence||[]).join(' · '))}</p>${c.object_key?`<code>${esc(c.object_key)}</code>`:''}</div><div class="meta">${badge(c.severity||'info',sev(c.severity))}${c.object_key?`<button class="s24-action" data-story-path="${esc(encodeURIComponent(c.object_key))}">Explain</button>`:''}</div></div>`).join('')}</div>`:empty('No current drift evidence is available.');$('#evidenceStage').innerHTML=question('<button class="s24-action" data-do="capture-reference">Establish reference</button><button class="s24-action primary" data-do="compare-reference">Compare now</button>')+band(1,'Approved reference',summary)+band(2,'Drift',feed,'Novelty or fingerprint change deserves context; it is not automatically malicious.')+(h?band(3,'Reference health',ledger(primitiveRows(h,10))):'');activity('Ready',100,'Reference state loaded');}

  document.addEventListener('click',event=>{
    const windowButton=event.target.closest('[data-history-hours]');
    if(windowButton){
      event.preventDefault();
      if(S.state?.lens==='changes')void renderChanges(Number(windowButton.dataset.historyHours||24));
      return;
    }
    const wbButton=event.target.closest('[data-history-workbench]');
    if(wbButton){
      event.preventDefault();
      S.Workbench?.open('overview');
      return;
    }
    const pathButton=event.target.closest('[data-history-path]');
    if(pathButton){
      event.preventDefault();
      const path=decodeURIComponent(pathButton.dataset.historyPath||'');
      if(path&&S.Workbench){
        S.Workbench.setSelection({type:'file',path,label:path.split('/').pop()||path});
        S.Workbench.recordEvent?.('history-selection','Selected retained history evidence for Workbench review.',{path});
        S.Workbench.open('overview');
      }
    }
  });

  registerLens('changes',()=>renderChanges(24));registerLens('behavior',renderBehavior);registerLens('reference',renderReference);
  S.renderChanges=renderChanges;S.renderBehavior=renderBehavior;S.renderReference=renderReference;
})();
