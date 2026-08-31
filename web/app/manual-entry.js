// SPDX-License-Identifier: MPL-2.0
// Navigation/bootstrap glue for the Sentinel 2.5 in-app User Manual.
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) throw new Error('Sentinel application core did not load before Manual navigation.');

  const limits = S.MISSIONS.find(m => m.id === 'limits');
  if (limits && !limits.lenses.includes('manual')) limits.lenses.push('manual');
  S.LENSES.manual = {
    label:'Manual',
    verb:'LEARN',
    title:'How do I use every part of Sentinel?',
    rule:'Read the plain-language guide, jump to any section, then open the real feature directly.'
  };

  // Add Manual to the contextual navigation without creating a second action path.
  if (S.actionDock?.actions) {
    S.actionDock.actions.manual = [
      {label:'Status', lens:'status', primary:true},
      {label:'Easy Scan', lens:'snapshot'},
      {label:'Full Scan', scan:'full'},
      {label:'Visibility', lens:'visibility'},
    ];
    for (const lens of ['status','visibility','guide']) {
      const actions = S.actionDock.actions[lens];
      if (Array.isArray(actions) && !actions.some(x => x.lens === 'manual')) {
        actions.push({label:'Manual', lens:'manual'});
      }
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('#manualButton');
    if (!button) return;
    event.preventDefault();
    if (typeof S.navigate === 'function') S.navigate('manual');
  });
})();
