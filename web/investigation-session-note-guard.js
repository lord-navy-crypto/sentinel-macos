// SPDX-License-Identifier: MPL-2.0
(() => {
  const originalFetch = window.fetch.bind(window);
  let explicitNoteSave = false;
  const note = () => document.getElementById('sessionNote');

  // Capture runs before the page's target click handlers even though this
  // compatibility guard is loaded after investigation.js.
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('button,a') : null;
    if (!target) return;
    if (target.id === 'saveSession' || target.id === 'bookmarkBranch') {
      explicitNoteSave = true;
      return;
    }
    if (target.id === 'branchBack' || target.id === 'branchForward' || target.closest('#candidateList') || target.closest('#nextTargetList') || target.closest('#sessionList')) {
      const field = note(); if (field) field.value = '';
    }
  }, true);

  const form = document.getElementById('investigationForm');
  if (form) form.addEventListener('submit', () => { const field = note(); if (field) field.value = ''; }, true);

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = String(init.method || 'GET').toUpperCase();
    if (method === 'POST' && url.includes('/api/security/investigate?mode=sessions') && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        if (Object.prototype.hasOwnProperty.call(body, 'note')) {
          if (explicitNoteSave) {
            explicitNoteSave = false;
          } else {
            // Background branch autosave records the path/parent/visit without
            // copying whatever note text was left from the previous branch.
            body.note = '';
            init = {...init, body: JSON.stringify(body)};
          }
        }
      } catch {
        // Leave non-JSON requests untouched; the server still validates them.
      }
    }
    return originalFetch(input, init);
  };
})();
