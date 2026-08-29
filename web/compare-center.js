// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const hash = token ? `#token=${encodeURIComponent(token)}` : '';
  if (!token) {
    const notice = document.getElementById('notice');
    if (notice) notice.textContent = 'Missing Sentinel session token. Open Compare from the running Sentinel app.';
  }
  for (const link of document.querySelectorAll('[data-path]')) {
    link.href = `${link.dataset.path}${hash}`;
  }
})();
