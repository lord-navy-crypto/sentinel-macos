// SPDX-License-Identifier: MPL-2.0
(() => {
  const token=new URLSearchParams(location.hash.slice(1)).get('token')||'';
  const $=s=>document.querySelector(s);
  const el=(tag,cls='',text='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=='')n.textContent=String(text);return n};
  async function downloadSession(id,button){button.disabled=true;try{const r=await fetch(`/api/security/investigation/export?session=${encodeURIComponent(id)}`,{headers:{'X-Sentinel-Token':token}});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||`HTTP ${r.status}`)}const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`sentinel-investigation-${id.slice(0,20)}.json`;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url)}catch(e){const n=$('#notice');if(n)n.textContent=`Investigation export failed: ${e.message}`}finally{button.disabled=false}}
  function sessionID(card){for(const cell of card.querySelectorAll('.inspection-mini > div')){const label=cell.querySelector('span')?.textContent?.trim();if(label==='Session ID')return cell.querySelector('b')?.textContent?.trim()||''}return ''}
  function enhance(){const root=$('#sessionList');if(!root)return;for(const card of root.querySelectorAll('.candidate')){if(card.dataset.bundleExport==='1')continue;const id=sessionID(card);if(!id)continue;card.dataset.bundleExport='1';let actions=[...card.children].find(n=>n.classList?.contains('candidate-actions'));if(!actions){actions=el('div','candidate-actions');card.append(actions)}const b=el('button','','Export Investigation Bundle');b.type='button';b.addEventListener('click',()=>downloadSession(id,b));actions.append(b)}}
  const root=$('#sessionList');if(root){new MutationObserver(enhance).observe(root,{childList:true,subtree:true});enhance()}
})();
