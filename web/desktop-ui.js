// SPDX-License-Identifier: MPL-2.0
(() => {
  // This layer is intentionally presentation-only. It must not remove or replace
  // elements that web/app.js depends on, and it must preserve fetch semantics.
  if (window.__sentinelDesktopUIInstalled) return;
  window.__sentinelDesktopUIInstalled = true;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/desktop-ui.css';
  css.id = 'sentinel-desktop-ui-css';
  document.head.appendChild(css);

  // Keep compatibility nodes in the DOM for app.js, but make one unified nav.
  // The stylesheet hides the old Easy/Advanced control without deleting it.
  document.body.classList.remove('easy-mode');
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
  let stillWorkingTimer = null;

  const labelForRequest = input => {
    let url = '';
    try {
      url = typeof input === 'string' ? input : (input?.url || '');
    } catch {}
    const labels = [
      ['/api/quick-check', 'Running Quick Check…'],
      ['/api/system-profile', 'Reading system profile…'],
      ['/api/security/audit', 'Running security audit…'],
      ['/api/storage/scan', 'Starting storage scan…'],
      ['/api/storage/jobs', 'Updating scan progress…'],
      ['/api/search/deep', 'Searching filenames…'],
      ['/api/weakness-audit', 'Running weakness audit…'],
      ['/api/guided-snapshot', 'Capturing monitoring snapshot…'],
      ['/api/integrity/inspect', 'Inspecting integrity…'],
      ['/api/self/integrity', 'Inspecting Sentinel integrity…'],
      ['/api/intelligence/graph', 'Building intelligence graph…'],
      ['/api/behavior', 'Loading behavior evidence…'],
      ['/api/trust', 'Loading trust evidence…'],
      ['/api/processes', 'Loading processes…'],
      ['/api/startup', 'Loading startup items…'],
      ['/api/network', 'Loading network activity…'],
      ['/api/background', 'Loading background items…'],
      ['/api/persistence', 'Checking persistence…'],
      ['/api/actions', 'Working on Safe Actions…'],
      ['/api/changes', 'Working on Change Monitor…'],
      ['/api/incidents', 'Building incident evidence…'],
      ['/api/readiness', 'Checking Sentinel readiness…'],
      ['/api/report/export', 'Building local report…'],
      ['/api/diagnostics/export', 'Building diagnostics…'],
      ['/api/cleanup/preview', 'Analyzing cleanup candidates…']
    ];
    return labels.find(([prefix]) => url.startsWith(prefix))?.[1] || 'Sentinel is working locally…';
  };

  const show = (message, isError = false) => {
    clearTimeout(hideTimer);
    status.classList.toggle('error', isError);
    bar.classList.add('visible');
    status.textContent = message;
    status.classList.add('visible');
  };

  const hideSoon = (delay = 320) => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (active !== 0) return;
      clearTimeout(stillWorkingTimer);
      bar.classList.remove('visible');
      status.classList.remove('visible', 'error');
      document.querySelectorAll('button[data-sentinel-pending="1"]').forEach(button => {
        button.removeAttribute('data-sentinel-pending');
      });
    }, delay);
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    active += 1;
    const message = labelForRequest(args[0]);
    show(active > 1 ? `Sentinel is working… ${active} local requests` : message);
    clearTimeout(stillWorkingTimer);
    stillWorkingTimer = setTimeout(() => {
      if (active > 0) show('Still working locally… this task is taking longer than usual.');
    }, 7000);

    try {
      return await originalFetch(...args);
    } catch (error) {
      show(`Local request failed: ${error?.message || 'unknown error'}`, true);
      throw error;
    } finally {
      active = Math.max(0, active - 1);
      if (active === 0) hideSoon();
      else show(`Sentinel is working… ${active} local requests`);
    }
  };

  // Give every visible button immediate acknowledgement. This is deliberately
  // passive: it does not preventDefault, stopPropagation, replace handlers, or
  // alter the button's ID/class, so core app.js remains authoritative.
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    button.dataset.sentinelPending = '1';
    const name = (button.textContent || 'action').trim().replace(/\s+/g, ' ');
    show(button.classList.contains('nav') || button.hasAttribute('data-go') ? `Opening ${name}…` : `Starting: ${name}…`);
    setTimeout(() => {
      if (active === 0) {
        button.removeAttribute('data-sentinel-pending');
        hideSoon(180);
      }
    }, 650);
  }, true);

  const reportInterfaceError = detail => {
    const message = `Interface error: ${detail || 'unknown error'}`;
    console.error(message);
    show(message, true);
    const notice = document.getElementById('notice');
    if (notice) {
      notice.textContent = message;
      notice.classList.remove('hidden');
    }
  };

  window.addEventListener('error', event => {
    reportInterfaceError(event.message || event.error?.message);
  });
  window.addEventListener('unhandledrejection', event => {
    reportInterfaceError(event.reason?.message || String(event.reason || 'unhandled promise rejection'));
  });
})();
