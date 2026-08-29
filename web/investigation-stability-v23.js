// SPDX-License-Identifier: MPL-2.0
(() => {
  const start = document.getElementById('startInvestigation');
  const form = document.getElementById('investigationForm');
  const notice = document.getElementById('notice');
  if (!start || !form) return;

  const savedDisabled = new WeakMap();
  const actionPattern = /^(Continue|Continue from here|Investigate running executable|Investigate plist|Open branch|Resume Session|Open Root)$/;

  function isContinuationButton(button) {
    return button instanceof HTMLButtonElement && actionPattern.test((button.textContent || '').trim());
  }

  function continuationButtons() {
    return Array.from(document.querySelectorAll('#candidateList button, #nextTargetList button, #runtimeContextBody button, #sessionList button'))
      .filter(isContinuationButton);
  }

  function targetFor(button) {
    const row = button.closest('.next-target, .candidate');
    return row?.querySelector('.target-path, code')?.textContent?.trim() || '';
  }

  function busy() {
    return start.disabled || (start.textContent || '').includes('Investigating');
  }

  function syncBusyState() {
    const running = busy();
    document.documentElement.classList.toggle('investigation-is-busy', running);
    for (const button of continuationButtons()) {
      if (running) {
        if (!savedDisabled.has(button)) savedDisabled.set(button, button.disabled);
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
      } else {
        if (savedDisabled.has(button)) {
          button.disabled = savedDisabled.get(button);
          savedDisabled.delete(button);
        }
        button.removeAttribute('aria-busy');
      }
    }
  }

  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!isContinuationButton(button)) return;
    if (busy()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (notice) notice.textContent = 'An investigation is already running. Wait for the current branch to finish before continuing.';
      return;
    }
    const path = targetFor(button);
    window.setTimeout(() => {
      if (notice && busy()) notice.textContent = path ? `Investigating ${path}…` : 'Investigating the selected branch…';
      syncBusyState();
    }, 0);
  }, true);

  form.addEventListener('submit', event => {
    if (!busy()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (notice) notice.textContent = 'An investigation is already running. Wait for the current branch to finish before starting another one.';
  }, true);

  const observer = new MutationObserver(syncBusyState);
  observer.observe(start, {attributes: true, childList: true, characterData: true, subtree: true});
  for (const id of ['candidateList', 'nextTargetList', 'runtimeContextBody', 'sessionList']) {
    const node = document.getElementById(id);
    if (node) observer.observe(node, {childList: true, subtree: true});
  }
  syncBusyState();
})();
