// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';

  const S = window.SentinelApp;
  if (!S) return;

  const MARKER = 'Sentinel OpenPenguin Evidence Bridge v1';
  const CONTEXT_SCHEMA = 'sentinel.system-evidence-context/v1';
  const state = {
    status: null,
    checking: false,
    asking: false,
    model: localStorage.getItem('sentinel.openguin.model') || '',
    lastAnswer: '',
    lastRequestId: '',
    error: '',
  };

  function esc(value) { return S.esc ? S.esc(value) : String(value ?? ''); }

  async function refreshStatus() {
    if (state.checking) return state.status;
    state.checking = true;
    try {
      state.status = await S.api('/api/ai/openguin/status');
      state.error = '';
      const models = Array.isArray(state.status?.models) ? state.status.models.filter(Boolean) : [];
      if (!state.model || !models.includes(state.model)) state.model = models[0] || '';
      if (state.model) localStorage.setItem('sentinel.openguin.model', state.model);
      return state.status;
    } catch (error) {
      state.status = {available:false, mode:'sentinel-webllm-fallback'};
      state.error = error?.message || String(error);
      return state.status;
    } finally {
      state.checking = false;
      renderIntoAssistant();
    }
  }

  function contextEnvelope(packet) {
    return {
      schema: CONTEXT_SCHEMA,
      source_app: {name:'Sentinel', role:'system-evidence-authority'},
      generated_at: new Date().toISOString(),
      evidence_packet: packet,
      authority: {
        observed_evidence: 'Sentinel',
        ai_output: 'interpretation only',
        actions: 'Sentinel Safe Change approval path only',
      },
      output_contract: ['OBSERVED','INTERPRETATION','UNKNOWN','NEXT STEP'],
      boundary: 'Evidence is not a verdict. Missing visibility remains unknown. AI cannot execute commands or Safe Change actions.',
    };
  }

  async function ask(question, options={}) {
    if (state.asking) throw new Error('OpenPenguin advisory is already running.');
    const status = state.status?.available ? state.status : await refreshStatus();
    if (!status?.available) throw new Error('OpenPenguin is unavailable. Sentinel WebLLM remains available as the independent fallback.');
    const model = String(options.model || state.model || '').trim();
    if (!model) throw new Error('OpenPenguin has no available local model.');
    const q = String(question || '').trim();
    if (!q) throw new Error('Ask a question first.');
    const packet = options.packet || S.localAI?.state?.pinnedPacket || await S.localAI?.collectEvidencePacket?.({question:q});
    if (!packet) throw new Error('Sentinel could not build a bounded Evidence Packet.');

    state.asking = true;
    state.error = '';
    state.lastAnswer = '';
    renderIntoAssistant();
    try {
      const response = await S.api('/api/ai/openguin/advisory', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          context: contextEnvelope(packet),
          question:q,
          model,
          temperature:0.18,
        }),
      });
      if (response?.executed !== false) throw new Error('OpenPenguin response violated the advisory-only contract.');
      state.lastAnswer = String(response?.answer || '').trim();
      state.lastRequestId = String(response?.request_id || '');
      if (!state.lastAnswer) throw new Error('OpenPenguin returned no advisory text.');
      return response;
    } catch (error) {
      state.error = error?.message || String(error);
      throw error;
    } finally {
      state.asking = false;
      renderIntoAssistant();
    }
  }

  function panelHTML() {
    const status = state.status;
    const online = Boolean(status?.available);
    const models = Array.isArray(status?.models) ? status.models : [];
    const options = models.map(model => `<option value="${esc(model)}" ${model===state.model?'selected':''}>${esc(model)}</option>`).join('');
    return `<section id="openguinInfrastructurePanel" class="s24-band" data-openguin-marker="${MARKER}">
      <div class="s24-band-index">OP</div>
      <div class="s24-band-body">
        <div class="s24-band-head"><div><h2>OpenPenguin Infrastructure</h2><p>Optional shared local-AI backend. Sentinel remains the evidence authority; OpenPenguin only interprets a bounded Evidence Packet.</p></div><button type="button" class="s24-action" data-openguin-refresh>${state.checking?'Checking…':'Refresh'}</button></div>
        <div class="ai-status">
          <div class="ai-status-row"><span>Status</span><b>${online?'ONLINE':'UNAVAILABLE · WebLLM fallback'}</b></div>
          <div class="ai-status-row"><span>Transport</span><b>Sentinel authenticated localhost proxy → OpenPenguin 11436</b></div>
          <div class="ai-status-row"><span>Authority</span><b>Advisory only · no shell / Safe Change execution</b></div>
          <div class="ai-status-row"><span>Context schema</span><b>${CONTEXT_SCHEMA}</b></div>
        </div>
        ${online?`<label class="ai-level"><span>OpenPenguin model</span><select data-openguin-model>${options}</select><small>Models are managed by OpenPenguin's private local runtime.</small></label>`:''}
        <form data-openguin-form class="ai-compose">
          <textarea data-openguin-question required placeholder="Ask OpenPenguin about the current/pinned Sentinel evidence…"></textarea>
          <button class="s24-action primary" type="submit" ${!online||state.asking?'disabled':''}>${state.asking?'Reasoning locally…':'Ask via OpenPenguin'}</button>
        </form>
        ${state.error?`<div class="ai-boundary"><b>OpenPenguin unavailable/error:</b> ${esc(state.error)}<br>Sentinel's WebLLM path remains independent.</div>`:''}
        ${state.lastAnswer?`<div class="ai-message"><span>OPENPENGUIN · ADVISORY${state.lastRequestId?` · ${esc(state.lastRequestId)}`:''}</span><pre>${esc(state.lastAnswer)}</pre></div>`:''}
        <div class="ai-boundary">OpenPenguin receives bounded Sentinel evidence, not unrestricted filesystem or shell access. Its answer is interpretation, never a malware verdict or an executed action.</div>
      </div>
    </section>`;
  }

  function renderIntoAssistant() {
    const stage = document.querySelector('#evidenceStage');
    if (!stage || S.state?.lens !== 'assistant') return;
    const existing = stage.querySelector('#openguinInfrastructurePanel');
    const shell = stage.querySelector('.ai-shell')?.closest('.s24-band');
    if (!shell) return;
    const holder = document.createElement('div');
    holder.innerHTML = panelHTML();
    const next = holder.firstElementChild;
    if (existing) existing.replaceWith(next);
    else shell.insertAdjacentElement('afterend', next);
  }

  document.addEventListener('change', event => {
    const select = event.target.closest?.('[data-openguin-model]');
    if (!select) return;
    state.model = select.value;
    localStorage.setItem('sentinel.openguin.model', state.model);
  });

  document.addEventListener('click', event => {
    if (!event.target.closest?.('[data-openguin-refresh]')) return;
    event.preventDefault();
    refreshStatus().catch(() => {});
  });

  document.addEventListener('submit', async event => {
    const form = event.target.closest?.('[data-openguin-form]');
    if (!form) return;
    event.preventDefault();
    const question = form.querySelector('[data-openguin-question]')?.value?.trim();
    if (!question) return;
    try {
      await ask(question);
      const box = form.querySelector('[data-openguin-question]');
      if (box) box.value = '';
    } catch (error) {
      S.notice?.(error?.message || String(error));
    }
  });

  const observer = new MutationObserver(() => renderIntoAssistant());
  const stage = document.querySelector('#evidenceStage');
  if (stage) observer.observe(stage, {childList:true, subtree:false});

  S.openPenguinAI = {MARKER, CONTEXT_SCHEMA, state, refreshStatus, contextEnvelope, ask, renderIntoAssistant};
  setTimeout(() => refreshStatus().catch(() => {}), 500);
})();
