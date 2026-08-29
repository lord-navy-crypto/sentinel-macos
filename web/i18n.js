// SPDX-License-Identifier: MPL-2.0
(() => {
  const STORAGE_KEY = 'sentinel.locale';
  const SUPPORTED = ['en','zh-CN'];
  const dictionaries = {
    en: {
      'language.label':'Language','language.english':'English','language.chinese':'中文',
      'nav.easy':'Easy','nav.scan':'Scan','nav.compare':'Compare','nav.security':'Security','nav.investigate':'Investigate','nav.system':'System','nav.processes':'Processes','nav.network':'Network','nav.startup':'Startup','nav.storage':'Storage','nav.advanced':'Advanced','nav.recover':'Recover','nav.terminal':'Terminal','nav.alpha':'Alpha',
      'easy.hero.title':'Mac at a glance','easy.hero.body':'See the few things that matter now, then move into one focused workspace. Easy no longer opens the legacy v2.2 dashboard.','easy.hero.security':'Review Security','easy.hero.investigate':'Investigate an Object',
      'easy.quick.eyebrow':'Quick read-only review','easy.quick.title':'One-click Check','easy.quick.body':'Refresh the simple checks that matter most: security, incidents, disk pressure, recovery, Vault isolation, baselines, change monitoring, and evidence visibility.','easy.quick.empty':'Press One-click Check to run a fresh bounded local review. Nothing is changed automatically.','easy.quick.note':'This check summarizes observable local evidence. It is not a malware probability or a safety certificate.',
      'easy.section.start':'Start here','easy.section.start.body':'Choose the question you have. Each page now stays focused instead of combining unrelated tools.','easy.section.system':'System relationships','easy.section.system.body':'Use a dedicated page for the object type you are looking at.','easy.section.deep':'Deep tools','easy.section.deep.body':'Use these when you need more evidence, recovery detail, or direct typed macOS tools.','easy.section.alpha':'Alpha expansion','easy.section.alpha.body':'Track capability depth, runtime readiness, localization coverage, and the next areas to deepen.',
      'easy.alpha.title':'Alpha Capability Center','easy.alpha.body':'See how UNDERSTAND, INVESTIGATE, CONTROL, RECOVER, and LOCALIZATION are progressing together.','easy.alpha.open':'Open Alpha Center →',
      'common.ok':'OK','common.failed':'Failed','common.review':'Review','common.info':'Info','common.healthy':'Healthy','common.needsReview':'Needs review','common.notCaptured':'Not captured','common.ready':'Ready','common.running':'Running','common.stopped':'Stopped','common.available':'Available','common.noActiveItems':'No active items','common.checking':'Checking…','common.why':'Why this result','common.continue':'Continue →',
      'alpha.eyebrow':'Sentinel · Alpha program','alpha.title':'Alpha Capability Center','alpha.body':'A live expansion surface for capability depth, product readiness, evidence coverage, recovery, and bilingual operation. Alpha here is an ongoing development track, not a claim of production readiness.','alpha.refresh':'Refresh live state','alpha.runtime':'Runtime readiness','alpha.pillars':'Capability pillars','alpha.gaps':'Depth & next upgrades','alpha.localization':'Localization','alpha.localization.detail':'English and Simplified Chinese are active. Language preference is stored locally in this browser session profile.','alpha.note':'Scores describe Sentinel capability/runtime state, not whether the Mac is safe.'
    },
    'zh-CN': {
      'language.label':'语言','language.english':'English','language.chinese':'中文',
      'nav.easy':'简易','nav.scan':'扫描','nav.compare':'比较','nav.security':'安全','nav.investigate':'调查','nav.system':'系统','nav.processes':'进程','nav.network':'网络','nav.startup':'启动项','nav.storage':'存储','nav.advanced':'高级','nav.recover':'恢复','nav.terminal':'终端','nav.alpha':'Alpha',
      'easy.hero.title':'Mac 一览','easy.hero.body':'先查看当前最重要的少量信息，再进入对应的专用工作区。Easy 不再打开旧版 v2.2 总面板。','easy.hero.security':'查看安全状态','easy.hero.investigate':'调查对象',
      'easy.quick.eyebrow':'快速只读检查','easy.quick.title':'一键检查','easy.quick.body':'刷新最重要的简单检查：安全、事件、磁盘压力、恢复、Vault 隔离、基线、变更监控和证据可见性。','easy.quick.empty':'按“一键检查”运行一次新的有界本地检查。不会自动修改任何系统状态。','easy.quick.note':'此检查只汇总当前可观察的本地证据，不代表恶意软件概率，也不是安全证明。',
      'easy.section.start':'从这里开始','easy.section.start.body':'选择你现在想回答的问题。每个页面保持专注，不把无关工具混在一起。','easy.section.system':'系统关系','easy.section.system.body':'根据你正在查看的对象类型进入专门页面。','easy.section.deep':'深度工具','easy.section.deep.body':'当你需要更多证据、恢复细节或直接使用受限 macOS 工具时使用这些页面。','easy.section.alpha':'Alpha 扩展','easy.section.alpha.body':'集中查看能力深度、运行就绪度、本地化覆盖和下一步需要继续深化的部分。',
      'easy.alpha.title':'Alpha 能力中心','easy.alpha.body':'把 UNDERSTAND、INVESTIGATE、CONTROL、RECOVER 与 LOCALIZATION 的推进放在同一个视图中。','easy.alpha.open':'打开 Alpha 能力中心 →',
      'common.ok':'正常','common.failed':'失败','common.review':'需检查','common.info':'信息','common.healthy':'健康','common.needsReview':'需要检查','common.notCaptured':'未建立','common.ready':'就绪','common.running':'运行中','common.stopped':'已停止','common.available':'可用','common.noActiveItems':'无活动项目','common.checking':'检查中…','common.why':'为什么','common.continue':'继续 →',
      'alpha.eyebrow':'Sentinel · Alpha 计划','alpha.title':'Alpha 能力中心','alpha.body':'用于持续扩展能力深度、产品运行状态、证据覆盖、恢复能力与双语体验的实时页面。这里的 Alpha 是持续开发路线，不代表已经达到生产发布状态。','alpha.refresh':'刷新实时状态','alpha.runtime':'运行就绪度','alpha.pillars':'能力支柱','alpha.gaps':'深度与下一步升级','alpha.localization':'本地化','alpha.localization.detail':'英文与简体中文已经启用。语言偏好仅保存在本机浏览器的 Sentinel 配置中。','alpha.note':'这里的分数描述 Sentinel 自身能力和运行状态，不代表这台 Mac 是否安全。'
    }
  };

  function normalizeLocale(value) {
    const raw = String(value || '').toLowerCase();
    if (raw.startsWith('zh')) return 'zh-CN';
    return 'en';
  }
  function currentLocale() {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) return normalizeLocale(saved); } catch {}
    return normalizeLocale(navigator.language || 'en');
  }
  let locale = currentLocale();
  function format(value, vars) {
    let out = String(value ?? '');
    for (const [key, val] of Object.entries(vars || {})) out = out.split(`{${key}}`).join(String(val));
    return out;
  }
  function t(key, vars) {
    const table = dictionaries[locale] || dictionaries.en;
    return format(table[key] ?? dictionaries.en[key] ?? key, vars);
  }
  function translate(root = document) {
    const nodes = root.querySelectorAll ? root.querySelectorAll('[data-i18n]') : [];
    for (const node of nodes) node.textContent = t(node.dataset.i18n);
    for (const node of root.querySelectorAll ? root.querySelectorAll('[data-i18n-placeholder]') : []) node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
    for (const node of root.querySelectorAll ? root.querySelectorAll('[data-i18n-title]') : []) node.setAttribute('title', t(node.dataset.i18nTitle));
    for (const node of root.querySelectorAll ? root.querySelectorAll('[data-i18n-aria-label]') : []) node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
    document.documentElement.lang = locale;
  }
  function setLocale(next) {
    locale = normalizeLocale(next);
    try { localStorage.setItem(STORAGE_KEY, locale); } catch {}
    translate(document);
    document.dispatchEvent(new CustomEvent('sentinel:localechange', {detail:{locale}}));
    return locale;
  }
  function register(extra) {
    for (const [lang, entries] of Object.entries(extra || {})) {
      const normalized = normalizeLocale(lang);
      dictionaries[normalized] = {...(dictionaries[normalized] || {}), ...(entries || {})};
    }
    translate(document);
  }

  window.SentinelI18n = {t, translate, setLocale, getLocale:() => locale, supportedLocales:() => [...SUPPORTED], register};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => translate(document), {once:true});
  else translate(document);
})();
