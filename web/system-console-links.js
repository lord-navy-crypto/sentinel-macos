// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const launch = document.getElementById('launchServicesRecipe');
  const processes = document.getElementById('processRelationsRecipe');
  if (launch && token) {
    launch.href = `/launch-services.html#token=${encodeURIComponent(token)}`;
  }
  if (processes && token) {
    processes.href = `/process-relations.html#token=${encodeURIComponent(token)}`;
  }
})();
