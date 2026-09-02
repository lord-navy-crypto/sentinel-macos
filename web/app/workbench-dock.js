// SPDX-License-Identifier: MPL-2.0
// Sentinel 3.4 Workbench Dock — converts only Investigation Workbench into a layout dock.
(() => {
  'use strict';
  const shell=document.getElementById('sentinel24');
  const tray=document.getElementById('contextTray');
  const title=document.getElementById('contextTitle');
  const close=document.getElementById('contextClose');
  if(!shell||!tray||!title||!close)return;

  let expand=null;
  function ensureControls(){
    const head=tray.querySelector('.s24-context-head');
    if(!head)return;
    let controls=head.querySelector('.wb-dock-controls');
    if(!controls){
      controls=document.createElement('div');
      controls.className='wb-dock-controls';
      expand=document.createElement('button');
      expand.type='button';
      expand.className='wb-dock-expand';
      expand.dataset.workbenchDockExpand='1';
      expand.title='Widen Workbench';
      expand.setAttribute('aria-label','Widen Workbench');
      expand.textContent='↔';
      controls.appendChild(expand);
      controls.appendChild(close);
      head.appendChild(controls);
    }else{
      expand=controls.querySelector('[data-workbench-dock-expand]');
    }
  }

  function isWorkbench(){return title.textContent.trim()==='Investigation Workbench'&&!tray.hidden;}
  function sync(){
    const docked=isWorkbench();
    tray.classList.toggle('wb-docked',docked);
    shell.classList.toggle('wb-dock-open',docked);
    if(!docked)shell.classList.remove('wb-dock-wide');
    ensureControls();
    if(expand){
      expand.hidden=!docked;
      const wide=shell.classList.contains('wb-dock-wide');
      expand.title=wide?'Use normal Workbench width':'Widen Workbench';
      expand.setAttribute('aria-label',expand.title);
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-workbench-dock-expand]');
    if(!button)return;
    event.preventDefault();
    shell.classList.toggle('wb-dock-wide');
    sync();
  });

  const observer=new MutationObserver(sync);
  observer.observe(title,{childList:true,subtree:true,characterData:true});
  observer.observe(tray,{attributes:true,attributeFilter:['hidden']});
  sync();

  window.__SENTINEL_WORKBENCH_DOCK__={marker:'Sentinel 3.4 Workbench Dock',sync};
})();
