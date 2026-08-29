// SPDX-License-Identifier: MPL-2.0
(() => {
  if (window.__sentinelCommandPaletteInstalled) return;
  window.__sentinelCommandPaletteInstalled = true;
  if (!document.querySelector('link[href="/command-palette.css"]')) {
    const css=document.createElement('link');css.rel='stylesheet';css.href='/command-palette.css';document.head.append(css);
  }
  const token=()=>new URLSearchParams(location.hash.slice(1)).get('token')||'';
  const el=(tag,attrs={},text='')=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')n.className=v;else if(k==='href')n.href=v;else if(k==='type')n.type=v;else n.setAttribute(k,String(v))}if(text)n.textContent=text;return n};
  const backdrop=el('div',{class:'sentinel-command-backdrop'});backdrop.hidden=true;
  const box=el('section',{class:'sentinel-command-box','role':'dialog','aria-label':'Sentinel command palette'});
  const head=el('div',{class:'sentinel-command-head'});const input=el('input',{type:'search',placeholder:'Search or type: process 123 · inspect /path · timeline · visibility','aria-label':'Search Sentinel'});head.append(input,el('span',{class:'sentinel-command-kbd'},'ESC'));
  const results=el('div',{class:'sentinel-command-results'});const foot=el('div',{class:'sentinel-command-foot'},'Typed Sentinel navigation only · never a shell command');box.append(head,results,foot);backdrop.append(box);document.body.append(backdrop);
  let timer=0,seq=0;
  function destination(raw){const u=new URL(raw,location.origin);const oldFragment=u.hash?u.hash.slice(1):'';u.hash='';if(oldFragment&&!u.searchParams.has('section'))u.searchParams.set('section',oldFragment);u.hash='token='+encodeURIComponent(token());return u.pathname+u.search+u.hash}
  function render(actions){results.replaceChildren();for(const a of actions||[]){const link=el('a',{class:'sentinel-command-action',href:destination(a.href)});link.append(el('b',{},a.label||a.kind||'Open'),el('small',{},`${a.kind||'navigation'}${a.detail?' · '+a.detail:''}`));results.append(link)}if(!results.childElementCount)results.append(el('div',{class:'sentinel-command-empty'},'No matching Sentinel object or navigation intent.'))}
  async function search(){const current=++seq;const q=input.value.trim();if(!q){render([{kind:'navigation',label:'Evidence Graph 2.0',href:'/intelligence-center.html#graph'},{kind:'navigation',label:'Incident Intelligence 2.0',href:'/intelligence-center.html#incidents'},{kind:'navigation',label:'Global Timeline',href:'/intelligence-center.html#timeline'},{kind:'navigation',label:'Visibility & Permissions',href:'/intelligence-center.html#visibility'},{kind:'navigation',label:'Network Relationships',href:'/network-relations.html'},{kind:'navigation',label:'Launch & Service Explorer',href:'/launch-services.html'}]);return}try{const r=await fetch('/api/search/command?q='+encodeURIComponent(q),{headers:{'X-Sentinel-Token':token()}});const data=await r.json().catch(()=>({actions:[]}));if(current!==seq)return;if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);render(data.actions)}catch(e){if(current===seq){results.replaceChildren(el('div',{class:'sentinel-command-empty'},e.message||String(e)))}}}
  function open(){backdrop.hidden=false;input.value='';search();requestAnimationFrame(()=>input.focus())}
  function close(){backdrop.hidden=true}
  input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,120)});
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}else if(e.key==='Enter'){const first=results.querySelector('a');if(first){e.preventDefault();location.href=first.href}}});
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)close()});
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();backdrop.hidden?open():close()}else if(e.key==='Escape'&&!backdrop.hidden)close()});
  window.addEventListener('sentinel-open-command-palette',open);
})();