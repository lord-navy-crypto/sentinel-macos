// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const launch = document.getElementById('launchServicesRecipe');
  const processes = document.getElementById('processRelationsRecipe');
  const network = document.getElementById('networkRelationsRecipe');
  const control = document.getElementById('controlPlaneRecipe');
  const guide = document.getElementById('terminalGuideLink');
  if (launch && token) launch.href = `/launch-services.html#token=${encodeURIComponent(token)}`;
  if (processes && token) processes.href = `/process-relations.html#token=${encodeURIComponent(token)}`;
  if (network && token) network.href = `/network-relations.html#token=${encodeURIComponent(token)}`;
  if (control && token) control.href = `/system-center.html#token=${encodeURIComponent(token)}`;
  if (guide && token) guide.href = `/terminal-guide.html#token=${encodeURIComponent(token)}`;
})();
