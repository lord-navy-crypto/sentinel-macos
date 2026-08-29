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
  wireLinks();
  if(!token){$('notice').textContent='Missing Sentinel session token. Open Easy from the running Sentinel app.';return;}
  Promise.all([postMode('security-posture'),postMode('recovery'),postMode('system-snapshots'),postMode('storage-history')]).then(([s,r,sys,st])=>render(s,r,sys,st)).catch(e=>{$('notice').textContent=e.message;$('statusNote').textContent='Some Easy overview evidence could not be loaded.';});
})();
