// SPDX-License-Identifier: MPL-2.0
(() => {
  if (window.__sentinelProcessRelationsBridgeInstalled) return;
  window.__sentinelProcessRelationsBridgeInstalled = true;

  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const panel = document.getElementById('runtimeContextPanel');
  if (!panel || !token) return;

  function processURL(pid) {
    return `/process-relations.html#${new URLSearchParams({token, pid: String(pid)}).toString()}`;
  }

  function attachProcessButtons() {
    for (const card of panel.querySelectorAll('article.candidate')) {
      if (card.querySelector('.open-process-relations')) continue;
      const heading = card.querySelector('.candidate-head h3');
      const match = String(heading?.textContent || '').match(/^PID\s+(\d+)\b/);
      if (!match) continue;
      const pid = Number(match[1]);
      if (!Number.isSafeInteger(pid) || pid <= 0) continue;

      let actions = card.querySelector('.candidate-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'candidate-actions';
        card.append(actions);
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'open-process-relations';
      button.textContent = 'Open Process Explorer';
      button.title = 'Follow this PID through parent/child processes, open objects, TCP evidence, and persistence.';
      button.addEventListener('click', () => {
        location.href = processURL(pid);
      });
      actions.append(button);
    }
  }

  const observer = new MutationObserver(attachProcessButtons);
  observer.observe(panel, {childList: true, subtree: true});
  attachProcessButtons();
})();
