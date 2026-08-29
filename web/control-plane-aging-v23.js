// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const $ = id => document.getElementById(id);
  const el=(tag,cls='',text='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=='')n.textContent=String(text);return n};
  const fmtBytes=n=>{let v=Number(n||0),a=Math.abs(v),u=['B','KB','MB','GB','TB'],i=0;while(a>=1024&&i<u.length-1){a/=1024;i++}return `${v<0?'-':''}${a.toFixed(i?1:0)} ${u[i]}`};
  const fmtTime=s=>s?new Date(Number(s)*1000).toLocaleString():'—';
  async function api(path){const r=await fetch(path,{headers:{'X-Sentinel-Token':token}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
  function metric(label,value){const n=el('div','metric');n.append(el('span','',label),el('b','',value));return n}
  function investigate(path){const a=el('a','','Investigate');a.href=`/investigation.html#token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`;return a}
  function render(data){
    const summary=$('storageAgingSummary'),box=$('storageAging');if(!summary||!box)return;summary.replaceChildren();box.replaceChildren();
    summary.append(metric('Large files considered',data.files_considered||0),metric('Bytes considered',fmtBytes(data.bytes_considered)),metric('Age buckets',(data.buckets||[]).length),metric('Trend points',(data.trend||[]).length));
    for(const b of data.buckets||[]){const row=el('div','row');const main=el('div','row-main');main.append(el('b','',b.label),el('p','',`${b.files||0} retained large file(s) · ${fmtBytes(b.bytes)}`));row.append(main);box.append(row)}
    if((data.trend||[]).length){const card=el('div','card');card.append(el('h3','','Retained total-visible-byte trend'));for(const p of data.trend)card.append(el('p',p.partial?'delta-negative':'',`${fmtTime(p.created_at)} · ${fmtBytes(p.visible_bytes)}${p.partial?' · partial':''}`));box.append(card)}
    for(const f of (data.oldest_large_files||[]).slice(0,30)){const row=el('div','row');const main=el('div','row-main');main.append(el('b','',`${f.age_days} days · ${f.name||f.path}`),el('p','',`${fmtBytes(f.size)} · ${f.path}`));const actions=el('div','row-actions');if(String(f.path||'').startsWith('/'))actions.append(investigate(f.path));row.append(main,actions);box.append(row)}
    for(const l of data.limitations||[])box.append(el('p','help',`Limitation: ${l}`));
    if(data.note)box.append(el('p','help',data.note));
  }
  async function load(){const b=$('refreshStorageAging');if(b)b.disabled=true;try{render(await api('/api/storage/aging'))}catch(e){const n=$('notice');if(n)n.textContent=e.message}finally{if(b)b.disabled=false}}
  const vault=$('vaultHealthLink');if(vault)vault.href=`/vault-health.html#token=${encodeURIComponent(token)}`;
  const button=$('refreshStorageAging');if(button)button.addEventListener('click',load);
  if(token)load();
})();
