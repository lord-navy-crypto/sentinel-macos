// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const $ = id => document.getElementById(id);
  const el = (tag, cls='', text='') => { const n=document.createElement(tag); if(cls)n.className=cls; if(text!=='')n.textContent=String(text); return n; };
  let scanJob = '';
  let scanTimer = 0;

  async function api(url, options={}) {
    options.headers = {...(options.headers||{}), 'X-Sentinel-Token': token};
    const response = await fetch(url, options);
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json().catch(()=>({})) : null;
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  function clear(node){ if(node) node.replaceChildren(); }
  function fact(label,value){ const n=el('div','scan-fact'); n.append(el('span','',label),el('b','',value)); return n; }
  function setNotice(message=''){ $('notice').textContent=message; }
  function setBusy(button,busy,busyLabel){ if(!button)return; if(busy){button.dataset.label=button.textContent;button.textContent=busyLabel;button.disabled=true;} else {button.textContent=button.dataset.label||button.textContent;button.disabled=false;} }
  function fmtBytes(value){ let n=Number(value||0); if(!Number.isFinite(n)||n<=0)return '0 B'; const units=['B','KB','MB','GB','TB']; let i=0; while(n>=1024&&i<units.length-1){n/=1024;i++;} return `${n.toFixed(n>=10||i===0?1:2)} ${units[i]}`; }

  async function runQuickScan(){
    const button=$('runQuickScan'); setBusy(button,true,'Scanning…'); setNotice('');
    try{
      const d=await api('/api/quick-check');
      const root=$('quickScanResult'); clear(root); root.className='scan-result';
      const grid=el('div','scan-result-grid');
      grid.append(
        fact('Attention',`${Number(d.attention_index||0)} · ${d.band||'—'}`),
        fact('Security',`${Number(d.security?.score||0)} · ${d.security?.level||'—'}`),
        fact('Incidents',String(Number(d.incident_count||0))),
        fact('Disk used',`${Number(d.disk_percent||0)}%`),
        fact('Recovery',d.action_health?.healthy?'Healthy':'Review'),
        fact('Visibility gaps',String(Array.isArray(d.missing_evidence)?d.missing_evidence.length:0))
      );
      root.append(grid,el('p','muted',d.meaning||'Bounded read-only scan complete.'));
    }catch(error){ setNotice(error.message); }
    finally{ setBusy(button,false,''); }
  }

  async function runSecurityScan(){
    const button=$('runSecurityScan'); setBusy(button,true,'Auditing…'); setNotice('');
    try{
      const d=await api('/api/security/audit');
      const root=$('securityScanResult'); clear(root); root.className='scan-result';
      const grid=el('div','scan-result-grid');
      grid.append(fact('Review score',`${Number(d.score||0)}/100`),fact('Level',d.level||'—'),fact('Findings',String(Array.isArray(d.findings)?d.findings.length:0)));
      root.append(grid);
      const findings=el('div','scan-findings');
      for(const f of (d.findings||[]).slice(0,10)){
        const risk=Number(f.risk||0), row=el('div',`scan-finding ${risk>=70?'high':risk>=35?'review':''}`);
        row.append(el('b','',`${f.name||f.kind||'Finding'} · ${risk}/100`),el('p','muted',f.detail||''));
        findings.append(row);
      }
      if(findings.childElementCount) root.append(findings);
      root.append(el('p','muted',d.disclaimer||'Review findings are not a malware verdict.'));
    }catch(error){ setNotice(error.message); }
    finally{ setBusy(button,false,''); }
  }

  function startDeepScan(event){
    event.preventDefault();
    const path=$('deepScanPath').value.trim();
    if(!path || !(path.startsWith('/') || path.startsWith('~/'))){ setNotice('Enter an absolute path or a ~/ path for Deep Object Scan.'); return; }
    const hash=new URLSearchParams({token,path});
    location.href=`/investigation.html#${hash.toString()}`;
  }

  function renderStorageProgress(job){
    $('storageProgress').classList.remove('hidden');
    $('storageState').textContent=job.status||'running';
    $('storagePhase').textContent=job.phase||'walking';
    const pct=Math.max(0,Math.min(100,Number(job.phase_percent||0)));
    $('storagePercent').textContent=`${pct}%`; $('storageProgressBar').value=pct;
    const metrics=$('storageMetrics'); clear(metrics);
    metrics.append(fact('Files',Number(job.files_visited||0).toLocaleString()),fact('Folders',Number(job.dirs_visited||0).toLocaleString()),fact('Permission errors',String(Number(job.permission_errors||0))),fact('Slow paths skipped',String(Number(job.slow_paths_skipped||0))));
    $('storageCurrent').textContent=job.current_dir||job.current_path||job.current_hash_path||'';
  }

  function renderStorageResult(job){
    const root=$('storageResult'); clear(root);
    if(job.status==='failed'){ root.append(el('div','scan-finding high',job.error||'Storage scan failed.')); return; }
    if(job.status==='cancelled'){ root.append(el('div','muted','Storage scan cancelled. Partial evidence is not treated as a complete filesystem census.')); return; }
    const r=job.result||{};
    const grid=el('div','scan-result-grid');
    grid.append(fact('Visible bytes',fmtBytes(r.visible_bytes)),fact('Files visited',Number(r.files_visited||0).toLocaleString()),fact('Folders visited',Number(r.dirs_visited||0).toLocaleString()),fact('Large files',String((r.large_files||[]).length)),fact('Duplicate groups',String((r.duplicates||[]).length)),fact('Duration',`${Number(r.duration_ms||0)} ms`));
    root.append(grid);
    const list=el('div','result-list');
    for(const file of (r.large_files||[]).slice(0,12)){
      const row=el('div','result-row'); row.append(el('b','',`${file.name||'File'} · ${fmtBytes(file.size)}`),el('code','',file.path||'')); list.append(row);
    }
    if(list.childElementCount){ root.append(el('h3','','Largest retained files'),list); }
    root.append(el('p','muted',r.note||'Bounded storage scan complete.'));
    const link=el('a','', 'Open Storage Intelligence →'); link.href=`/storage-center.html#token=${encodeURIComponent(token)}`; root.append(link);
  }

  async function pollStorage(){
    if(!scanJob)return;
    try{
      const job=await api(`/api/storage/jobs?id=${encodeURIComponent(scanJob)}`);
      renderStorageProgress(job);
      if(job.status==='running'){
        scanTimer=window.setTimeout(pollStorage,700);
        return;
      }
      $('cancelStorageScan').disabled=true; $('startStorageScan').disabled=false; renderStorageResult(job); scanJob='';
    }catch(error){ setNotice(error.message); $('cancelStorageScan').disabled=true; $('startStorageScan').disabled=false; scanJob=''; }
  }

  async function startStorageScan(event){
    event.preventDefault(); if(scanJob)return; setNotice('');
    const body={scope:$('storageScope').value,min_mb:Number($('storageMinMB').value),limit:Number($('storageLimit').value)};
    $('startStorageScan').disabled=true;
    try{
      const job=await api('/api/storage/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      scanJob=job.id||''; $('cancelStorageScan').disabled=!scanJob; renderStorageProgress(job); pollStorage();
    }catch(error){ setNotice(error.message); $('startStorageScan').disabled=false; }
  }

  async function cancelStorageScan(){
    if(!scanJob)return; $('cancelStorageScan').disabled=true;
    try{ await api(`/api/storage/cancel?id=${encodeURIComponent(scanJob)}`,{method:'POST'}); if(scanTimer)window.clearTimeout(scanTimer); await pollStorage(); }
    catch(error){ setNotice(error.message); }
  }

  if(!token){ setNotice('Missing Sentinel session token. Open Scan Center from the running Sentinel app.'); return; }
  $('runQuickScan').addEventListener('click',runQuickScan);
  $('runSecurityScan').addEventListener('click',runSecurityScan);
  $('deepScanForm').addEventListener('submit',startDeepScan);
  $('storageScanForm').addEventListener('submit',startStorageScan);
  $('cancelStorageScan').addEventListener('click',cancelStorageScan);
})();
