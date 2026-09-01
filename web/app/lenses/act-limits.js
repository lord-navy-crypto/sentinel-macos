// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';
  const S=window.SentinelApp;
  const {$,state,api,busy,activity,notice,esc,bytes,badge,sev,question,band,empty,ledger,table,primitiveRows,jsonContext,registerLens}=S;

  const SAFE_CHANGE_WORKFLOW_MARKER='Sentinel 2.7 Safe Change Workflow';
  let safeChangePrefill={path:'',action:'vault'};
  let actionPreviewTimer=null;

  function actionRuntimeLog(level,event,message,fields={}){if(typeof S.runtimeLog==='function')void S.runtimeLog(level,'action',event,message,fields);}
  function stopActionPreviewTimer(){if(actionPreviewTimer){clearInterval(actionPreviewTimer);actionPreviewTimer=null;}}
  function previewRemainingMs(preview=state.actionPreview){const t=Date.parse(preview?.expires_at||'');return Number.isFinite(t)?Math.max(0,t-Date.now()):0;}
  function previewFreshnessText(preview=state.actionPreview){const ms=previewRemainingMs(preview);if(ms<=0)return 'EXPIRED · create a fresh preview';const sec=Math.ceil(ms/1000);return `Fresh · ${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')} remaining`;}
  function updatePreviewFreshness(){
    const preview=state.actionPreview;if(!preview){stopActionPreviewTimer();return;}
    if(state.lens!=='change'){stopActionPreviewTimer();return;}
    const ms=previewRemainingMs(preview),label=$('#actionPreviewFreshness'),button=$('#safeActionExecuteButton');
    if(label)label.textContent=previewFreshnessText(preview);
    if(button)button.disabled=ms<=0;
    if(ms<=0&&!preview._expiryLogged){preview._expiryLogged=true;actionRuntimeLog('warn','preview-expired','Safe Change preview expired before execution.',{action:preview.action,action_id:preview.action_id});activity('Preview expired',0,'Create a fresh preview before executing.');}
  }
  function startActionPreviewTimer(){stopActionPreviewTimer();updatePreviewFreshness();actionPreviewTimer=setInterval(updatePreviewFreshness,500);}
  function recoveryHealthHTML(status,health){
    const rows=[
      ['Mode',status?.mode||health?.mode||'—','Mutation authority remains server-side'],
      ['Recovery health',health?.healthy===false?'Needs review':'Healthy',health?.healthy===false?'Inspect issues before relying on recovery metadata':'Journal and Vault checks passed'],
      ['Journal entries',String(health?.journal_entries??0),'Retained local action history'],
      ['Active Vault items',String(health?.active_vault_items??0),bytes(health?.vault_bytes||0)],
      ['Manifest issues',String(health?.manifest_issues??0),'0 expected'],
    ];
    let html=ledger(rows);
    if(health?.issues?.length)html+=`<div class="s24-note warn"><b>Recovery issues</b><br>${health.issues.map(esc).join('<br>')}</div>`;
    if(health?.advisories?.length)html+=`<div class="s24-note"><b>Advisories</b><br>${health.advisories.map(esc).join('<br>')}</div>`;
    return html;
  }
  function recoveryJournalHTML(journal){
    const entries=(journal?.entries||[]).slice(0,12);
    if(!entries.length)return empty('No Safe Change journal entries yet.');
    return table(['Time','Action','Status','Object','Reversible'],entries.map(x=>[
      esc(x.at||'—'),esc(x.action||'—'),badge(x.status||'unknown',x.status==='success'?'good':'warn'),esc(x.object_name||'—'),esc(x.reversible?'Yes':'No')
    ]));
  }
  function vaultItemsHTML(vault){
    const items=(vault?.items||[]).slice(0,50);
    if(!items.length)return empty('Sentinel Vault has no active recovery items.');
    return table(['Object','Original path','Size','Moved','Recovery'],items.map(x=>[
      esc(x.original_name||x.id||'—'),`<span class="mono">${esc(x.original_path||'—')}</span>`,bytes(x.size||0),esc(x.moved_at||'—'),
      `<button type="button" class="s24-action" data-safe-vault-restore="${esc(encodeURIComponent(x.id||''))}">Preview restore</button> <button type="button" class="s24-action" data-safe-vault-reveal="${esc(encodeURIComponent(x.id||''))}">Reveal</button>`
    ]));
  }

  async function renderReclaim(){
    stopActionPreviewTimer();busy('Estimating','Cleanup Preview');
    const d=await api('/api/cleanup/preview');const items=d.items||d.candidates||[];
    let body=ledger(primitiveRows(d,12));
    if(items.length){
      const keys=['name','path','size','reason'].filter(k=>items.some(x=>x[k]!=null));
      body+=table([...keys,'Review'],items.slice(0,200).map(x=>[
        ...keys.map(k=>k==='size'?bytes(x[k]):`<span class="${k==='path'?'mono':''}">${esc(x[k]??'')}</span>`),
        x.path?`<button type="button" class="s24-action" data-safe-reclaim-path="${esc(encodeURIComponent(x.path))}">Review in Safe Change</button>`:'—'
      ]));
    }
    $('#evidenceStage').innerHTML=question()+band(1,'Reviewable estimate',body,'Large, old, cached, or duplicated-looking does not mean disposable.')+band(2,'Safety boundary','<div class="s24-note good">Cleanup Preview never deletes files. “Review in Safe Change” only carries the exact path into the separate reversible preview workflow; it does not preview or execute automatically.</div>');
    activity('Ready',100,'Cleanup estimate loaded');
  }

  async function renderSafeChange(){
    stopActionPreviewTimer();state.actionPreview=null;
    const prefill={...safeChangePrefill};safeChangePrefill={path:'',action:'vault'};
    const [status,health,journal,vault]=await Promise.all([
      api('/api/actions/status').catch(()=>null),api('/api/actions/health').catch(()=>null),api('/api/actions/journal').catch(()=>({entries:[]})),api('/api/actions/vault').catch(()=>({items:[]})),
    ]);
    const actionValue=prefill.action||'vault';
    const form=`<form class="s24-form" data-form="safe-action"><label class="s24-field"><span>Action</span><select name="action"><option value="rename" ${actionValue==='rename'?'selected':''}>Rename</option><option value="vault" ${actionValue==='vault'?'selected':''}>Vault</option><option value="reveal" ${actionValue==='reveal'?'selected':''}>Reveal in Finder</option></select></label><label class="s24-field"><span>Exact file path</span><input name="path" required value="${esc(prefill.path||'')}" placeholder="/Users/…/file"></label><label class="s24-field"><span>New name (rename only)</span><input name="new_name" placeholder="new-name.ext"></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Preview impact</button></div></form>`;
    $('#evidenceStage').innerHTML=question()+
      band(1,'Target & intent',form,'The server revalidates target scope and state before any reversible mutation.')+
      band(2,'Fresh preview safety gate',`<div id="actionPreview">${empty('A fresh preview will show dependencies, consequences, expiration, exact confirmation phrase, and one-time code.')}</div>`,'Preview expiry is enforced by the server. The UI countdown is an additional visibility aid only.')+
      band(3,'Recovery health',recoveryHealthHTML(status,health),'Recovery metadata remains local. Health describes journal/Vault integrity, not whether any file is safe or malicious.')+
      band(4,'Recent recovery journal',recoveryJournalHTML(journal),'Successful and failed Safe Change attempts are retained locally for recovery and audit context.')+
      band(5,'Active Sentinel Vault',vaultItemsHTML(vault),'Restore always creates a new server preview and requires a fresh confirmation phrase and one-time code.');
    activity('Ready',100,'Safe Actions and recovery state loaded');
  }

  function actionPreviewHTML(p){
    const deps=p.dependencies||[],cons=p.consequences||[],signals=p.signals||[];
    return `${ledger([
      ['Action',p.display_action||p.action],['Object',p.object_name],['Source',p.source],['Destination',p.destination||'—'],['Size',bytes(p.size)],
      ['Action review score',String(p.risk??0),'Operational review context; not malware probability'],['Reversible',p.reversible?'Yes':'No'],
      ['Server expiry',p.expires_at||'—','Preview must still be valid when Execute reaches the server'],['Freshness',previewFreshnessText(p),'Client display; server remains authoritative'],
    ])}<div class="s24-note ${p.permanent?'warn':'good'}"><b id="actionPreviewFreshness">${esc(previewFreshnessText(p))}</b><br>${p.permanent?'Permanent operations require exceptional review.':'This operation is designed around reversible recovery metadata.'}</div>${deps.length?`<div class="s24-note warn"><b>Dependencies</b><br>${deps.map(x=>esc(`${x.title}: ${x.detail}`)).join('<br>')}</div>`:''}${signals.length?`<div class="s24-note"><b>Review signals</b><br>${signals.map(esc).join('<br>')}</div>`:''}${cons.length?`<div class="s24-note warn"><b>Consequences</b><br>${cons.map(esc).join('<br>')}</div>`:''}<form class="s24-form" data-form="execute-action"><label class="s24-field"><span>Exact phrase</span><input name="phrase" required placeholder="${esc(p.confirm_phrase||'')}"></label><label class="s24-field"><span>One-time code</span><input name="code" required placeholder="${esc(p.confirm_code||'')}"></label><label class="s24-field"><span>Acknowledge</span><select name="ack"><option value="no">No</option><option value="yes">I reviewed the consequences</option></select></label><div class="s24-form-actions"><button id="safeActionExecuteButton" class="s24-action danger" type="submit">Execute reversible change</button></div></form>`;
  }

  async function previewActionRequest(req){
    stopActionPreviewTimer();state.actionPreview=null;
    actionRuntimeLog('info','preview-start','Safe Change preview requested.',{action:req.action,path:req.path||'',vault_id:req.vault_id||''});
    busy('Previewing impact',req.path||req.vault_id||req.action);
    try{
      const p=await api('/api/actions/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)});
      state.actionPreview=p;
      const host=$('#actionPreview');if(host)host.innerHTML=actionPreviewHTML(p);
      actionRuntimeLog('info','preview-ready','Safe Change preview is ready.',{action:p.action,action_id:p.action_id,expires_at:p.expires_at,reversible:Boolean(p.reversible)});
      startActionPreviewTimer();activity('Preview ready',100,'No change executed yet · server expiry enforced');return p;
    }catch(error){actionRuntimeLog('error','preview-error',error?.message||String(error),{action:req.action});throw error;}
  }

  async function previewSafeAction(form){
    const fd=new FormData(form),action=fd.get('action'),path=String(fd.get('path')||'').trim();
    if(action==='reveal'){
      actionRuntimeLog('info','reveal-start','Reveal in Finder requested.',{path});
      try{await api('/api/actions/reveal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path})});actionRuntimeLog('info','reveal-complete','Reveal request sent to Finder.',{path});notice('Reveal request sent to Finder.');return;}catch(error){actionRuntimeLog('error','reveal-error',error?.message||String(error),{path});throw error;}
    }
    const req={action,path};if(action==='rename')req.new_name=String(fd.get('new_name')||'').trim();return previewActionRequest(req);
  }

  async function executeSafeAction(form){
    if(!state.actionPreview)throw new Error('Create a fresh preview first.');
    if(previewRemainingMs(state.actionPreview)<=0){actionRuntimeLog('warn','execute-blocked-expired','Execution blocked because the client-visible preview expired.',{action:state.actionPreview.action,action_id:state.actionPreview.action_id});throw new Error('This preview has expired. Create a fresh preview first.');}
    const fd=new FormData(form);if(fd.get('ack')!=='yes')throw new Error('Review and acknowledge the consequences first.');
    const preview=state.actionPreview;
    actionRuntimeLog('info','execute-start','Safe Change execution submitted for server revalidation.',{action:preview.action,action_id:preview.action_id});
    busy('Revalidating & executing','Safe Action');
    try{
      const d=await api('/api/actions/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action_id:preview.action_id,phrase:fd.get('phrase'),code:fd.get('code'),acknowledge:true})});
      stopActionPreviewTimer();state.actionPreview=null;
      actionRuntimeLog('info','execute-success',d.message||'Safe Change completed.',{action:d.action||preview.action,status:d.status||'success',journal_id:d.id||''});
      await renderSafeChange();
      jsonContext(`${d.action||'Action'} · ${d.status||'complete'}`,d,'The exact reversible operation and post-action observation returned by Sentinel.','A broader security verdict about the target.');
      notice(d.message||'Safe Action completed and recorded.');activity('Complete',100,'Recovery journal refreshed');return d;
    }catch(error){actionRuntimeLog('error','execute-error',error?.message||String(error),{action:preview.action,action_id:preview.action_id});throw error;}
  }

  document.addEventListener('click',async event=>{
    const reclaim=event.target.closest('[data-safe-reclaim-path]');if(reclaim){event.preventDefault();safeChangePrefill={path:decodeURIComponent(reclaim.dataset.safeReclaimPath||''),action:'vault'};actionRuntimeLog('info','reclaim-handoff','Cleanup candidate carried into Safe Change review.',{path:safeChangePrefill.path});if(typeof S.navigate==='function')await S.navigate('change');return;}
    const restore=event.target.closest('[data-safe-vault-restore]');if(restore){event.preventDefault();try{await previewActionRequest({action:'restore',vault_id:decodeURIComponent(restore.dataset.safeVaultRestore||'')});}catch(error){notice(error?.message||String(error));activity('Error',0,error?.message||String(error));}return;}
    const reveal=event.target.closest('[data-safe-vault-reveal]');if(reveal){event.preventDefault();const vaultID=decodeURIComponent(reveal.dataset.safeVaultReveal||'');actionRuntimeLog('info','vault-reveal-start','Reveal Vault item requested.',{vault_id:vaultID});try{await api('/api/actions/reveal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vault_id:vaultID})});actionRuntimeLog('info','vault-reveal-complete','Vault item reveal request sent to Finder.',{vault_id:vaultID});notice('Vault item reveal request sent to Finder.');}catch(error){actionRuntimeLog('error','vault-reveal-error',error?.message||String(error),{vault_id:vaultID});notice(error?.message||String(error));}return;}
  });

  async function renderVisibility(){busy('Checking visibility','Coverage + capabilities');const [c,p,s]=await Promise.all([api('/api/coverage'),api('/api/capabilities'),api('/api/advanced-sensor/status').catch(()=>null)]);const items=c.items||[],caps=p.items||[];const coverage=items.length?`<div class="s24-feed">${items.map(x=>`<div class="s24-feed-item"><span>${esc(x.area||'area')}</span><div><h3>${esc(x.status||'unknown')}</h3><p>${esc(x.detail||'')}</p></div><div class="meta">${badge(x.status||'unknown',sev(x.status))}</div></div>`).join('')}</div>`:empty('No coverage metadata.');const capability=caps.length?table(['Source','Available','Purpose'],caps.map(x=>[esc(x.name),badge(x.available?'yes':'no',x.available?'good':'warn'),esc(x.purpose||'')])):empty('No capability metadata.');$('#evidenceStage').innerHTML=question()+band(1,'Coverage',coverage,`Available ${c.available||0} · limited ${c.limited||0} · unavailable ${c.unavailable||0}`)+band(2,'Evidence sources',capability,'Built-in macOS/Unix tools currently available to Sentinel.')+(s?band(3,'Advanced sensor',ledger(primitiveRows(s,12))):'');activity('Ready',100,'Visibility map loaded');}

  async function renderGuide(){$('#evidenceStage').innerHTML=question()+band(1,'Investigation model','<div class="s24-pipeline"><div class="s24-step done"><span>01</span><b>Observe</b></div><div class="s24-step done"><span>02</span><b>Connect</b></div><div class="s24-step active"><span>03</span><b>Compare</b></div><div class="s24-step"><span>04</span><b>Verify / Change</b></div></div>','Start with the smallest evidence path capable of answering the question.')+band(2,'What scores mean',ledger([['Attention','Where to look next','Not malware probability'],['Risk','Why an object was prioritized','Not proof of intent'],['Confidence','How strongly observations relate','Not maliciousness'],['Drift','Difference from an approved reference','Not automatic danger']]))+band(3,'Safety model','<div class="s24-note good">Sentinel is local-first, bounded, and evidence-oriented. File-changing actions are separate from observation and require a fresh server preview, explicit confirmation, revalidation, and recovery metadata.</div>');activity('Ready',100,'Model loaded');}

  registerLens('reclaim',renderReclaim);registerLens('change',renderSafeChange);registerLens('visibility',renderVisibility);registerLens('guide',renderGuide);
  S.previewSafeAction=previewSafeAction;S.executeSafeAction=executeSafeAction;S.renderSafeChange=renderSafeChange;S.safeChangeWorkflow={marker:SAFE_CHANGE_WORKFLOW_MARKER,previewRemainingMs,previewActionRequest};
})();
