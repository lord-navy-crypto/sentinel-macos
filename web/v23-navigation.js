// SPDX-License-Identifier: MPL-2.0
(() => {
  // Transitional navigation for retained specialist workspaces only.
  // Sentinel 2.4 itself owns product navigation in sentinel-24.js.
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const specialistHash = token ? `#token=${encodeURIComponent(token)}` : '';
  const productHref = lens => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (lens) params.set('lens', lens);
    const hash = params.toString();
    return `/${hash ? `#${hash}` : ''}`;
  };

  const primaryItems = [
    ['Sentinel 2.4','nav.easy', productHref('status'), ['/']],
    ['Investigate','nav.investigate', `/investigation.html${specialistHash}`, ['/investigation.html']],
    ['Recover','nav.recover', `/vault-health.html${specialistHash}`, ['/vault-health.html']],
    ['Terminal','nav.terminal', `/system-console.html${specialistHash}`, ['/system-console.html','/terminal-guide.html']],
    ['Alpha','nav.alpha', `/alpha-center.html${specialistHash}`, ['/alpha-center.html']]
  ];

  const toolItems = [
    ['Snapshot','nav.scan', productHref('snapshot'), []],
    ['Compare','nav.compare', productHref('behavior'), []],
    ['Security','nav.security', productHref('audit'), []],
    ['Processes','nav.processes', `/process-relations.html${specialistHash}`, ['/process-relations.html']],
    ['Network','nav.network', `/network-relations.html${specialistHash}`, ['/network-relations.html']],
    ['Startup','nav.startup', `/launch-services.html${specialistHash}`, ['/launch-services.html']],
    ['Storage','nav.storage', productHref('storage'), []]
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
    a.textContent = i18n ? translated(i18n, key, fallback) : fallback;
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
    nav.dataset.role = 'specialist-workspace-navigation';

    const primary = document.createElement('nav');
    primary.className = 'sentinel-v23-primary';
    primary.setAttribute('aria-label','Sentinel specialist workspaces');

    const brand = document.createElement('span');
    brand.className = 'sentinel-v23-nav-brand';
    brand.textContent = 'Sentinel 2.4 · AUX';
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
    shelf.setAttribute('aria-label','Sentinel evidence shortcuts');
    const shelfLabel = document.createElement('span');
    shelfLabel.className = 'sentinel-tool-shelf-label';
    shelfLabel.textContent = 'EVIDENCE';
    shelf.append(shelfLabel);
    const toolLinks = document.createElement('div');
    toolLinks.className = 'sentinel-tool-shelf-links';
    for (const item of toolItems) toolLinks.append(makeLink(item, i18n));
    shelf.append(toolLinks);
    nav.append(shelf);

    document.body.prepend(nav);

    for (const id of ['backLink','backToSentinel']) {
      const a = document.getElementById(id);
      if (a) a.href = productHref('status');
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
