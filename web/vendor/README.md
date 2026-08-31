# Vendored WebLLM runtime

Sentinel 2.6 vendors `@mlc-ai/web-llm` version `0.2.82` from the official npm package.

- Runtime: `webllm-0.2.82.mjs` copied from npm package `lib/index.js`.
- License: Apache-2.0; see `WEBLLM-LICENSE.txt`.
- Purpose: serve the WebLLM JavaScript runtime from Sentinel's own loopback origin so Browser and WKWebView App View never cross-origin import executable AI runtime code.
- Model weights are not bundled; a model is downloaded only after the user explicitly selects and loads it, then WebLLM reuses its local cache.
