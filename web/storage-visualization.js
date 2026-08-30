// SPDX-License-Identifier: MPL-2.0
(() => {
  const history = document.getElementById('storageHistory');
  const aging = document.getElementById('storageAging');
  if (!history || !aging) return;

  const units = {B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4};
  const parseBytes = text => {
    const match = String(text || '').match(/([+-]?\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)\b/i);
    if (!match) return 0;
    return Number(match[1]) * (units[match[2].toUpperCase()] || 1);
  };

  function makeBar(value, max, kind, label) {
    const bar = document.createElement('div');
    bar.className = `quant-bar ${kind}`;
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', label);
    const fill = document.createElement('span');
    fill.className = 'quant-bar-fill';
    const pct = max > 0 ? Math.min(100, Math.abs(value) / max * 100) : 0;
    fill.style.width = `${pct.toFixed(1)}%`;
    bar.append(fill);
    return bar;
  }

  function enhanceHistory() {
    const deltas = Array.from(history.querySelectorAll('.delta-positive, .delta-negative'));
    const values = deltas.map(node => parseBytes(node.textContent));
    const max = Math.max(0, ...values.map(Math.abs));
    deltas.forEach((node, index) => {
      if (node.dataset.quantified === 'true') return;
      const value = values[index];
      const wrap = document.createElement('div');
      wrap.className = 'quant-row';
      const copy = document.createElement('div');
      copy.className = 'quant-copy';
      const clone = node.cloneNode(true);
      clone.removeAttribute('class');
      copy.append(clone);
      const kind = value < 0 ? 'reduction' : 'growth';
      wrap.append(copy, makeBar(value, max, kind, `${node.textContent.trim()} relative magnitude`));
      node.dataset.quantified = 'true';
      node.replaceWith(wrap);
    });
  }

  function enhanceAging() {
    const rows = Array.from(aging.querySelectorAll('.row')).filter(row => /retained large file\(s\)/i.test(row.textContent || ''));
    const values = rows.map(row => parseBytes(row.textContent));
    const max = Math.max(0, ...values.map(Math.abs));
    rows.forEach((row, index) => {
      if (row.dataset.quantified === 'true') return;
      row.dataset.quantified = 'true';
      row.classList.add('quant-row');
      const main = row.querySelector('.row-main');
      if (main) main.classList.add('quant-copy');
      row.append(makeBar(values[index], max, 'age', `${row.textContent.trim()} relative bytes`));
    });
  }

  const enhance = () => {
    enhanceHistory();
    enhanceAging();
  };

  const observer = new MutationObserver(enhance);
  observer.observe(history, {childList: true, subtree: true});
  observer.observe(aging, {childList: true, subtree: true});
  enhance();
})();
