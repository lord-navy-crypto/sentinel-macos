// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const hash = token ? `#token=${encodeURIComponent(token)}` : '';
  const items = [
    ['Easy','nav.easy', `/easy.html${hash}`, ['/easy.html']],
    ['Security','nav.security', `/security-center.html${hash}`, ['/security-center.html']],
    ['Investigate','nav.investigate', `/investigation.html${hash}`, ['/investigation.html']],
    ['System','nav.system', `/system-center.html${hash}`, ['/system-center.html','/control-plane.html']],
    ['Processes','nav.processes', `/process-relations.html${hash}`, ['/process-relations.html']],
    ['Network','nav.network', `/network-relations.html${hash}`, ['/network-relations.html']],
    ['Startup','nav.startup', `/launch-services.html${hash}`, ['/launch-services.html']],
    ['Storage','nav.storage', `/storage-center.html${hash}`, ['/storage-center.html']],
    ['Advanced','nav.advanced', `/intelligence-center.html${hash}`, ['/intelligence-center.html','/pre-regression.html']],
    ['Recover','nav.recover', `/vault-health.html${hash}`, ['/vault-health.html']],
    ['Terminal','nav.terminal', `/system-console.html${hash}`, ['/system-console.html']],
    ['Alpha','nav.alpha', `/alpha-center.html${hash}`, ['/alpha-center.html']]
  ];

  function ensureI18n(done) {
    if (window.SentinelI18n) { done(); return; }
    const existing = document.querySelector('script[data-sentinel-i18n]');
    if (existing) { existing.addEventListener('load', done, {once:true}); return; }
    const script = document.createElement('script');
    script.src = '/i18n.js';
    script.dataset.sentinelI18n = '1';
    script.addEventListener('load', done, {once:true});
    document.head.append(script);
  }

  function buildNavigation() {
    if (document.querySelector('.sentinel-v23-nav')) return;
    const i18n = window.SentinelI18n;
    const t = (key, fallback) => i18n ? i18n.t(key) : fallback;
    const nav = document.createElement('nav');
    nav.className = 'sentinel-v23-nav';
    nav.setAttribute('aria-label','Sentinel workspace navigation');

    const brand = document.createElement('span');
    brand.className = 'sentinel-v23-nav-brand';
    brand.textContent = 'Sentinel v2.3';
    nav.append(brand);

    const links = document.createElement('div');
    links.className = 'sentinel-v23-nav-links';
    for (const [fallback, key, href, paths] of items) {
      const a = document.createElement('a');
      a.textContent = t(key, fallback);
      a.dataset.navI18n = key;
      a.href = href;
      if (paths.includes(location.pathname)) a.setAttribute('aria-current','page');
      links.append(a);
    }
    nav.append(links);

    const language = document.createElement('div');
    language.className = 'sentinel-language-switcher';
    language.setAttribute('aria-label', t('language.label','Language'));
    const locales = [['en','EN'],['zh-CN','中文']];
    for (const [locale,label] of locales) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.locale = locale;
      if (i18n && i18n.getLocale() === locale) button.setAttribute('aria-pressed','true');
      else button.setAttribute('aria-pressed','false');
      button.addEventListener('click', () => i18n && i18n.setLocale(locale));
      language.append(button);
    }
    nav.append(language);
    document.body.prepend(nav);

    for (const id of ['backLink','backToSentinel']) {
      const a = document.getElementById(id);
      if (a) a.href = `/easy.html${hash}`;
    }

    document.addEventListener('sentinel:localechange', () => {
      for (const a of nav.querySelectorAll('[data-nav-i18n]')) a.textContent = i18n.t(a.dataset.navI18n);
      language.setAttribute('aria-label', i18n.t('language.label'));
      for (const button of language.querySelectorAll('button[data-locale]')) button.setAttribute('aria-pressed', String(button.dataset.locale === i18n.getLocale()));
    });
  }

  ensureI18n(buildNavigation);
})();
