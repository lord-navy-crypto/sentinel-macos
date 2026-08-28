// SPDX-License-Identifier: MPL-2.0
(() => {
  const style = document.createElement('style');
  style.id = 'sentinel-desktop-ui';
  style.textContent = `
    .mode-switch{display:none!important}
    .advanced-nav,.easy-mode .advanced-nav{display:block!important}
    html,body{height:100%!important;overflow:hidden!important}
    body{margin:0!important}
    .app{height:100vh!important;min-height:0!important;grid-template-columns:244px minmax(0,1fr)!important;overflow:hidden!important}
    .sidebar{height:100vh!important;min-height:0!important;position:relative!important;top:auto!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important}
    .sidebar nav{display:block!important;overflow:visible!important;min-height:0!important}
    .sidebar-actions{display:block!important}
    .privacy{display:flex!important}
    .nav{width:100%!important;white-space:normal!important}
    main{height:100vh!important;min-height:0!important;min-width:0!important;max-width:none!important;margin:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important}
    #sentinelGlobalActivity{position:fixed;z-index:5000;left:244px;right:0;top:0;height:4px;pointer-events:none;opacity:0;transition:opacity .14s ease}
    #sentinelGlobalActivity.visible{opacity:1}
    #sentinelGlobalActivity::after{content:"";display:block;height:100%;width:34%;background:#111;animation:sentinel-slide 1.05s ease-in-out infinite}
    #sentinelGlobalActivityText{position:fixed;z-index:5001;right:16px;top:12px;padding:7px 10px;border:1px solid #d8d8d8;border-radius:9px;background:rgba(255,255,255,.96);color:#222;font-size:11px;box-shadow:0 4px 18px rgba(0,0,0,.08);opacity:0;transform:translateY(-4px);transition:opacity .14s ease,transform .14s ease;pointer-events:none}
    #sentinelGlobalActivityText.visible{opacity:1;transform:translateY(0)}
    button[data-sentinel-pending="1"]{opacity:.72!important;cursor:progress!important}
    @keyframes sentinel-slide{0%{transform:translateX(-115%)}55%{transform:translateX(210%)}100%{transform:translateX(310%)}}
    @media(prefers-color-scheme:dark){#sentinelGlobalActivity::after{background:#f2f2f2}#sentinelGlobalActivityText{background:rgba(20,20,20,.96);border-color:#3a3a3a;color:#f1f1f1}}
    @media(prefers-reduced-motion:reduce){#sentinelGlobalActivity::after{animation:none;width:100%}}
    @media(max-width:719px){html,body{overflow:auto!important}.app{height:auto!important;min-height:100vh!important;display:block!important;overflow:visible!important}.sidebar{height:auto!important;max-height:42vh!important;overflow-y:auto!important}.privacy,.sidebar-actions{display:none!important}main{height:auto!important;min-height:58vh!important;overflow:visible!important}#sentinelGlobalActivity{left:0!important}}
  `;
  document.head.appendChild(style);

  document.body.classList.remove('easy-mode');
  document.querySelector('.mode-switch')?.remove();
  const group = document.querySelector('.nav-group-label.advanced-nav');
  if (group) group.textContent = 'More tools';

  const bar = document.createElement('div');
  bar.id = 'sentinelGlobalActivity';
  bar.setAttribute('aria-hidden', 'true');
  const status = document.createElement('div');
  status.id = 'sentinelGlobalActivityText';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  document.body.append(bar, status);

  let active = 0;
  let hideTimer = null;
  const show = (message='Sentinel is working…') => {
    clearTimeout(hideTimer);
    bar.classList.add('visible');
    status.textContent = message;
    status.classList.add('visible');
  };
  const hideSoon = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (active === 0) {
        bar.classList.remove('visible');
        status.classList.remove('visible');
        document.querySelectorAll('button[data-sentinel-pending="1"]').forEach(b => b.removeAttribute('data-sentinel-pending'));
      }
    }, 260);
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    active += 1;
    show(active > 1 ? `Sentinel is working… ${active} local requests` : 'Sentinel is working…');
    try {
      return await originalFetch(...args);
    } finally {
      active = Math.max(0, active - 1);
      if (active === 0) hideSoon();
      else show(`Sentinel is working… ${active} local requests`);
    }
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled || button.classList.contains('nav') || button.hasAttribute('data-go')) return;
    button.dataset.sentinelPending = '1';
    show(`Starting: ${(button.textContent || 'action').trim()}…`);
    setTimeout(() => {
      if (active === 0) {
        button.removeAttribute('data-sentinel-pending');
        hideSoon();
      }
    }, 900);
  }, true);
})();
