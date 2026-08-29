// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const $ = id => document.getElementById(id);
  const el = (tag, cls='', text='') => { const n=document.createElement(tag); if(cls)n.className=cls; if(text!=='')n.textContent=String(text); return n; };
  const metric = (label,value) => { const n=el('div','metric'); n.append(el('span','',label),el('b','',value)); return n; };
  const fmtBytes = n => { const raw=Number(n||0),sign=raw<0?'-':raw>0?'+':'';let v=Math.abs(raw),u=['B','KB','MB','GB','TB'],i=0;while(v>=1024&&i<u.length-1){v/=1024;i++;}return `${sign}${v.toFixed(i>1?1:0)} ${u[i]}`; };
  async function api(url, options={}) { options.headers={...(options.headers||{}),'X-Sentinel-Token':token}; const r=await fetch(url,options); const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`); return d; }
  const postMode = mode => api(`/api/system/query/structured?mode=${encodeURIComponent(mode)}`,{method:'POST'});
  function wireLinks(){for(const a of document.querySelectorAll('[data-path]'))a.href=`${a.dataset.path}#token=${encodeURIComponent(token)}`;for(const a of document.querySelectorAll('.hero-actions a')){const u=new URL(a.getAttribute('href'),location.origin);a.href=`${u.pathname}#token=${encodeURIComponent(token)}`;}}

  function render(security,recovery,system,storage){const box=$('easyStatus');box.replaceChildren(
    metric('Security review',(security.review_signals||[]).length?`${(security.review_signals||[]).length} signal(s)`:'No retained signal'),
    metric('Active incidents',security.active_incidents||0),
    metric('System snapshots',(system.snapshots||[]).length),
    metric('Storage history',(storage.snapshots||[]).length),
    metric('Recoverable actions',recovery.recoverable_actions||0),
    metric('Vault items',(recovery.vault||[]).length),
    metric('Network snapshots',recovery.network_snapshots||0),
    metric('Latest storage delta',storage.has_comparison?fmtBytes(storage.latest_comparison?.delta_bytes):'—')
  );
  const notes=[]; if((security.review_signals||[]).length)notes.push('Security has retained review signals.'); if(recovery.advisories?.length)notes.push(`${recovery.advisories.length} recovery advisory item(s).`); if(!notes.length)notes.push('No retained review/advisory signal is currently reported; missing evidence is never treated as proof of safety.'); $('statusNote').textContent=notes.join(' ');}

  function checkCard(title, state, value, detail) {
    const card=el('article',`check-card ${state}`);
    const head=el('div','check-card-head');
    head.append(el('b','',title),el('span',`check-state ${state}`,state==='good'?'OK':state==='bad'?'Failed':state==='review'?'Review':'Info'));
    card.append(head,el('strong','check-value',value),el('p','',detail));
    return card;
  }

  function renderOneClick(q, isolation) {
    const root=$('oneClickResults');
    const secScore=Number(q?.security?.score||0);
    const secFindings=Array.isArray(q?.security?.findings)?q.security.findings.length:0;
    const incidentHigh=Number(q?.incident_high||0), incidentCount=Number(q?.incident_count||0);
    const disk=Number(q?.disk_percent||0);
    const actionHealthy=Boolean(q?.action_health?.healthy);
    const missing=Array.isArray(q?.missing_evidence)?q.missing_evidence.length:0;
    const change=q?.change_monitor||{};
    const cards=[];

    cards.push(checkCard('Security',secScore>=70?'bad':secScore>=40?'review':'good',`${secScore}/100`,`${secFindings} current finding(s). This score prioritizes review; it is not malware probability.`));
    cards.push(checkCard('Incidents',incidentHigh>0?'bad':incidentCount>0?'review':'good',String(incidentCount),incidentCount?`${incidentHigh} high-priority incident(s) are currently retained.`:'No active incident story is currently retained.'));
    cards.push(checkCard('Disk pressure',disk>=95?'bad':disk>=85?'review':'good',`${disk}%`,disk>=85?'Disk usage is high enough to deserve a bounded storage review.':'Current disk usage is below the Easy review threshold.'));
    cards.push(checkCard('Recovery state',actionHealthy?'good':'review',actionHealthy?'Healthy':'Needs review',actionHealthy?'Vault and Safe Action recovery metadata passed the current self-health checks.':'Vault or Safe Action recovery metadata reported a health issue.'));

    const failed=Number(isolation?.isolation_failed||0), partial=Number(isolation?.partially_contained||0), full=Number(isolation?.fully_contained||0), total=Array.isArray(isolation?.items)?isolation.items.length:0;
    const vaultState=failed>0?'bad':partial>0?'review':'good';
    const vaultValue=total?`${full}/${total} fully contained`:'No active items';
    const vaultDetail=failed?`${failed} Vault item(s) failed a live isolation check.`:partial?`${partial} Vault item(s) are only partially contained or have an unverified isolation property.`:total?'All active Vault items passed the bounded live containment checks.':'There are no active Vault objects to verify.';
    cards.push(checkCard('Vault isolation',vaultState,vaultValue,vaultDetail));

    cards.push(checkCard('Behavior baseline',q?.behavior_baseline?(Number(q?.behavior_index||0)>=30?'review':'good'):'info',q?.behavior_baseline?(q?.behavior_band||'Captured'):'Not captured',q?.behavior_baseline?`Latest behavior index: ${Number(q?.behavior_index||0)}.`:'Optional baseline is not present; Easy does not create one automatically.'));
    cards.push(checkCard('Trusted profile',q?.trust_profile?(Number(q?.trust_index||0)>=30?'review':'good'):'info',q?.trust_profile?(q?.trust_band||'Compared'):'Not captured',q?.trust_profile?`Latest trust drift index: ${Number(q?.trust_index||0)}.`:'Optional user-approved Trusted Profile is not present.'));
    cards.push(checkCard('Persistence baseline',Number(q?.persistence_high||0)>0?'review':q?.persistence_baseline?'good':'info',q?.persistence_baseline?'Ready':'Not captured',Number(q?.persistence_high||0)>0?`${Number(q.persistence_high)} high-severity persistence change(s) are retained.`:q?.persistence_baseline?'No high-severity persistence change is reported by this quick check.':'Optional persistence comparison baseline is not present.'));
    cards.push(checkCard('Change monitor',change.needs_rescan?'review':change.running?'good':'info',change.needs_rescan?'Rescan needed':change.running?'Running':'Stopped',change.needs_rescan?'Incremental change evidence should not be treated as complete until a rescan.':change.running?'A focused filesystem change watch is active.':'Change Monitor is optional and currently stopped.'));
    cards.push(checkCard('Evidence visibility',missing?'review':'good',missing?`${missing} limited source(s)`:'Available',missing?'Some local evidence sources are unavailable; Sentinel reduces visibility instead of inventing results.':'No unavailable evidence source was reported by this quick check.'));

    root.replaceChildren(...cards);
    const stamp=q?.generated_at?new Date(q.generated_at).toLocaleString():'just now';
    $('oneClickNote').textContent=`Checked ${stamp}. Attention Index ${Number(q?.attention_index||0)} (${q?.band||'Unknown'}). This is a bounded read-only review, not a safety certificate.`;
  }

  async function loadOverview(){
    const [s,r,sys,st]=await Promise.all([postMode('security-posture'),postMode('recovery'),postMode('system-snapshots'),postMode('storage-history')]);
    render(s,r,sys,st);
  }

  async function runOneClickCheck(){
    const button=$('oneClickCheck');
    button.disabled=true; button.textContent='Checking…'; $('notice').textContent='';
    try {
      const [q,isolation]=await Promise.all([api('/api/quick-check'),api('/api/actions/vault/isolation'),loadOverview()]).then(([quick,vault])=>[quick,vault]);
      renderOneClick(q,isolation);
    } catch(e) {
      $('notice').textContent=`One-click Check could not complete: ${e.message}`;
      $('oneClickNote').textContent='No automatic system change was made.';
    } finally {
      button.disabled=false; button.textContent='One-click Check';
    }
  }

  wireLinks();
  if(!token){$('notice').textContent='Missing Sentinel session token. Open Easy from the running Sentinel app.';return;}
  $('oneClickCheck').addEventListener('click',runOneClickCheck);
  loadOverview().catch(e=>{$('notice').textContent=e.message;$('statusNote').textContent='Some Easy overview evidence could not be loaded.';});
})();
