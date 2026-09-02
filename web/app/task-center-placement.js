// SPDX-License-Identifier: MPL-2.0
// Sentinel 3.4 Task Center placement migration — user guidance follows the bottom-right UI.
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)return;
  const replacements=[
    ['左下角 Task Center','右下角 Task Center'],
    ['左下角悬浮任务中心','右下角悬浮任务中心'],
    ['在左下角打开 Task Center','在右下角打开 Task Center'],
  ];
  const patchText=value=>{
    let out=String(value??'');
    for(const [from,to] of replacements)out=out.replaceAll(from,to);
    return out;
  };
  function patchManual(){
    const topics=S.userManual?.topics;
    if(!Array.isArray(topics))return false;
    for(const topic of topics){
      if(typeof topic.title==='string')topic.title=patchText(topic.title);
      if(typeof topic.summary==='string')topic.summary=patchText(topic.summary);
      if(typeof topic.caution==='string')topic.caution=patchText(topic.caution);
      for(const key of ['paragraphs','steps','lookFor']){
        if(Array.isArray(topic[key]))topic[key]=topic[key].map(patchText);
      }
    }
    return true;
  }
  function watchBalanceLoader(){
    const attach=script=>{
      if(!script||script.dataset.taskPlacementWatch==='1')return;
      script.dataset.taskPlacementWatch='1';
      script.addEventListener('load',()=>patchManual(),{once:true});
    };
    attach(document.querySelector('script[data-sentinel-product-balance-ultra]'));
    const observer=new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes){
        if(node instanceof HTMLScriptElement&&node.matches('script[data-sentinel-product-balance-ultra]'))attach(node);
      }
      if(patchManual())observer.disconnect();
    });
    observer.observe(document.body,{childList:true});
    window.addEventListener('load',()=>patchManual(),{once:true});
  }
  patchManual();
  watchBalanceLoader();
  window.__SENTINEL_TASK_CENTER_PLACEMENT__={marker:'Sentinel 3.4 Task Center Bottom Right',patchManual};
})();
