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
    // Do not silently swallow requests after bootstrap failure. Surface the
    // failure through the worker error channel so the parent can stop waiting.
    throw bootstrapError;
  }
  pending.push(event);
};

import('/vendor/webllm-0.2.82.mjs')
  .then(webllm => {
    handler = new webllm.WebWorkerMLCEngineHandler();
    for (const event of pending.splice(0)) handler.onmessage(event);
  })
  .catch(error => {
    bootstrapError = error instanceof Error ? error : new Error(String(error));
    console.error('Sentinel Local AI worker failed to load WebLLM:', bootstrapError);
    // Convert a previously silent dynamic-import failure into a real Worker
    // error event. The Local AI reliability watchdog listens for this and can
    // terminate/reset the stalled engine instead of leaving the UI spinning.
    setTimeout(() => { throw bootstrapError; }, 0);
  });
