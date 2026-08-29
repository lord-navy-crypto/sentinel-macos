// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const $ = id => document.getElementById(id);
  const el = (tag, cls='', text='') => { const n=document.createElement(tag); if(cls)n.className=cls; if(text!=='')n.textContent=String(text); return n; };
  const i18n = window.SentinelI18n;
  i18n.register({
    en:{
      'alpha.score':'Readiness score','alpha.version':'Version','alpha.visibility':'Visibility gaps','alpha.vault':'Vault containment','alpha.noChecks':'No readiness checks were returned.','alpha.open':'Open workspace →','alpha.state.strong':'Strong','alpha.state.growing':'Growing','alpha.state.limited':'Limited',
      'pillar.understand':'UNDERSTAND','pillar.understand.detail':'Quick Check, visibility, structured system evidence, timelines, and object stories turn raw state into explanations.','pillar.investigate':'INVESTIGATE','pillar.investigate.detail':'Evidence Graph, Incidents, object investigation, process/network/startup relations, and continuation paths.','pillar.control':'CONTROL','pillar.control.detail':'Typed Safe Actions stay previewed, bounded, journaled, and separate from read-only inspection.','pillar.recover':'RECOVER','pillar.recover.detail':'Vault, restore metadata, isolation verification, state backups, and recovery health.','pillar.localization':'LOCALIZATION','pillar.localization.detail':'Shared translation runtime with English and Simplified Chinese, persistent local preference, and reusable translation keys.',
      'pillar.understand.live':'State reflects current evidence visibility.','pillar.investigate.live':'Core relationship and continuation surfaces are present.','pillar.control.live':'State reflects current Safe Actions recovery health.','pillar.recover.live':'State reflects live Vault containment and recovery health.','pillar.localization.live':'Two locale runtimes are active; workspace coverage is still being expanded.',
      'gap.recovery':'Deepen Recovery Center 2.0','gap.recovery.detail':'Add checkpoint/state repair views, interrupted-work recovery, rollback confidence, and clearer restore dependencies.','gap.snapshot':'Deepen System Snapshot & Diff','gap.snapshot.detail':'Group meaningful changes, attribute related process/startup/network objects, and continue directly into investigation.','gap.incident':'Deepen Incident Intelligence','gap.incident.detail':'Complete deterministic merge/split controls, standalone export, reason-code provenance, and evidence-driven episode comparison.','gap.i18n':'Expand localization coverage','gap.i18n.detail':'Move every focused workspace and dynamic message to translation keys while keeping raw evidence unchanged.','gap.storage':'Deepen Storage Intelligence','gap.storage.detail':'Add growth attribution, aging trends, history grouping, cleanup previews, and recovery-aware actions without permanent delete.'
    },
    'zh-CN':{
      'alpha.score':'就绪度评分','alpha.version':'版本','alpha.visibility':'可见性缺口','alpha.vault':'Vault 隔离','alpha.noChecks':'没有返回运行就绪检查。','alpha.open':'打开工作区 →','alpha.state.strong':'较强','alpha.state.growing':'持续增强','alpha.state.limited':'受限',
      'pillar.understand':'UNDERSTAND · 理解','pillar.understand.detail':'用一键检查、可见性、结构化系统证据、时间线和对象故事，把原始状态变成可解释信息。','pillar.investigate':'INVESTIGATE · 调查','pillar.investigate.detail':'通过证据图、事件、对象调查、进程/网络/启动关系和继续调查路径，把证据串起来。','pillar.control':'CONTROL · 控制','pillar.control.detail':'所有 Safe Actions 保持类型化、预览、有界、记录日志，并与只读检查严格分离。','pillar.recover':'RECOVER · 恢复','pillar.recover.detail':'Vault、恢复元数据、隔离验证、状态备份和恢复健康共同构成可逆层。','pillar.localization':'LOCALIZATION · 本地化','pillar.localization.detail':'共享翻译运行时，支持英文和简体中文、本机持久化语言偏好以及可复用翻译键。',
      'pillar.understand.live':'状态会根据当前证据可见性变化。','pillar.investigate.live':'核心关系分析与继续调查入口已经存在。','pillar.control.live':'状态会根据 Safe Actions 当前恢复健康变化。','pillar.recover.live':'状态会根据 Vault 实时隔离与恢复健康变化。','pillar.localization.live':'两种语言运行时已经启用；各深度工作区仍在持续迁移。',
      'gap.recovery':'深化 Recovery Center 2.0','gap.recovery.detail':'加入检查点/状态修复、未完成任务恢复、回滚可信度和更清晰的恢复依赖。','gap.snapshot':'深化 System Snapshot & Diff','gap.snapshot.detail':'聚合真正有意义的变化，关联进程/启动项/网络对象，并可以直接继续调查。','gap.incident':'深化 Incident Intelligence','gap.incident.detail':'完成确定性的合并/拆分、独立导出、Reason Code 来源和事件阶段对比。','gap.i18n':'扩大多语言覆盖','gap.i18n.detail':'把所有专用工作区和动态消息逐步迁移到翻译键，同时原始证据保持原文不改。','gap.storage':'深化 Storage Intelligence','gap.storage.detail':'继续加入增长归因、老化趋势、历史分组、清理预览与恢复感知动作，同时不提供永久删除。'
    }
  });
  const t = key => i18n.t(key);
  async function api(path){const r=await fetch(path,{headers:{'X-Sentinel-Token':token}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d;}
  const linkForView = view => ({security:'/security-center.html',incidents:'/intelligence-center.html',weakness:'/intelligence-center.html',actions:'/vault-health.html',changes:'/system-center.html',behavior:'/intelligence-center.html',trust:'/intelligence-center.html',integrity:'/system-center.html'}[view]||'/easy.html')+`#token=${encodeURIComponent(token)}`;
  const fact=(label,value)=>{const n=el('div','alpha-fact');n.append(el('span','',label),el('b','',value));return n;};
  function renderReadiness(r,visibility,isolation){
    $('readinessBand').textContent=String(r.band||'unknown');$('readinessBand').className=`alpha-pill ${Number(r.score||0)>=90?'pass':Number(r.score||0)>=55?'review':'high'}`;
    $('readinessSummary').replaceChildren(
      fact(t('alpha.score'),`${Number(r.score||0)}/100`),fact(t('alpha.version'),r.version||'—'),fact(t('alpha.visibility'),String(Number(visibility?.summary?.unavailable||visibility?.unavailable||0)+Number(visibility?.summary?.limited||visibility?.limited||0))),fact(t('alpha.vault'),`${Number(isolation?.fully_contained||0)} / ${Array.isArray(isolation?.items)?isolation.items.length:0}`)
    );
    const root=$('readinessChecks');root.replaceChildren();const rows=Array.isArray(r.checks)?r.checks:[];
    if(!rows.length){root.append(el('div','alpha-item',t('alpha.noChecks')));return;}
    for(const row of rows){const card=el('article','alpha-item');const head=el('div','alpha-item-head');head.append(el('b','',row.title||row.area||'Check'),el('span',`alpha-pill ${row.status||'info'}`,row.status||'info'));card.append(head,el('p','',row.detail||''));if(row.view){const a=el('a','',t('alpha.open'));a.href=linkForView(row.view);card.append(a);}root.append(card);}
  }
  function pillar(title,detail,state,liveDetail,href){const card=el('article','pillar-card');card.dataset.state=state;card.append(el('h3','',title),el('strong','pillar-state',t(`alpha.state.${state}`)),el('p','',detail),el('p','pillar-live',liveDetail));const a=el('a','',t('alpha.open'));a.href=`${href}#token=${encodeURIComponent(token)}`;card.append(a);return card;}
  function renderPillars(r,visibility,isolation,q){
    const unavailable=Number(visibility?.summary?.unavailable||visibility?.unavailable||0);const actionHealthy=Boolean(q?.action_health?.healthy);const failed=Number(isolation?.isolation_failed||0);const partial=Number(isolation?.partially_contained||0);const localeCount=i18n.supportedLocales().length;
    $('pillarGrid').replaceChildren(
      pillar(t('pillar.understand'),t('pillar.understand.detail'),unavailable?'growing':'strong',t('pillar.understand.live'),'/intelligence-center.html'),
      pillar(t('pillar.investigate'),t('pillar.investigate.detail'),'strong',t('pillar.investigate.live'),'/investigation.html'),
      pillar(t('pillar.control'),t('pillar.control.detail'),actionHealthy?'strong':'growing',t('pillar.control.live'),'/control-plane.html'),
      pillar(t('pillar.recover'),t('pillar.recover.detail'),failed?'limited':partial||!actionHealthy?'growing':'strong',t('pillar.recover.live'),'/vault-health.html'),
      pillar(t('pillar.localization'),t('pillar.localization.detail'),localeCount>=2?'growing':'limited',t('pillar.localization.live'),'/alpha-center.html')
    );
  }
  function renderGaps(r){
    const root=$('gapList');root.replaceChildren();
    const live=(r.checks||[]).filter(x=>x.status==='high'||x.status==='review').slice(0,3);
    for(const row of live){const card=el('article','alpha-item');const head=el('div','alpha-item-head');head.append(el('b','',row.title),el('span',`alpha-pill ${row.status}`,row.status));card.append(head,el('p','',row.detail||''));if(row.view){const a=el('a','',t('alpha.open'));a.href=linkForView(row.view);card.append(a);}root.append(card);}
    for(const key of ['recovery','snapshot','incident','i18n','storage']){const card=el('article','alpha-item');card.append(el('b','',t(`gap.${key}`)),el('p','',t(`gap.${key}.detail`)));root.append(card);}
  }
  let latest=null;
  async function load(){if(!token){$('notice').textContent='Missing Sentinel session token.';return;}$('notice').textContent='';$('refreshAlpha').disabled=true;try{const [r,v,q,i]=await Promise.all([api('/api/readiness'),api('/api/visibility'),api('/api/quick-check'),api('/api/actions/vault/isolation')]);latest={r,v,q,i};renderReadiness(r,v,i);renderPillars(r,v,i,q);renderGaps(r);$('localePill').textContent=`${i18n.getLocale()} · ${i18n.supportedLocales().length} locales`;}catch(e){$('notice').textContent=e.message;}finally{$('refreshAlpha').disabled=false;}}
  $('refreshAlpha').addEventListener('click',load);
  document.addEventListener('sentinel:localechange',()=>{if(latest){renderReadiness(latest.r,latest.v,latest.i);renderPillars(latest.r,latest.v,latest.i,latest.q);renderGaps(latest.r);}$('localePill').textContent=`${i18n.getLocale()} · ${i18n.supportedLocales().length} locales`;});
  load();
})();
