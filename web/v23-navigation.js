// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const hash = token ? `#token=${encodeURIComponent(token)}` : '';

  const primaryItems = [
    ['Easy','nav.easy', `/easy.html${hash}`, ['/easy.html']],
    ['Investigate','nav.investigate', `/investigation.html${hash}`, ['/investigation.html']],
    ['System','nav.system', `/system-center.html${hash}`, ['/system-center.html','/control-plane.html']],
    ['Advanced','nav.advanced', `/intelligence-center.html${hash}`, ['/intelligence-center.html','/pre-regression.html']],
    ['Recover','nav.recover', `/vault-health.html${hash}`, ['/vault-health.html']],
    ['Alpha','nav.alpha', `/alpha-center.html${hash}`, ['/alpha-center.html']]
  ];

  const toolItems = [
    ['Scan','nav.scan', `/scan-center.html${hash}`, ['/scan-center.html']],
    ['Compare','nav.compare', `/compare-center.html${hash}`, ['/compare-center.html']],
    ['Security','nav.security', `/security-center.html${hash}`, ['/security-center.html']],
    ['Processes','nav.processes', `/process-relations.html${hash}`, ['/process-relations.html']],
    ['Network','nav.network', `/network-relations.html${hash}`, ['/network-relations.html']],
    ['Startup','nav.startup', `/launch-services.html${hash}`, ['/launch-services.html']],
    ['Storage','nav.storage', `/storage-center.html${hash}`, ['/storage-center.html']],
    ['Terminal','nav.terminal', `/system-console.html${hash}`, ['/system-console.html']]
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

  function makeLink(item, i18n) {
    const [fallback, key, href, paths] = item;
    const a = document.createElement('a');
    a.textContent = i18n ? i18n.t(key) : fallback;
    a.dataset.navI18n = key;
    a.dataset.navFallback = fallback;
    a.href = href;
    if (paths.includes(location.pathname)) a.setAttribute('aria-current','page');
    return a;
  }

  function translated(i18n, key, fallback) {
    if (!i18n) return fallback;
    const value = i18n.t(key);
    return value === key ? fallback : value;
  }

  function buildNavigation() {
    if (document.querySelector('.sentinel-v23-nav')) return;
    const i18n = window.SentinelI18n;

    const nav = document.createElement('div');
    nav.className = 'sentinel-v23-nav';

    const primary = document.createElement('nav');
    primary.className = 'sentinel-v23-primary';
    primary.setAttribute('aria-label','Sentinel primary workspaces');

    const brand = document.createElement('span');
    brand.className = 'sentinel-v23-nav-brand';
    brand.textContent = 'Sentinel v2.3';
    primary.append(brand);

    const primaryLinks = document.createElement('div');
    primaryLinks.className = 'sentinel-v23-primary-links';
    for (const item of primaryItems) primaryLinks.append(makeLink(item, i18n));
    primary.append(primaryLinks);

    const language = document.createElement('div');
    language.className = 'sentinel-language-switcher';
    language.setAttribute('aria-label', translated(i18n,'language.label','Language'));
    for (const [locale,label] of [['en','EN'],['zh-CN','中文']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.locale = locale;
      button.setAttribute('aria-pressed', String(Boolean(i18n && i18n.getLocale() === locale)));
      button.addEventListener('click', () => i18n && i18n.setLocale(locale));
      language.append(button);
    }
    primary.append(language);
    nav.append(primary);

    const shelf = document.createElement('nav');
    shelf.className = 'sentinel-tool-shelf';
    shelf.setAttribute('aria-label','Sentinel tools');
    const shelfLabel = document.createElement('span');
    shelfLabel.className = 'sentinel-tool-shelf-label';
    shelfLabel.textContent = 'TOOLS';
    shelf.append(shelfLabel);
    const toolLinks = document.createElement('div');
    toolLinks.className = 'sentinel-tool-shelf-links';
    for (const item of toolItems) toolLinks.append(makeLink(item, i18n));
    shelf.append(toolLinks);
    nav.append(shelf);

    document.body.prepend(nav);

    for (const id of ['backLink','backToSentinel']) {
      const a = document.getElementById(id);
      if (a) a.href = `/easy.html${hash}`;
    }

    document.addEventListener('sentinel:localechange', () => {
      for (const a of nav.querySelectorAll('[data-nav-i18n]')) {
        a.textContent = translated(i18n, a.dataset.navI18n, a.dataset.navFallback || '');
      }
      language.setAttribute('aria-label', translated(i18n,'language.label','Language'));
      for (const button of language.querySelectorAll('button[data-locale]')) {
        button.setAttribute('aria-pressed', String(button.dataset.locale === i18n.getLocale()));
      }
    });
  }

  ensureI18n(buildNavigation);
})();
