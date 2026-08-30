// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)throw new Error('Sentinel application core did not load.');
  const {$,state,MISSIONS,LENSES,renderers,token,api,download,esc,notice,activity,busy,renderNavigation,missionForLens,closeContext,question,band,empty,table}=S;

  async function navigate(lens,{push=true}={}){
    if(!LENSES[lens])lens='status';
    state.lens=lens;state.mission=missionForLens(lens);renderNavigation();closeContext();
    if(push)history.replaceState(null,'','#'+new URLSearchParams({token,lens}).toString());
    try{
      const renderer=renderers[lens];
      if(typeof renderer!=='function')throw new Error(`Lens “${lens}” is not registered.`);
      await renderer();
      $('#evidenceStage').focus({preventScroll:true});
    }catch(e){notice(e.message);activity('Error',0,e.message);$('#evidenceStage').innerHTML=question()+band(1,'Request failed',`<div class="s24-note warn">${esc(e.message)}</div>`,'The interface did not invent replacement evidence.');}
  }

  async function runDeepSearch(form){const fd=new FormData(form),q=String(fd.get('q')||'').trim();busy('Searching',q);const d=await api(`/api/search/deep?q=${encodeURIComponent(q)}&scope=${encodeURIComponent(fd.get('scope'))}&limit=${encodeURIComponent(fd.get('limit'))}`);const rows=d.results||[];$('#deepSearchOutput').innerHTML=rows.length?table(['Kind','Score','Name','Path',''],rows.map(r=>[esc(r.kind),esc(r.score??''),esc(r.name),`<code>${esc(r.path)}</code>`,r.kind==='file'?`<button data-story-path="${esc(encodeURIComponent(r.path))}">Explain</button>`:''])):empty('No filename/path matches were found inside the bounded search budget.');activity('Ready',100,`Visited ${Number(d.visited||0).toLocaleString()} entries · ${rows.length} results`);}

  async function handleAction(name){
    if(name==='quickcheck')return navigate('snapshot');
    if(name==='guided-snapshot'){if(!confirm('Monitoring Snapshot updates local Behavior/Persistence state and may compare an existing Trusted Profile. It does not modify user files. Continue?'))return;busy('Capturing snapshot');await api('/api/guided-snapshot',{method:'POST'});notice('Monitoring snapshot captured.');return navigate('snapshot');}
    if(name==='rebuild-cases'){busy('Correlating');await api('/api/incidents',{method:'POST'});return S.renderCases();}
    if(name==='capture-relations')return S.renderRelations(true);
    if(name==='rerun-audit')return S.renderAudit();
    if(name==='stop-watch'){await api('/api/changes/stop',{method:'POST'});return S.renderChanges();}
    if(name==='review-watch'){busy('Reinspecting');await api('/api/changes/review',{method:'POST'});return S.renderChanges();}
    if(name==='capture-behavior'){busy('Capturing behavior');await api('/api/behavior',{method:'POST'});return S.renderBehavior();}
    if(name==='capture-reference'){if(!confirm('Establish or refresh the Trusted Profile from the current reviewed Mac state? The profile is a reference, not a safety certificate.'))return;busy('Fingerprinting reference');await api('/api/trust/capture',{method:'POST'});return S.renderReference();}
    if(name==='compare-reference'){busy('Comparing reference');await api('/api/trust/compare',{method:'POST'});return S.renderReference();}
    if(name==='cancel-storage'){if(state.scanJob)await api('/api/storage/cancel?id='+encodeURIComponent(state.scanJob),{method:'POST'});return;}
  }

  document.addEventListener('click',async event=>{
    const mission=event.target.closest('[data-mission]');if(mission){const m=MISSIONS.find(x=>x.id===mission.dataset.mission);if(m)return navigate(m.lenses[0]);}
    const lens=event.target.closest('[data-lens]');if(lens)return navigate(lens.dataset.lens);
    const storyPid=event.target.closest('[data-story-pid]');if(storyPid)return S.openStory({pid:Number(storyPid.dataset.storyPid)});
    const storyPath=event.target.closest('[data-story-path]');if(storyPath)return S.openStory({path:decodeURIComponent(storyPath.dataset.storyPath)});
    const graph=event.target.closest('[data-graph-ref]');if(graph){const ref=decodeURIComponent(graph.dataset.graphRef||'');return graph.dataset.graphType==='process'?S.openStory({pid:Number(ref)}):S.openStory({path:ref});}
    const action=event.target.closest('[data-do]');if(action){try{await handleAction(action.dataset.do)}catch(err){notice(err.message);activity('Error',0,err.message);}return;}
    const hit=event.target.closest('[data-search-index]');if(hit){const rows=$('#searchResults')._rows||[],row=rows[Number(hit.dataset.searchIndex)];$('#searchResults').hidden=true;if(row?.pid)return S.openStory({pid:Number(row.pid)});if(row?.path)return S.openStory({path:row.path});if(row?.kind==='incident')return navigate('cases');return;}
    if(!event.target.closest('.s24-search'))$('#searchResults').hidden=true;
  });

  document.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-form]');if(!form)return;event.preventDefault();
    try{
      if(form.dataset.form==='deep-search')await runDeepSearch(form);
      else if(form.dataset.form==='object')await S.inspectObject(new FormData(form).get('path'));
      else if(form.dataset.form==='storage')await S.startStorage(form);
      else if(form.dataset.form==='change-watch'){const fd=new FormData(form);await api('/api/changes/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preset:fd.get('preset'),roots:[],interval_ms:Number(fd.get('interval')||2500)})});await S.renderChanges();}
      else if(form.dataset.form==='safe-action')await S.previewSafeAction(form);
      else if(form.dataset.form==='execute-action')await S.executeSafeAction(form);
    }catch(err){notice(err.message);activity('Error',0,err.message);}
  });

  $('#contextClose').addEventListener('click',closeContext);
  $('#refreshButton').addEventListener('click',()=>navigate(state.lens,{push:false}));
  $('#exportButton').addEventListener('click',async()=>{try{busy('Exporting report');await download('/api/report/export','sentinel-report.json');activity('Ready',100,'Local report exported');}catch(e){notice(e.message);activity('Error',0,e.message);}});
  $('#globalSearch').addEventListener('input',()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(async()=>{const q=$('#globalSearch').value.trim(),panel=$('#searchResults');if(q.length<2){panel.hidden=true;return;}try{const d=await api('/api/search?q='+encodeURIComponent(q)),rows=d.results||[];panel._rows=rows;panel.innerHTML=`<div class="s24-search-intro">Current bounded evidence · ${rows.length} result(s)</div>${rows.length?rows.slice(0,30).map((r,i)=>`<button class="s24-search-hit" type="button" data-search-index="${i}"><span>${esc(r.kind||'evidence')}</span><div><b>${esc(r.title||'Untitled')}</b><small>${esc(r.subtitle||r.why_matched||'')}</small></div></button>`).join(''):empty(`No current evidence matched “${q}”.`)}`;panel.hidden=false;}catch(e){notice(e.message);}},170);});
  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('#globalSearch').focus();$('#globalSearch').select();}if(event.key==='Escape'){closeContext();$('#searchResults').hidden=true;}});

  const applicationIdentity={marker:S.PRODUCT_MARKER,version:'2.5.0',architecture:'modular-app'};
  window.__SENTINEL_25__=applicationIdentity;
  window.__SENTINEL_24__=applicationIdentity;
  S.navigate=navigate;
  const initial=new URLSearchParams(location.hash.slice(1)).get('lens');
  renderNavigation();navigate(LENSES[initial]?initial:'status',{push:false});
})();
