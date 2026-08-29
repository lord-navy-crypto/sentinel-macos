// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const hash = token ? `#token=${encodeURIComponent(token)}` : '';
  const items = [
    ['Easy', `/easy.html${hash}`, ['/easy.html']],
    ['Security', `/security-center.html${hash}`, ['/security-center.html']],
    ['Investigate', `/investigation.html${hash}`, ['/investigation.html']],
    ['System', `/system-center.html${hash}`, ['/system-center.html','/control-plane.html']],
    ['Processes', `/process-relations.html${hash}`, ['/process-relations.html']],
    ['Network', `/network-relations.html${hash}`, ['/network-relations.html']],
    ['Startup', `/launch-services.html${hash}`, ['/launch-services.html']],
    ['Storage', `/storage-center.html${hash}`, ['/storage-center.html']],
    ['Advanced', `/intelligence-center.html${hash}`, ['/intelligence-center.html','/pre-regression.html']],
    ['Recover', `/vault-health.html${hash}`, ['/vault-health.html']],
    ['Terminal', `/system-console.html${hash}`, ['/system-console.html']]
  ];
  if (document.querySelector('.sentinel-v23-nav')) return;
  const nav = document.createElement('nav');
  nav.className = 'sentinel-v23-nav';
  nav.setAttribute('aria-label','Sentinel workspace navigation');
  const brand = document.createElement('span');
  brand.className = 'sentinel-v23-nav-brand';
  brand.textContent = 'Sentinel v2.3';
  nav.append(brand);
  const links = document.createElement('div');
  links.className = 'sentinel-v23-nav-links';
  for (const [label, href, paths] of items) {
    const a = document.createElement('a');
    a.textContent = label;
    a.href = href;
    if (paths.includes(location.pathname)) a.setAttribute('aria-current','page');
    links.append(a);
  }
  nav.append(links);
  document.body.prepend(nav);
})();
