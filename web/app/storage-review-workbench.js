// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)return;
  const {api,esc,bytes,table,empty,notice}=S;
  const MARKER='Sentinel 3.3 Storage Review Workbench';
  const REVIEW_FORMS=new Set(['old','downloads','duplicates','app']);

  function task(label,detail){
    if(S.TaskCenter?.create)return S.TaskCenter.create(label,{detail,indeterminate:true});
    return '';
  }
  function done(id,detail){if(id&&S.TaskCenter?.finish)S.TaskCenter.finish(id,detail);}
  function fail(id,error){if(id&&S.TaskCenter?.fail)S.TaskCenter.fail(id,error?.message||String(error));}
  function output(){return document.getElementById('maintenanceStorageOutput');}
  function basename(path=''){const parts=String(path).split('/').filter(Boolean);return parts.at(-1)||path||'Evidence';}
  function inspectButton(path,source){return `<button type="button" class="s24-action" data-storage-review-inspect="${esc(encodeURIComponent(path))}" data-storage-review-source="${esc(source)}">Inspect in Workbench</button>`;}

  function evidenceFrame({observed='',interpretation='',candidates='',unknown=''}){
    return `<div class="storage-review-workbench" data-storage-review-workbench="1">
      <section class="maintenance-note"><b>OBSERVED</b><div>${observed||empty('No completed observations were returned.')}</div></section>
      <section class="maintenance-note"><b>INTERPRETATION</b><div>${interpretation||'<p>No additional bounded interpretation is required.</p>'}</div></section>
      <section class="maintenance-note"><b>REVIEW CANDIDATES</b><div>${candidates||empty('No review candidates completed this bounded operation.')}</div></section>
      <section class="maintenance-note"><b>NOT ESTABLISHED</b><div>${unknown||'<p>Sentinel has not established deletion safety or user intent.</p>'}</div></section>
    </div>`;
  }

  function candidateTable(headers,rows){return rows.length?table(headers,rows):empty('No review candidates completed this bounded operation.');}

  async function runOld(form){
    const fd=new FormData(form),path=String(fd.get('path')||''),days=Number(fd.get('days')||180),min=Number(fd.get('min_mb')||10);
    const id=task('Old File Review','Bounded modification-age review · no last-used or deletion claim');
    try{
      const d=await api(`/api/maintenance/old-files?path=${encodeURIComponent(path)}&days=${encodeURIComponent(days)}&min_mb=${encodeURIComponent(min)}`),rows=d.files||[];
      const observed=`<p><b>${Number(d.matched_files||0).toLocaleString()}</b> file(s) met the selected modification-age and size filters after ${Number(d.visited_entries||0).toLocaleString()} visited entries${d.limited?' within a bounded/partial result':''}.</p><p>Cutoff: <code>${esc(new Date(d.cutoff).toLocaleString())}</code> · Minimum: ${bytes(d.minimum_bytes||0)}</p>`;
      const candidates=candidateTable(['Age','Size','Modified','File','Review'],rows.map(x=>[`${Number(x.age_days||0)} days`,bytes(x.bytes),esc(new Date(x.modified_at).toLocaleString()),`<code>${esc(x.path)}</code>`,inspectButton(x.path,'old-files')]));
      output().innerHTML=evidenceFrame({
        observed,
        interpretation:`<p>${esc(d.definition||'Candidates are defined by modification time and size only.')}</p>`,
        candidates,
        unknown:`<p>${esc(d.not_established||'Modification age is not last-opened time. Sentinel has not established whether a file is unused, replaceable, or safe to delete.')}</p>`
      });
      done(id,`${rows.length} review row(s)`);
    }catch(error){fail(id,error);throw error;}
  }

  async function runDownloads(){
    const id=task('Downloads Review','Bounded ~/Downloads review · no cleanup or duplicate hashing');
    try{
      const d=await api('/api/maintenance/downloads'),largest=d.largest_files||[],oldest=d.oldest_files||[];
      const observed=`<p><b>${Number(d.regular_files||0).toLocaleString()}</b> regular file(s), ${bytes(d.visible_file_bytes||0)} observed, ${Number(d.visited_entries||0).toLocaleString()} entries visited${d.limited?' within a bounded/partial result':''}.</p>${aggregateBlock('By type',d.by_category||[])}${aggregateBlock('By modification age',d.by_age||[])}${aggregateBlock('By size',d.by_size||[])}`;
      const seen=new Set(),review=[];
      for(const x of [...largest,...oldest]){if(!x?.path||seen.has(x.path))continue;seen.add(x.path);review.push(x);if(review.length>=50)break;}
      const candidates=candidateTable(['Size','Age','Type','File','Review'],review.map(x=>[bytes(x.bytes),`${Number(x.age_days||0)} days`,esc(x.category||'Other'),`<code>${esc(x.path)}</code>`,inspectButton(x.path,'downloads')]));
      output().innerHTML=evidenceFrame({
        observed,
        interpretation:`<p>${esc(d.definition||'Observed Downloads files are grouped by modification age, size, and extension-derived type.')}</p><p>Largest/oldest rows are prioritization views only.</p>`,
        candidates,
        unknown:`<p>${esc(d.not_established||'Sentinel has not established last-opened time, duplicate identity, user intent, or deletion safety.')}</p>`
      });
      done(id,`${Number(d.regular_files||0)} Downloads file(s) reviewed`);
    }catch(error){fail(id,error);throw error;}
  }

  function aggregateBlock(title,rows){
    if(!rows.length)return '';
    return `<div class="maintenance-summary"><b>${esc(title)}</b><span>${rows.slice(0,8).map(x=>`${esc(x.name)}: ${Number(x.count||0).toLocaleString()} / ${bytes(x.bytes||0)}`).join(' · ')}</span></div>`;
  }

  async function runDuplicates(form){
    const fd=new FormData(form),path=String(fd.get('path')||''),min=Number(fd.get('min_mb')||10);
    const id=task('Duplicate Review','Bounded full-file SHA-256 equality review');
    try{
      const d=await api(`/api/maintenance/duplicates?path=${encodeURIComponent(path)}&min_mb=${encodeURIComponent(min)}`),groups=d.groups||[];
      const observed=groups.length?groups.map((g,index)=>`<article class="duplicate-group"><div><b>Group ${index+1} · ${Number(g.paths?.length||0)} file(s) · ${bytes(g.bytes_per_file)} each</b><span>Review math: ${bytes(g.reclaimable_if_reviewed_bytes||0)} duplicate bytes if one reviewed copy were retained.</span><code>SHA-256 ${esc(g.sha256)}</code></div></article>`).join(''):empty('No full-file SHA-256 equality group completed inside this bounded scan.');
      const rows=[];
      groups.forEach((g,index)=>(g.paths||[]).forEach(p=>rows.push([`Group ${index+1}`,bytes(g.bytes_per_file),`<code>${esc(p)}</code>`,inspectButton(p,'duplicates')])));
      const candidates=candidateTable(['Group','Size','Path','Review'],rows);
      output().innerHTML=evidenceFrame({
        observed,
        interpretation:`<p>${esc(d.definition||'Duplicate means full-file SHA-256 equality among files that completed hashing.')}</p><p>Within each returned group, byte-for-byte hash equality is established for the completed candidates.</p>`,
        candidates,
        unknown:'<p>Sentinel has not selected a canonical copy, established which path the user wants to keep, determined whether a copy is referenced elsewhere, or established deletion safety.</p>'
      });
      done(id,`${groups.length} exact duplicate group(s)`);
    }catch(error){fail(id,error);throw error;}
  }

  function footprintKind(item){
    const p=String(item?.path||'');
    if(String(item?.confidence||'').toLowerCase()==='direct')return 'Application bundle';
    if(p.includes('/Library/Group Containers/'))return 'Group Container';
    if(p.includes('/Library/Containers/'))return 'Container';
    if(p.includes('/Library/Caches/'))return 'Cache';
    if(p.includes('/Library/Preferences/'))return 'Preferences';
    if(p.includes('/Library/Application Support/'))return 'Application Support';
    return 'Evidence-linked path';
  }

  async function runApp(form){
    const app=String(new FormData(form).get('app')||'');
    const id=task('App Footprint Review','Measuring app bundle and evidence-linked user Library paths');
    try{
      const d=await api(`/api/maintenance/app-footprint?app=${encodeURIComponent(app)}`),items=d.items||[];
      const observed=`<p><b>${esc(d.bundle_id||'Bundle ID unavailable')}</b> · ${bytes(d.total_bytes||0)} across ${items.length} evidence-linked item(s).</p><p>${esc(d.boundary||'Only evidence-linked paths are included.')}</p>`;
      const grouped={};for(const item of items){const kind=footprintKind(item);(grouped[kind]??=[]).push(item);}
      const interpretation=Object.entries(grouped).map(([kind,rows])=>`<div class="maintenance-summary"><b>${esc(kind)}</b><span>${rows.length} item(s) · ${bytes(rows.reduce((n,x)=>n+Number(x.bytes||0),0))}</span></div>`).join('')||'<p>No evidence-linked component groups were returned.</p>';
      const candidates=candidateTable(['Component','Size','Confidence','Evidence','Path','Review'],items.map(x=>[esc(footprintKind(x)),bytes(x.bytes),esc(x.confidence),esc(x.evidence),`<code>${esc(x.path)}</code>`,inspectButton(x.path,'app-footprint')]));
      output().innerHTML=evidenceFrame({
        observed,
        interpretation,
        candidates,
        unknown:'<p>Association evidence is not ownership proof. Medium-confidence or Group Container paths may be shared. Sentinel has not established that every listed byte belongs exclusively to this app, nor that any path is safe to remove.</p>'
      });
      done(id,`${items.length} evidence-linked item(s)`);
    }catch(error){fail(id,error);throw error;}
  }

  function openInWorkbench(path,source){
    if(!path)throw new Error('Review path is unavailable.');
    if(!S.Workbench?.setSelection||!S.Workbench?.open)throw new Error('Investigation Workbench is unavailable.');
    S.Workbench.setSelection({type:'file',path,label:basename(path)});
    S.Workbench.recordEvent?.('storage-review-selection','Selected storage review evidence for Workbench inspection.',{path,source});
    S.Workbench.open('overview');
  }

  document.addEventListener('submit',event=>{
    const form=event.target.closest('[data-maintenance-form]');
    if(!form||!REVIEW_FORMS.has(form.dataset.maintenanceForm))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const type=form.dataset.maintenanceForm;
    const run=type==='old'?runOld: type==='downloads'?runDownloads: type==='duplicates'?runDuplicates:runApp;
    Promise.resolve(run(form)).catch(error=>notice(error.message||String(error)));
  },true);

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-storage-review-inspect]');
    if(!button)return;
    event.preventDefault();
    try{openInWorkbench(decodeURIComponent(button.dataset.storageReviewInspect||''),button.dataset.storageReviewSource||'storage-review');}
    catch(error){notice(error.message||String(error));}
  });

  S.StorageReviewWorkbench={marker:MARKER,openInWorkbench,evidenceFrame};
  window.__SENTINEL_STORAGE_REVIEW_WORKBENCH__={marker:MARKER};
})();
