// SPDX-License-Identifier: MPL-2.0
(() => {
  const css = String.raw`
:root {
  --bg:#ffffff !important;
  --panel:#ffffff !important;
  --text:#111111 !important;
  --muted:#666666 !important;
  --line:#dddddd !important;
  --accent:#111111 !important;
  --soft:#f5f5f5 !important;
  --good:#111111 !important;
  --warn:#444444 !important;
  --bad:#000000 !important;
  --sidebar:#ffffff !important;
}
html, body { background:#ffffff !important; color:#111111 !important; }
body { overflow-x:hidden !important; }
.app { min-height:100vh !important; grid-template-columns:248px minmax(0,1fr) !important; background:#ffffff !important; }
.sidebar {
  background:#ffffff !important;
  color:#111111 !important;
  border-right:1px solid #d8d8d8 !important;
  height:100vh !important;
  position:sticky !important;
  top:0 !important;
  overflow-y:auto !important;
  overflow-x:hidden !important;
}
main { min-width:0 !important; max-width:none !important; background:#ffffff !important; }
.brandmark { background:#111111 !important; color:#ffffff !important; border:1px solid #111111 !important; }
.brand strong { color:#111111 !important; }
.brand small, .privacy small { color:#777777 !important; }
.mode-switch { display:none !important; }
.easy-mode .advanced-nav, .advanced-nav { display:block !important; }
.nav-group-label { color:#888888 !important; }
.nav { color:#555555 !important; }
.nav:hover { background:#f0f0f0 !important; color:#111111 !important; }
.nav.active { background:#111111 !important; color:#ffffff !important; }
.sidebar-actions, .privacy { border-color:#dddddd !important; }
.side-action { background:#ffffff !important; color:#111111 !important; border-color:#cccccc !important; }
.side-action:hover { background:#f2f2f2 !important; }
.privacy .dot { background:#111111 !important; }
.card, .secondary, .tiny, .controls select, .controls input, .filter,
.global-search-wrap>input, .change-controls select, .change-controls textarea,
.confirm-gate input[type=text], .confirm-gate input:not([type]) {
  background:#ffffff !important;
  color:#111111 !important;
  border-color:#dddddd !important;
}
.card { box-shadow:none !important; }
.primary { background:#111111 !important; color:#ffffff !important; border-color:#111111 !important; }
.primary:hover { background:#2b2b2b !important; }
.secondary:hover, .tiny:hover { background:#f3f3f3 !important; }
.session-pill, .badge, .badge.good, .badge.warn, .badge.bad,
.empty, .riskbox>div, .detail-grid>div, .cleanup-total,
.progress-panel, .good-note, .guidance-note, .page-help,
.search-result:hover, .search-result:focus, .global-search-wrap>kbd,
.intel-summary>div, .graph-wrap, .identity-strip>div,
.behavior-summary>div, .baseline-grid>div, .trend-wrap,
.trust-summary>div, .quick-metrics>div, .deep-search-link,
.search-help code, .search-cheats code, .action-warning,
.consequence-box, .confirm-values>div, .action-result,
.health-status.good, .health-status.warn, .story-summary,
.trust-context, .trust-context.changed {
  background:#f6f6f6 !important;
  color:#111111 !important;
  border-color:#dddddd !important;
  box-shadow:none !important;
}
.notice { background:#f6f6f6 !important; color:#222222 !important; border-color:#cfcfcf !important; }
.action-warning, .welcome-card, .quick-hero, .power-search-card, .change-hero,
.readiness-card, .hardware-hero, .privacy-hardware { border-left-color:#111111 !important; }
.finding, .behavior-change, .persistence-change, .recommendation,
.review-item, .change-event, .weakness-score, .weakness-finding,
.readiness-score { border-left-color:#777777 !important; }
.finding.high, .behavior-change.high, .persistence-change.high,
.recommendation.bad, .review-item.bad, .change-event.bad,
.weakness-finding.bad, .readiness-score.bad { border-left-color:#111111 !important; }
.badge.bad, .badge.warn, .badge.good { color:#111111 !important; }
.metric-progress::-webkit-progress-value, .mini-progress::-webkit-progress-value { background:#111111 !important; }
.metric-progress::-moz-progress-bar, .mini-progress::-moz-progress-bar { background:#111111 !important; }
.graph-edge { stroke:#b8b8b8 !important; }
.graph-node rect { fill:#ffffff !important; stroke:#bdbdbd !important; }
.graph-node.review rect, .graph-node.high rect { stroke:#111111 !important; }
.trend-line { stroke:#111111 !important; }
.trend-dot { fill:#ffffff !important; stroke:#111111 !important; }
.spinner { border-color:#d0d0d0 !important; border-top-color:#111111 !important; }
* { text-shadow:none !important; }
@media (max-width:980px) and (min-width:761px) {
  .app { grid-template-columns:220px minmax(0,1fr) !important; }
  .sidebar { height:100vh !important; position:sticky !important; top:0 !important; padding:18px 10px !important; }
  .sidebar nav { display:block !important; overflow:visible !important; }
  .sidebar-actions { display:block !important; }
  .privacy { display:flex !important; }
  .nav { width:100% !important; white-space:normal !important; }
  main { padding:20px !important; }
}
@media (max-width:760px) {
  .app { grid-template-columns:1fr !important; }
  .sidebar { height:auto !important; position:static !important; border-right:0 !important; border-bottom:1px solid #dddddd !important; }
  .sidebar nav { display:flex !important; overflow-x:auto !important; gap:4px !important; }
  .nav { width:auto !important; white-space:nowrap !important; }
  .nav-group-label { display:none !important; }
  .privacy, .sidebar-actions { display:none !important; }
}
@media (prefers-color-scheme:dark) {
  :root {
    --bg:#0d0d0d !important;
    --panel:#121212 !important;
    --text:#f4f4f4 !important;
    --muted:#a3a3a3 !important;
    --line:#303030 !important;
    --accent:#f4f4f4 !important;
    --soft:#1b1b1b !important;
    --good:#f4f4f4 !important;
    --warn:#cfcfcf !important;
    --bad:#ffffff !important;
    --sidebar:#0d0d0d !important;
  }
  html, body, .app, main, .sidebar { background:#0d0d0d !important; color:#f4f4f4 !important; }
  .sidebar { border-color:#303030 !important; }
  .brandmark { background:#f4f4f4 !important; color:#111111 !important; border-color:#f4f4f4 !important; }
  .brand strong { color:#f4f4f4 !important; }
  .nav { color:#bdbdbd !important; }
  .nav:hover { background:#1b1b1b !important; color:#f4f4f4 !important; }
  .nav.active { background:#f4f4f4 !important; color:#111111 !important; }
  .card, .secondary, .tiny, .controls select, .controls input, .filter,
  .global-search-wrap>input, .change-controls select, .change-controls textarea,
  .confirm-gate input[type=text], .confirm-gate input:not([type]), .side-action,
  .graph-node rect, .trend-dot { background:#121212 !important; color:#f4f4f4 !important; border-color:#303030 !important; fill:#121212 !important; }
  .session-pill, .badge, .badge.good, .badge.warn, .badge.bad,
  .empty, .riskbox>div, .detail-grid>div, .cleanup-total,
  .progress-panel, .good-note, .guidance-note, .page-help,
  .search-result:hover, .search-result:focus, .global-search-wrap>kbd,
  .intel-summary>div, .graph-wrap, .identity-strip>div,
  .behavior-summary>div, .baseline-grid>div, .trend-wrap,
  .trust-summary>div, .quick-metrics>div, .deep-search-link,
  .search-help code, .search-cheats code, .action-warning,
  .consequence-box, .confirm-values>div, .action-result,
  .health-status.good, .health-status.warn, .story-summary,
  .trust-context, .trust-context.changed, .notice {
    background:#1a1a1a !important;
    color:#f4f4f4 !important;
    border-color:#303030 !important;
  }
  .primary { background:#f4f4f4 !important; color:#111111 !important; border-color:#f4f4f4 !important; }
  .primary:hover { background:#d8d8d8 !important; }
  .metric-progress::-webkit-progress-value, .mini-progress::-webkit-progress-value { background:#f4f4f4 !important; }
  .metric-progress::-moz-progress-bar, .mini-progress::-moz-progress-bar { background:#f4f4f4 !important; }
  .spinner { border-color:#444444 !important; border-top-color:#f4f4f4 !important; }
}
`;

  function installStyle() {
    if (document.getElementById('sentinel-desktop-refinement')) return;
    const style = document.createElement('style');
    style.id = 'sentinel-desktop-refinement';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function applyDesktopLayout() {
    installStyle();
    document.title = 'Sentinel Mac';
    document.body?.classList.remove('easy-mode');
    const mode = document.querySelector('.mode-switch');
    if (mode) mode.setAttribute('hidden', '');
    const brand = document.querySelector('.brand strong');
    if (brand) brand.textContent = 'Sentinel Mac';
    const brandSub = document.querySelector('.brand small');
    if (brandSub) brandSub.textContent = 'System Intelligence · v2.2';
    const nav = document.querySelector('.sidebar nav');
    if (nav && !document.getElementById('coreToolsLabel')) {
      const label = document.createElement('div');
      label.id = 'coreToolsLabel';
      label.className = 'nav-group-label';
      label.textContent = 'Core tools';
      nav.insertBefore(label, nav.firstChild);
    }
    const advancedLabel = document.querySelector('.nav-group-label.advanced-nav');
    if (advancedLabel) advancedLabel.textContent = 'Advanced tools';
  }

  installStyle();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyDesktopLayout, {once:true});
  } else {
    applyDesktopLayout();
  }
  window.addEventListener('load', applyDesktopLayout, {once:true});

  const observer = new MutationObserver(() => {
    if (document.body?.classList.contains('easy-mode')) document.body.classList.remove('easy-mode');
  });
  if (document.documentElement) observer.observe(document.documentElement, {subtree:true, attributes:true, attributeFilter:['class']});
})();
