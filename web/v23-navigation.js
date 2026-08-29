// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const hash = token ? `#token=${encodeURIComponent(token)}` : '';
  const items = [
    ['Easy', `/${hash}`, ['/','/index.html']],
    ['Investigate', `/intelligence-center.html${hash}`, ['/intelligence-center.html','/investigation.html','/process-relations.html','/network-relations.html','/launch-services.html']],
    ['Advanced', `/control-plane.html${hash}`, ['/control-plane.html','/system-console.html']],
    ['Recover', `/vault-health.html${hash}`, ['/vault-health.html']]
  ];
  if (document.querySelector('.sentinel-v23-nav')) return;
  const nav = document.createElement('nav'); nav.className = 'sentinel-v23-nav'; nav.setAttribute('aria-label','Sentinel workspace modes');
  const brand = document.createElement('span'); brand.className='sentinel-v23-nav-brand'; brand.textContent='Sentinel v2.3'; nav.append(brand);
  const links = document.createElement('div'); links.className='sentinel-v23-nav-links';
  for (const [label, href, paths] of items) {
    const a=document.createElement('a'); a.textContent=label; a.href=href;
    if (paths.includes(location.pathname)) a.setAttribute('aria-current','page');
    links.append(a);
  }
  const terminal=document.createElement('a');terminal.textContent='Terminal';terminal.href=`/system-console.html${hash}`;if(location.pathname==='/system-console.html')terminal.setAttribute('aria-current','page');links.append(terminal);
  nav.append(links); document.body.prepend(nav);
})();
