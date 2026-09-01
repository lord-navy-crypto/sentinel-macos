from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# Full Scan: stage telemetry, retained last-run summary, Runtime Logs, Workbench bridge.
p = Path('web/app/full-scan.js')
s = p.read_text()
s = replace_once(
    s,
    "    completedAt: 0,\n    outcome: 'IDLE',\n  };\n\n  async function structured",
    "    completedAt: 0,\n    outcome: 'IDLE',\n    lastSummary: null,\n  };\n\n  const FULL_SCAN_LAST_RUN_KEY = 'sentinel.fullScan.lastRun.v1';\n\n  function emitRuntimeLog(level, event, message, fields = {}) {\n    if (typeof S.runtimeLog === 'function') void S.runtimeLog(level, 'scan', event, message, fields);\n  }\n\n  function readLastScanSummary() {\n    try { return JSON.parse(localStorage.getItem(FULL_SCAN_LAST_RUN_KEY) || 'null'); } catch { return null; }\n  }\n\n  function persistFullScanSummary() {\n    const counts = {done: 0, limited: 0, failed: 0, cancelled: 0};\n    const stages = fullScan.stages.map(stage => {\n      if (Object.prototype.hasOwnProperty.call(counts, stage.status)) counts[stage.status]++;\n      return {\n        id: stage.id, label: stage.label, status: stage.status, detail: stage.detail || '',\n        started_at: stage.startedAt ? new Date(stage.startedAt).toISOString() : '',\n        completed_at: stage.completedAt ? new Date(stage.completedAt).toISOString() : '',\n        duration_ms: Number(stage.durationMs || 0),\n      };\n    });\n    const summary = {\n      version: 1, outcome: fullScan.outcome,\n      started_at: fullScan.startedAt ? new Date(fullScan.startedAt).toISOString() : '',\n      completed_at: fullScan.completedAt ? new Date(fullScan.completedAt).toISOString() : '',\n      duration_ms: Math.max(0, Number(fullScan.completedAt || Date.now()) - Number(fullScan.startedAt || Date.now())),\n      counts, stages,\n    };\n    fullScan.lastSummary = summary;\n    try { localStorage.setItem(FULL_SCAN_LAST_RUN_KEY, JSON.stringify(summary)); } catch {}\n    const level = summary.outcome === 'FAILED' ? 'error' : summary.outcome === 'LIMITED' ? 'warn' : 'info';\n    emitRuntimeLog(level, 'full-scan-finished', `Full Scan ${summary.outcome}.`, {\n      outcome: summary.outcome, duration_ms: summary.duration_ms, done: counts.done, limited: counts.limited, failed: counts.failed, cancelled: counts.cancelled,\n    });\n    if (S.Workbench && typeof S.Workbench.recordEvent === 'function') {\n      S.Workbench.recordEvent('full-scan', `Full Scan ${summary.outcome}.`, {outcome: summary.outcome, duration_ms: summary.duration_ms, ...counts});\n    }\n    return summary;\n  }\n\n  fullScan.lastSummary = readLastScanSummary();\n\n  async function structured",
    'full scan summary helpers',
)
s = replace_once(
    s,
    "    fullScan.stages = scanStages().map(stage => ({...stage, status: 'pending', detail: ''}));\n    const host = $('#fullScanProgress');",
    "    fullScan.stages = scanStages().map(stage => ({...stage, status: 'pending', detail: '', startedAt: 0, completedAt: 0, durationMs: 0}));\n    emitRuntimeLog('info', 'full-scan-start', 'Full Scan started by explicit user action.', {stage_count: fullScan.stages.length});\n    const host = $('#fullScanProgress');",
    'full scan start telemetry',
)
s = replace_once(
    s,
    "      stage.status = 'running';\n      stage.detail = 'Collecting bounded local evidence…';",
    "      stage.status = 'running';\n      stage.startedAt = Date.now();\n      stage.completedAt = 0;\n      stage.durationMs = 0;\n      stage.detail = 'Collecting bounded local evidence…';\n      emitRuntimeLog('info', 'full-scan-stage-start', stage.label, {stage: stage.id});",
    'stage start telemetry',
)
s = replace_once(
    s,
    "        await stage.run();\n        stage.status = 'done';\n        stage.detail = 'Captured successfully';",
    "        await stage.run();\n        stage.status = 'done';\n        stage.completedAt = Date.now();\n        stage.durationMs = Math.max(0, stage.completedAt - stage.startedAt);\n        stage.detail = `Captured successfully · ${(stage.durationMs / 1000).toFixed(1)} s`;\n        emitRuntimeLog('info', 'full-scan-stage-finished', stage.label, {stage: stage.id, status: stage.status, duration_ms: stage.durationMs});",
    'stage success telemetry',
)
s = replace_once(
    s,
    "          stage.status = 'cancelled';\n          stage.detail = 'Cancelled by user';\n          break;",
    "          stage.status = 'cancelled';\n          stage.completedAt = Date.now();\n          stage.durationMs = stage.startedAt ? Math.max(0, stage.completedAt - stage.startedAt) : 0;\n          stage.detail = 'Cancelled by user';\n          emitRuntimeLog('warn', 'full-scan-stage-finished', stage.label, {stage: stage.id, status: stage.status, duration_ms: stage.durationMs});\n          break;",
    'stage cancelled telemetry',
)
s = replace_once(
    s,
    "        stage.status = classifyStageError(error);\n        stage.detail = error?.message || (stage.status === 'limited' ? 'Source unavailable or bounded' : 'Stage failed');",
    "        stage.status = classifyStageError(error);\n        stage.completedAt = Date.now();\n        stage.durationMs = stage.startedAt ? Math.max(0, stage.completedAt - stage.startedAt) : 0;\n        stage.detail = error?.message || (stage.status === 'limited' ? 'Source unavailable or bounded' : 'Stage failed');\n        emitRuntimeLog(stage.status === 'failed' ? 'error' : 'warn', 'full-scan-stage-finished', stage.label, {stage: stage.id, status: stage.status, duration_ms: stage.durationMs, detail: stage.detail});",
    'stage failure telemetry',
)
s = replace_once(
    s,
    "      fullScan.outcome = 'CANCELLED';\n      refreshProgress();\n      notice('Full Scan cancelled.",
    "      fullScan.outcome = 'CANCELLED';\n      refreshProgress();\n      persistFullScanSummary();\n      notice('Full Scan cancelled.",
    'cancel summary persistence',
)
s = replace_once(
    s,
    "      fullScan.outcome = 'FAILED';\n      refreshProgress();\n      notice(`Full Scan incomplete:",
    "      fullScan.outcome = 'FAILED';\n      refreshProgress();\n      persistFullScanSummary();\n      notice(`Full Scan incomplete:",
    'failed summary persistence',
)
s = replace_once(
    s,
    "    fullScan.outcome = limited > 0 ? 'LIMITED' : 'DONE';\n    refreshProgress();\n    notice(limited ?",
    "    fullScan.outcome = limited > 0 ? 'LIMITED' : 'DONE';\n    refreshProgress();\n    persistFullScanSummary();\n    notice(limited ?",
    'successful summary persistence',
)
s = replace_once(
    s,
    "    readBaselineState,\n    capabilityGroups: CAPABILITY_GROUPS,",
    "    readBaselineState,\n    readLastScanSummary,\n    capabilityGroups: CAPABILITY_GROUPS,",
    'scan center export',
)
p.write_text(s)

# Workbench: investigation activity timeline, workflow completeness, scan attachment, Runtime Logs.
p = Path('web/app/workbench.js')
s = p.read_text()
s = replace_once(
    s,
    "  const STORE_KEY = 'sentinel24-investigation-workbench-v1';\n  const FEATURES = [",
    "  const STORE_KEY = 'sentinel24-investigation-workbench-v1';\n  const FULL_SCAN_LAST_RUN_KEY = 'sentinel.fullScan.lastRun.v1';\n  const INVESTIGATION_CONTINUITY_MARKER = 'Sentinel 2.7 Investigation Continuity';\n  const FEATURES = [",
    'workbench continuity constants',
)
s = replace_once(
    s,
    "  function setSelection(next){if(!next)return;wb.selected={type:next.type||'evidence',path:next.path||'',pid:Number(next.pid||0),label:next.label||next.path||(next.pid?`PID ${next.pid}`:'Evidence'),at:Date.now()};saveStore();renderSelectionChip();highlightSelection();}",
    "  function setSelection(next){if(!next)return;wb.selected={type:next.type||'evidence',path:next.path||'',pid:Number(next.pid||0),label:next.label||next.path||(next.pid?`PID ${next.pid}`:'Evidence'),at:Date.now()};saveStore();recordEvent('selection','Evidence selected.',{type:wb.selected.type,label:wb.selected.label,pid:wb.selected.pid||0});renderSelectionChip();highlightSelection();}",
    'selection activity',
)
anchor = "  function currentInvestigation(){return wb.investigations.find(x=>x.id===wb.activeInvestigation)||null;}\n"
helpers = r'''  function currentInvestigation(){return wb.investigations.find(x=>x.id===wb.activeInvestigation)||null;}
  function wbRuntimeLog(level,event,message,fields={}){if(typeof S.runtimeLog==='function')void S.runtimeLog(level,'workbench',event,message,fields);}
  function recordEvent(kind,message,fields={}){
    wbRuntimeLog('info',`investigation-${kind}`,message,{investigation_id:wb.activeInvestigation||'',...fields});
    const active=currentInvestigation();if(!active)return null;
    active.events=Array.isArray(active.events)?active.events:[];
    const entry={id:uid('evt'),kind,message,fields,at:Date.now()};active.events.push(entry);
    if(active.events.length>200)active.events=active.events.slice(-200);
    active.updated=Date.now();saveStore();return entry;
  }
  function lastFullScan(){try{return JSON.parse(localStorage.getItem(FULL_SCAN_LAST_RUN_KEY)||'null');}catch{return null;}}
  function investigationCompleteness(inv=currentInvestigation()){
    if(!inv)return {score:0,done:[],missing:['Create or select an investigation']};
    const checks=[
      ['title',Boolean(String(inv.title||'').trim()),10,'Name the investigation'],
      ['hypothesis',Boolean(String(inv.hypothesis||'').trim()),20,'Write a hypothesis / question'],
      ['notes',Boolean(String(inv.notes||'').trim()),20,'Record investigation notes'],
      ['bookmarks',Boolean((inv.bookmarks||[]).length),20,'Bookmark relevant evidence'],
      ['activity',Boolean((inv.events||[]).length>=3),10,'Collect at least three investigation events'],
      ['scan',Boolean((inv.scanSnapshots||[]).length),20,'Attach a Full Scan summary'],
    ];
    const score=checks.reduce((n,[,ok,points])=>n+(ok?points:0),0);
    return {score,done:checks.filter(([,ok])=>ok).map(([id])=>id),missing:checks.filter(([,ok])=>!ok).map(([, , ,label])=>label)};
  }
  function investigationContinuityHTML(inv=currentInvestigation()){
    if(!inv)return '<div class="s24-note">No active investigation. Create one to retain activity, scan context, notes, hypotheses, and bookmarks together.</div>';
    const c=investigationCompleteness(inv),events=(inv.events||[]).slice(-12).reverse(),scan=lastFullScan(),attached=(inv.scanSnapshots||[]).length;
    const scanBlock=scan?ledger([['Last Full Scan',scan.outcome||'—'],['Duration',`${(Number(scan.duration_ms||0)/1000).toFixed(1)} s`],['Stages',`${Number(scan.counts?.done||0)} done · ${Number(scan.counts?.limited||0)} limited · ${Number(scan.counts?.failed||0)} failed`],['Attached summaries',attached]]):'<div class="s24-note">No retained Full Scan summary is available yet.</div>';
    const timeline=events.length?`<div class="wb-list">${events.map(e=>`<div class="wb-list-row"><div><b>${esc(e.message||e.kind)}</b><small>${esc(e.kind)} · ${esc(new Date(e.at).toLocaleString())}</small></div></div>`).join('')}</div>`:empty('No investigation activity recorded yet.');
    return `<div class="wb-completeness"><strong>${c.score}%</strong><div><span>workflow completeness</span><span>${c.missing.length?`${c.missing.length} next step(s)`:'ready for review'}</span></div><progress max="100" value="${c.score}"></progress></div><div class="s24-note">This completeness score describes investigation workflow coverage only. It is not a malware, risk, or safety score.</div>${c.missing.length?`<div class="wb-advice">${c.missing.map(x=>`<p>${esc(x)}</p>`).join('')}</div>`:''}${scanBlock}<div class="wb-actions">${panelButton('Attach last Full Scan','attach-last-full-scan')}${panelButton('Export investigation','export-investigation')}</div>${timeline}`;
  }
  function attachLastFullScan(){const inv=currentInvestigation();if(!inv)throw new Error('Create or select an investigation first.');const scan=lastFullScan();if(!scan)throw new Error('Run Full Scan before attaching scan context.');inv.scanSnapshots=Array.isArray(inv.scanSnapshots)?inv.scanSnapshots:[];if(!inv.scanSnapshots.some(x=>x.completed_at===scan.completed_at))inv.scanSnapshots.push(scan);if(inv.scanSnapshots.length>12)inv.scanSnapshots=inv.scanSnapshots.slice(-12);recordEvent('scan-attached',`Attached Full Scan ${scan.outcome||'summary'}.`,{outcome:scan.outcome||'',duration_ms:Number(scan.duration_ms||0)});notice('Last Full Scan summary attached to the active investigation.');return openWorkbench('investigations');}
'''
if anchor not in s:
    raise SystemExit('missing anchor: current investigation')
s = s.replace(anchor, helpers, 1)

# Add continuity sections after existing overview/investigation body assignments using line insertion.
lines = s.splitlines()
out=[]
added_overview=False
added_investigations=False
for line in lines:
    out.append(line)
    if "if(tab==='overview')body=" in line and not added_overview:
        out.append("    if(tab==='overview')body+=section('Investigation continuity',investigationContinuityHTML(currentInvestigation()),'Resume the current investigation with explicit workflow completeness and retained Full Scan context.');")
        added_overview=True
    if "if(tab==='investigations')body=" in line and not added_investigations:
        out.append("    if(tab==='investigations')body+=section('Investigation continuity & activity',investigationContinuityHTML(currentInvestigation()),'Recent local workflow events are retained with the active investigation.');")
        added_investigations=True
s='\n'.join(out)+'\n'
if not (added_overview and added_investigations):
    raise SystemExit('missing workbench tab insertion anchors')

replacements = [
    (
        "if(action==='set-compare-a'){if(!wb.selected)throw new Error('Select evidence first.');wb.compareA={...wb.selected};saveStore();return openWorkbench('overview');}",
        "if(action==='set-compare-a'){if(!wb.selected)throw new Error('Select evidence first.');wb.compareA={...wb.selected};saveStore();recordEvent('compare-a','Set Compare A.',{label:selectionLabel(wb.compareA)});return openWorkbench('overview');}",
        'compare A activity',
    ),
    (
        "if(action==='set-compare-b'){if(!wb.selected)throw new Error('Select evidence first.');wb.compareB={...wb.selected};saveStore();return openWorkbench('overview');}",
        "if(action==='set-compare-b'){if(!wb.selected)throw new Error('Select evidence first.');wb.compareB={...wb.selected};saveStore();recordEvent('compare-b','Set Compare B.',{label:selectionLabel(wb.compareB)});return openWorkbench('overview');}",
        'compare B activity',
    ),
    (
        "if(action==='new-investigation'){const x={id:uid('inv'),title:`Investigation ${wb.investigations.length+1}`,created:Date.now(),updated:Date.now(),notes:'',hypothesis:'',bookmarks:[]};wb.investigations.unshift(x);wb.activeInvestigation=x.id;saveStore();return openWorkbench('investigations');}",
        "if(action==='new-investigation'){const x={id:uid('inv'),title:`Investigation ${wb.investigations.length+1}`,created:Date.now(),updated:Date.now(),notes:'',hypothesis:'',bookmarks:[],events:[],scanSnapshots:[]};wb.investigations.unshift(x);wb.activeInvestigation=x.id;saveStore();recordEvent('created','Investigation created.',{title:x.title});return openWorkbench('investigations');}",
        'new investigation activity',
    ),
    (
        "if(action==='save-investigation'){const x=currentInvestigation();if(!x)return;x.title=$('#wbInvTitle')?.value.trim()||x.title;x.notes=$('#wbInvNotes')?.value||'';x.hypothesis=$('#wbInvHypothesis')?.value||'';x.updated=Date.now();saveStore();notice('Investigation saved.');return openWorkbench('investigations');}",
        "if(action==='save-investigation'){const x=currentInvestigation();if(!x)return;x.title=$('#wbInvTitle')?.value.trim()||x.title;x.notes=$('#wbInvNotes')?.value||'';x.hypothesis=$('#wbInvHypothesis')?.value||'';x.updated=Date.now();saveStore();recordEvent('saved','Investigation notes and hypothesis saved.',{title:x.title});notice('Investigation saved.');return openWorkbench('investigations');}",
        'save investigation activity',
    ),
    (
        "if(action==='bookmark-selection'){const x=currentInvestigation();if(!x||!wb.selected)throw new Error('Select an investigation and evidence first.');x.bookmarks=x.bookmarks||[];x.bookmarks.push({...wb.selected,bookmarked:Date.now()});x.updated=Date.now();saveStore();return openWorkbench('investigations');}",
        "if(action==='bookmark-selection'){const x=currentInvestigation();if(!x||!wb.selected)throw new Error('Select an investigation and evidence first.');x.bookmarks=x.bookmarks||[];x.bookmarks.push({...wb.selected,bookmarked:Date.now()});x.updated=Date.now();saveStore();recordEvent('bookmark','Bookmarked selected evidence.',{label:selectionLabel(wb.selected)});return openWorkbench('investigations');}",
        'bookmark activity',
    ),
    (
        "if(action==='export-investigation'){const x=currentInvestigation();if(!x)throw new Error('No active investigation.');downloadJSON(`sentinel-investigation-${x.id}.json`,x);return;}",
        "if(action==='export-investigation'){const x=currentInvestigation();if(!x)throw new Error('No active investigation.');wbRuntimeLog('info','investigation-exported','Investigation exported.',{investigation_id:x.id,title:x.title});downloadJSON(`sentinel-investigation-${x.id}.json`,x);return;}\n    if(action==='attach-last-full-scan')return attachLastFullScan();",
        'scan attachment action',
    ),
    (
        "  S.Workbench={FEATURES,store:wb,open:openWorkbench,setSelection,explainSelection,openProcessStory,evidenceBundle,assistantAnswer,runNaturalCommand};",
        "  S.Workbench={FEATURES,store:wb,open:openWorkbench,setSelection,explainSelection,openProcessStory,evidenceBundle,assistantAnswer,runNaturalCommand,recordEvent,attachLastFullScan,investigationCompleteness,lastFullScan,continuityMarker:INVESTIGATION_CONTINUITY_MARKER};",
        'workbench continuity export',
    ),
]
for old,new,label in replacements:
    s=replace_once(s,old,new,label)
p.write_text(s)

# Runtime Logs UI: make workbench a first-class filter source.
p = Path('web/app/runtime-logs.js')
s = p.read_text()
s = replace_once(
    s,
    '<option value="scan">scan</option><option value="storage">storage</option>',
    '<option value="scan">scan</option><option value="workbench">workbench</option><option value="storage">storage</option>',
    'runtime logs workbench source',
)
p.write_text(s)

# Static contract for the new continuity layer.
Path('investigation_depth_contract_test.go').write_text(r'''// SPDX-License-Identifier: MPL-2.0
package main

import (
    "os"
    "strings"
    "testing"
)

func requireInvestigationDepthMarker(t *testing.T, path string, markers ...string) {
    t.Helper()
    raw, err := os.ReadFile(path)
    if err != nil { t.Fatalf("read %s: %v", path, err) }
    text := string(raw)
    for _, marker := range markers {
        if !strings.Contains(text, marker) { t.Fatalf("%s missing investigation-depth marker %q", path, marker) }
    }
}

func TestFullScanWorkbenchInvestigationDepthContract(t *testing.T) {
    requireInvestigationDepthMarker(t, "web/app/full-scan.js",
        "sentinel.fullScan.lastRun.v1",
        "full-scan-stage-start",
        "full-scan-stage-finished",
        "persistFullScanSummary",
        "durationMs",
        "S.Workbench.recordEvent",
    )
    requireInvestigationDepthMarker(t, "web/app/workbench.js",
        "Sentinel 2.7 Investigation Continuity",
        "workflow completeness",
        "recordEvent('selection'",
        "attach-last-full-scan",
        "scanSnapshots",
        "Investigation continuity & activity",
    )
    requireInvestigationDepthMarker(t, "web/app/runtime-logs.js", "<option value=\"workbench\">workbench</option>")
}
''')
