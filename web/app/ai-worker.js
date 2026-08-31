// SPDX-License-Identifier: MPL-2.0
// Sentinel 2.6 Local AI worker. Heavy WebLLM/WebGPU work stays off the main UI thread.
'use strict';

const pending = [];
let handler = null;
let bootstrapError = null;

self.onmessage = event => {
  if (handler) {
    handler.onmessage(event);
    return;
  }
  if (bootstrapError) {
    // The WebLLM proxy will time out/fail cleanly on the caller side; keep the
    // worker alive long enough for the UI to report that Local AI is unavailable.
    return;
  }
  pending.push(event);
};

import('/vendor/webllm-0.2.82.mjs')
  .then(webllm => {
    handler = new webllm.WebWorkerMLCEngineHandler();
    for (const event of pending.splice(0)) handler.onmessage(event);
  })
  .catch(error => {
    bootstrapError = error;
    console.error('Sentinel Local AI worker failed to load WebLLM:', error);
  });
