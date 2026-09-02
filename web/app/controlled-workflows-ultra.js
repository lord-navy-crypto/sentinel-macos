// SPDX-License-Identifier: MPL-2.0
// Sentinel 3.3 Controlled Workflows Ultra — typed preflight + explicit execution.
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)return;
  const {$,api,esc}=S;
  const MARKER='Sentinel 3.3 Controlled Workflows Ultra';

  function createTask(label,detail){return S.TaskCenter?.create(label,{kind:'managed-workflow',detail,indeterminate:true})||'';}
  function finishTask(id,detail){if(id)S.TaskCenter?.finish(id,detail);}
  function failTask(id,detail){if(id)S.TaskCenter?.fail(id,detail);}
  function note(text,kind=''){return `<div class="s24-note ${kind}">${text}</div>`;}

  async function previewGit(card){
    const repo=(card.querySelector('[data-controlled-git-repo]')?.value||'').trim();
    const host=card.querySelector('[data-controlled-git-result]');
    if(!host)return;
    const tid=createTask('Git Pull preflight','Inspecting repository, branch, upstream and worktree…');
    host.innerHTML=note('Running repository preflight… / 正在检查仓库…');
    try{
      const d=await api('/api/workflows/git/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repository:repo})});
      host.dataset.gitRepo=d.top_level||d.repository||repo;
      host.innerHTML=note(`<b>Git Pull preview / 预览</b><br>Repository: <code>${esc(d.top_level||d.repository||'')}</code><br>Branch: <code>${esc(d.branch||'—')}</code><br>Upstream: <code>${esc(d.upstream||'—')}</code><br>Working tree: <b>${d.clean?'clean / 干净':'has changes / 有本地修改'}</b><br>Equivalent: <code>${esc(d.equivalent_command||'')}</code><br>${esc(d.limitation||'')}`,d.ready?'good':'warn')+(d.ready?`<div class="s24-form-actions"><button type="button" class="s24-action primary" data-controlled-git-execute>Confirm pull --ff-only / 确认快进 Pull</button></div>`:'');
      finishTask(tid,d.ready?'Git Pull preflight ready':'Git Pull preflight needs review');
    }catch(err){host.innerHTML=note(esc(err.message||String(err)),'warn');failTask(tid,err.message||String(err));}
  }

  async function executeGit(card){
    const host=card.querySelector('[data-controlled-git-result]');
    const repo=host?.dataset.gitRepo||'';
    if(!host||!repo)return;
    if(!confirm('Git Pull will modify this working tree using pull --ff-only only. Sentinel will not stash, reset, switch branches, or resolve conflicts. Continue?'))return;
    const tid=createTask('Git Pull','Executing fast-forward-only pull…');
    host.insertAdjacentHTML('beforeend',note('Executing <code>pull --ff-only</code>…'));
    try{
      const d=await api('/api/workflows/git/pull',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repository:repo,confirm:'PULL --FF-ONLY'})});
      host.innerHTML=note(`<b>Git Pull completed / 已完成</b><br>Repository: <code>${esc(d.repository||repo)}</code><br>Branch: <code>${esc(d.branch||'')}</code><br>Upstream: <code>${esc(d.upstream||'')}</code><br><pre>${esc(d.output||'Completed with no textual output.')}</pre><small>${esc(d.note||'')}</small>`,'good');
      finishTask(tid,'Fast-forward-only Git Pull completed');
    }catch(err){host.insertAdjacentHTML('beforeend',note(esc(err.message||String(err)),'warn'));failTask(tid,err.message||String(err));}
  }

  async function previewDownload(card){
    const url=(card.querySelector('[data-controlled-download-url]')?.value||'').trim();
    const destination=(card.querySelector('[data-controlled-download-dest]')?.value||'').trim();
    const host=card.querySelector('[data-controlled-download-result]');
    if(!host)return;
    const tid=createTask('Download preflight','Validating HTTPS source and destination boundary…');
    host.innerHTML=note('Validating download plan… / 正在验证下载计划…');
    try{
      const d=await api('/api/workflows/download/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,destination})});
      host.dataset.downloadUrl=d.url||url;
      host.dataset.downloadDestination=d.destination||destination;
      host.innerHTML=note(`<b>Download preview / 下载预览</b><br>HTTPS source: <code>${esc(d.url||'')}</code><br>Destination: <code>${esc(d.destination||'')}</code><br>Maximum: ${Math.round(Number(d.max_bytes||0)/1024/1024)} MiB<br>No overwrite: <b>${d.no_overwrite?'yes / 是':'no / 否'}</b><br>${esc(d.limitation||'')}`,'good')+`<div class="s24-form-actions"><button type="button" class="s24-action primary" data-controlled-download-execute>Confirm download / 确认下载</button></div>`;
      finishTask(tid,'Download preflight ready');
    }catch(err){host.innerHTML=note(esc(err.message||String(err)),'warn');failTask(tid,err.message||String(err));}
  }

  async function executeDownload(card){
    const host=card.querySelector('[data-controlled-download-result]');
    const url=host?.dataset.downloadUrl||'',destination=host?.dataset.downloadDestination||'';
    if(!host||!url||!destination)return;
    if(!confirm(`Download this HTTPS resource to:\n${destination}\n\nExisting files will not be overwritten. Continue?`))return;
    const tid=createTask('Controlled Download','Downloading with size, destination and network-address limits…');
    host.insertAdjacentHTML('beforeend',note('Downloading… / 正在下载…'));
    try{
      const d=await api('/api/workflows/download/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,destination,confirm:'DOWNLOAD'})});
      host.innerHTML=note(`<b>Download completed / 下载完成</b><br>Destination: <code>${esc(d.destination||destination)}</code><br>Bytes: ${Number(d.bytes||0).toLocaleString()}<br>SHA-256: <code>${esc(d.sha256||'')}</code><br>Overwrote existing: <b>${d.overwrote_existing?'yes':'no'}</b>`,'good');
      finishTask(tid,'Controlled download completed');
    }catch(err){host.insertAdjacentHTML('beforeend',note(esc(err.message||String(err)),'warn'));failTask(tid,err.message||String(err));}
  }

  document.addEventListener('click',event=>{
    const gitPreview=event.target.closest('[data-controlled-git-preview]');
    if(gitPreview){event.preventDefault();event.stopImmediatePropagation();void previewGit(gitPreview.closest('.s24-card'));return;}
    const gitExecute=event.target.closest('[data-controlled-git-execute]');
    if(gitExecute){event.preventDefault();event.stopImmediatePropagation();void executeGit(gitExecute.closest('.s24-card'));return;}
    const downloadPreview=event.target.closest('[data-controlled-download-preview]');
    if(downloadPreview){event.preventDefault();event.stopImmediatePropagation();void previewDownload(downloadPreview.closest('.s24-card'));return;}
    const downloadExecute=event.target.closest('[data-controlled-download-execute]');
    if(downloadExecute){event.preventDefault();event.stopImmediatePropagation();void executeDownload(downloadExecute.closest('.s24-card'));}
  },true);

  S.ControlledWorkflowsUltra={marker:MARKER};
})();
