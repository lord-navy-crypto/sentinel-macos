// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const withToken = route => token ? `${route}#token=${encodeURIComponent(token)}` : route;
  for (const id of ['backToTerminal', 'footerBackToTerminal']) {
    const link = document.getElementById(id);
    if (link) link.href = withToken('/system-console.html');
  }
})();
