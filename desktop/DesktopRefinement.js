// SPDX-License-Identifier: MPL-2.0
(() => {
  // Desktop-only presentation layer. Keep this deliberately small and static:
  // the embedded dashboard already owns all behavior. Do not observe or rewrite
  // dynamic class changes, because Sentinel updates classes frequently while
  // scans, navigation, and status cards are running.
  const css = String.raw`
:root{
  --bg:#fff!important;--panel:#fff!important;--text:#111!important;
  --muted:#666!important;--line:#ddd!important;--accent:#111!important;
  --soft:#f5f5f5!important;--sidebar:#fff!important;
  --good:#111!important;--warn:#444!important;--bad:#000!important;
}
html,body,.app,main{background:#fff!important;color:#111!important}
body{overflow-x:hidden!important}
.app{grid-template-columns:248px minmax(0,1fr)!important;min-height:100vh!important}
main{min-width:0!important;max-width:none!important}
.sidebar{
  background:#fff!important;color:#111!important;border-right:1px solid #ddd!important;
  height:100vh!important;position:sticky!important;top:0!important;
  overflow-y:auto!important;overflow-x:hidden!important;
}
.brandmark{background:#111!important;color:#fff!important;border:1px solid #111!important}
.brand strong{color:#111!important}.brand small,.privacy small{color:#777!important}
.mode-switch{display:none!important}
.easy-mode .advanced-nav,.advanced-nav{display:block!important}
.nav-group-label{color:#888!important}.nav{color:#555!important}
.nav:hover{background:#f2f2f2!important;color:#111!important}
.nav.active{background:#111!important;color:#fff!important}
.sidebar-actions,.privacy{border-color:#ddd!important}
.side-action{background:#fff!important;color:#111!important;border-color:#ccc!important}
.side-action:hover{background:#f2f2f2!important}.privacy .dot{background:#111!important}
.card,.secondary,.tiny,.controls select,.controls input,.filter,
.global-search-wrap>input,.change-controls select,.change-controls textarea,
.confirm-gate input[type=text],.confirm-gate input:not([type]){
  background:#fff!important;color:#111!important;border-color:#ddd!important;box-shadow:none!important
}
.primary{background:#111!important;color:#fff!important;border-color:#111!important}
.primary:hover{background:#2b2b2b!important}.secondary:hover,.tiny:hover{background:#f3f3f3!important}
.session-pill,.badge,.empty,.riskbox>div,.detail-grid>div,.cleanup-total,
.progress-panel,.good-note,.guidance-note,.page-help,.global-search-wrap>kbd,
.intel-summary>div,.graph-wrap,.identity-strip>div,.behavior-summary>div,
.baseline-grid>div,.trend-wrap,.trust-summary>div,.quick-metrics>div,
.deep-search-link,.search-help code,.search-cheats code,.action-warning,
.consequence-box,.confirm-values>div,.action-result,.story-summary,.notice{
  background:#f6f6f6!important;color:#111!important;border-color:#ddd!important;box-shadow:none!important
}
.action-warning,.welcome-card,.quick-hero,.power-search-card,.change-hero,
.readiness-card,.hardware-hero,.privacy-hardware{border-left-color:#111!important}
.badge.good,.badge.warn,.badge.bad{background:#f1f1f1!important;color:#111!important;border-color:#ddd!important}
.metric-progress::-webkit-progress-value,.mini-progress::-webkit-progress-value{background:#111!important}
.metric-progress::-moz-progress-bar,.mini-progress::-moz-progress-bar{background:#111!important}
.graph-edge{stroke:#bbb!important}.graph-node rect{fill:#fff!important;stroke:#bbb!important}
.graph-node.review rect,.graph-node.high rect{stroke:#111!important}
.trend-line{stroke:#111!important}.trend-dot{fill:#fff!important;stroke:#111!important}
.spinner{border-color:#d0d0d0!important;border-top-color:#111!important}
*{text-shadow:none!important}

/* The native window minimum is 920px. Keep a sidebar throughout that range so
   resizing does not cross the web UI's legacy 980px layout breakpoint. */
@media (max-width:980px) and (min-width:761px){
  .app{grid-template-columns:220px minmax(0,1fr)!important}
  .sidebar{height:100vh!important;position:sticky!important;top:0!important;padding:18px 10px!important}
  .sidebar nav{display:block!important;overflow:visible!important}
  .sidebar-actions{display:block!important}.privacy{display:flex!important}
  .nav{width:100%!important;white-space:normal!important}main{padding:20px!important}
}
@media (max-width:760px){
  .app{grid-template-columns:1fr!important}
  .sidebar{height:auto!important;position:static!important;border-right:0!important;border-bottom:1px solid #ddd!important}
  .sidebar nav{display:flex!important;overflow-x:auto!important;gap:4px!important}
  .nav{width:auto!important;white-space:nowrap!important}.nav-group-label{display:none!important}
  .privacy,.sidebar-actions{display:none!important}
}
@media (prefers-color-scheme:dark){
  :root{--bg:#0d0d0d!important;--panel:#121212!important;--text:#f4f4f4!important;--muted:#aaa!important;--line:#303030!important;--accent:#f4f4f4!important;--soft:#1b1b1b!important;--sidebar:#0d0d0d!important}
  html,body,.app,main,.sidebar{background:#0d0d0d!important;color:#f4f4f4!important}
  .sidebar{border-color:#303030!important}.brandmark{background:#f4f4f4!important;color:#111!important;border-color:#f4f4f4!important}.brand strong{color:#f4f4f4!important}
  .nav{color:#bdbdbd!important}.nav:hover{background:#1b1b1b!important;color:#f4f4f4!important}.nav.active{background:#f4f4f4!important;color:#111!important}
  .card,.secondary,.tiny,.controls select,.controls input,.filter,.global-search-wrap>input,
  .change-controls select,.change-controls textarea,.confirm-gate input[type=text],
  .confirm-gate input:not([type]),.side-action{background:#121212!important;color:#f4f4f4!important;border-color:#303030!important}
  .session-pill,.badge,.empty,.riskbox>div,.detail-grid>div,.cleanup-total,.progress-panel,
  .good-note,.guidance-note,.page-help,.global-search-wrap>kbd,.intel-summary>div,.graph-wrap,
  .identity-strip>div,.behavior-summary>div,.baseline-grid>div,.trend-wrap,.trust-summary>div,
  .quick-metrics>div,.deep-search-link,.search-help code,.search-cheats code,.action-warning,
  .consequence-box,.confirm-values>div,.action-result,.story-summary,.notice{
    background:#1a1a1a!important;color:#f4f4f4!important;border-color:#303030!important
  }
  .primary{background:#f4f4f4!important;color:#111!important;border-color:#f4f4f4!important}
  .badge.good,.badge.warn,.badge.bad{background:#1a1a1a!important;color:#f4f4f4!important;border-color:#303030!important}
  .graph-node rect,.trend-dot{fill:#121212!important;stroke:#666!important}
  .metric-progress::-webkit-progress-value,.mini-progress::-webkit-progress-value{background:#f4f4f4!important}
  .metric-progress::-moz-progress-bar,.mini-progress::-moz-progress-bar{background:#f4f4f4!important}
}
`;

  function installStyle(){
    if(document.getElementById('sentinel-desktop-refinement')) return;
    const style=document.createElement('style');
    style.id='sentinel-desktop-refinement';
    style.textContent=css;
    (document.head||document.documentElement).appendChild(style);
  }

  function applyOnce(){
    installStyle();
    document.title='Sentinel Mac';
    const mode=document.querySelector('.mode-switch');
    if(mode) mode.setAttribute('hidden','');
    const brand=document.querySelector('.brand strong');
    if(brand) brand.textContent='Sentinel Mac';
    const brandSub=document.querySelector('.brand small');
    if(brandSub) brandSub.textContent='System Intelligence · v2.2';
    const nav=document.querySelector('.sidebar nav');
    if(nav&&!document.getElementById('coreToolsLabel')){
      const label=document.createElement('div');
      label.id='coreToolsLabel';label.className='nav-group-label';label.textContent='Core tools';
      nav.insertBefore(label,nav.firstChild);
    }
    const advancedLabel=document.querySelector('.nav-group-label.advanced-nav');
    if(advancedLabel) advancedLabel.textContent='Advanced tools';
  }

  installStyle();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',applyOnce,{once:true});
  else applyOnce();
})();
