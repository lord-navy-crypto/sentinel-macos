from pathlib import Path

p=Path('web/app/manual.js')
s=p.read_text()
anchor="  function article(topic, index) {\n"
if anchor not in s:
    raise SystemExit('manual article anchor missing')

companion=r'''  const EN_TOPIC = {
    'what-is-sentinel':{purpose:'Understand Sentinel as a local evidence and system-intelligence tool, not a binary safe/danger classifier.',steps:['Start from Status.','Use Easy Scan for a quick read-only review.','Follow concrete evidence into Cases, Relations or Object.','Use Safe Change only after the exact object and consequences are understood.'],caution:'Attention, Risk, Confidence and Drift are evidence-oriented signals, not malware probabilities.'},
    'screen-regions':{purpose:'Learn the fixed regions of the app so you can see navigation, evidence, context and task progress without getting lost.',steps:['Choose a Mission.','Choose a Lens.','Read the question at the top of the Evidence Stage.','Use Quick Actions only when they match your goal.','Watch task/progress surfaces during long work.'],caution:'You do not need to run every page or every scan.'},
    'first-five-minutes':{purpose:'Use a safe first-session path that starts with orientation instead of a full-machine operation.',steps:['Open Status.','Run Easy Scan.','Review one concrete item.','Open Cases, Relations or Object if more context is needed.','Run Full Scan later only if you want a retained baseline.'],caution:'A missing baseline is normal on first use.'},
    'easy-vs-full':{purpose:'Choose between a quick read-only review and a broader retained baseline.',steps:['Use Easy Scan for a fast current review.','Use Full Scan only when you intentionally want broad retained evidence.','Watch stage progress and limitations.','Re-run Full Scan only when the machine materially changed or the baseline is stale.'],caution:'Full Scan must never start merely because the app was opened.'},
    'activity-bar':{purpose:'Tell whether a long operation is running, progressing, limited, failed or complete.',steps:['Read the task label.','Check measured progress when available.','Read the current stage/detail.','If progress stops, inspect Runtime Logs before launching duplicates.'],caution:'Do not repeatedly click the same expensive action just because one stage takes time.'},
    'status':{purpose:'Orient yourself before investigating or changing anything.',steps:['Read current readiness and retained evidence freshness.','Choose Easy Scan for a quick review.','Choose Full Scan only for a new baseline.','Open the relevant Lens for one concrete question.'],caution:'Older evidence means stale evidence, not dangerous evidence.'},
    'snapshot':{purpose:'Use Easy Scan to create a lightweight review queue from current read-only evidence.',steps:['Run Easy Scan.','Read why each item was prioritised.','Open a concrete object for deeper evidence.','Capture history separately when you need a retained comparison point.'],caution:'A review item is not an instruction to delete or modify anything.'},
    'search-lens':{purpose:'Find known evidence first, then deliberately broaden to a bounded deep search when needed.',steps:['Enter a specific keyword.','Choose a scope.','Set a reasonable result limit.','Inspect visited/result counts.','Open Object Story for a concrete file result.'],caution:'No match means no match inside the current visibility and search budget, not proof of absence.'},
    'relations':{purpose:'Understand how processes, files, startup items, network endpoints and cases are connected over time.',steps:['Read node and edge types.','Select one node.','Check timeline order.','Narrow the time/type filters.','Verify important objects separately.'],caution:'An observed edge is a relationship, not proof of causality.'},
    'audit':{purpose:'Prioritise evidence for review using explainable reasons.',steps:['Run or refresh Audit.','Read the reason behind a high-priority item.','Check Cases for correlated evidence.','Verify the exact object.','Continue Investigation only when more evidence is needed.'],caution:'Audit priority is not malware probability.'},
    'continue-investigation':{purpose:'Continue from one concrete evidence point while preserving investigation context.',steps:['Start from a specific finding.','Open Continue Investigation.','Read the current session and branch.','Continue from a meaningful node.','Record hypotheses and unresolved questions.'],caution:'Investigation does not grant mutation authority.'},
    'object':{purpose:'Verify one exact path or process before interpreting it.',steps:['Open a precise path or PID.','Confirm identity first.','Read relationships and time evidence.','Review unknowns.','Follow only relevant related objects.'],caution:'A strange name or unfamiliar path alone is not enough for a conclusion.'},
    'machine':{purpose:'Read hardware, architecture and runtime context that explains compatibility and capacity.',steps:['Confirm model/chip/architecture.','Check memory and storage context.','Use health/resource tools for live pressure rather than inferring from hardware alone.'],caution:'Hardware information explains capability; it does not diagnose a specific software problem by itself.'},
    'processes':{purpose:'See what is running now and connect a process to its executable and current activity.',steps:['Sort or inspect CPU/memory-heavy processes.','Select one PID.','Open its story or related evidence.','Use Terminal Tools for bounded process details when necessary.'],caution:'High CPU or memory use can be legitimate workload.'},
    'startup':{purpose:'Review software configured to start automatically.',steps:['Read the launch declaration.','Verify the executable target.','Compare with previous persistence captures when available.','Investigate unfamiliar items before considering action.'],caution:'Automatic startup is common in legitimate software.'},
    'network':{purpose:'Review current TCP/network evidence and connect it to the responsible process.',steps:['Refresh current network evidence.','Identify the process/PID.','Use Relations or Process Story for context.','Use Terminal Tools for DNS, routes, proxy or Network Quality when troubleshooting connectivity.'],caution:'A public endpoint is ordinary context and is not suspicious by itself.'},
    'storage':{purpose:'Measure where storage is used before deciding what is worth reviewing.',steps:['Choose a bounded scope.','Run the measurement.','Review largest objects and exact duplicate evidence separately.','Use Storage Graph or object inspection for a specific branch.','Send only reviewed candidates to Reclaim/Safe Change.'],caution:'Filename similarity is not the same as hash-confirmed duplication.'},
    'reclaim':{purpose:'Review space-saving candidates without turning an estimate into an automatic delete.',steps:['Measure storage first.','Review candidate path and size.','Open the object when uncertain.','Send a reviewed target to Safe Change.'],caution:'Nothing should be deleted automatically from a Reclaim suggestion.'},
    'change':{purpose:'Make the smallest reversible change supported by evidence.',steps:['Create a fresh Preview.','Read impact and expiry.','Confirm explicitly.','Use the one-time code.','Let Sentinel revalidate the object immediately before execution.','Use Recovery Journal/Vault if restoration is needed.'],caution:'Never bypass Preview, confirmation or recovery boundaries for convenience.'},
    'visibility':{purpose:'Understand exactly what Sentinel could and could not observe.',steps:['Read available evidence sources.','Read limited/unavailable sources.','Grant only permissions you intentionally want to grant.','Lower confidence when visibility is missing.'],caution:'Unavailable evidence must not be converted into a clean bill of health.'},
    'guide':{purpose:'Use Sentinel as an evidence workflow: observe, connect, compare, verify, then act only when justified.',steps:['Start from a question.','Choose the smallest relevant Lens.','Separate observed facts from interpretation.','Verify exact objects.','Act only with recovery.'],caution:'More scans do not automatically create better understanding.'}
  };
  const EN_LENS = {
    status:'Use this topic to orient current state and decide the next bounded step.',snapshot:'Use this topic for a lightweight current observation.',cases:'Use this topic to correlate related evidence into a readable story.',search:'Use this topic to find a concrete object inside a bounded scope.',relations:'Use this topic to understand relationships and time order.',audit:'Use this topic to prioritise review with explainable reasons.',object:'Use this topic to verify one exact object.',changes:'Use this topic to compare retained points and understand what changed.',behavior:'Use this topic to compare behavior captures without turning difference into a verdict.',reference:'Use this topic to compare against an approved reference while preserving context.',machine:'Use this topic to understand machine/runtime context.',processes:'Use this topic to inspect current processes and their resource/activity context.',startup:'Use this topic to understand launch declarations.',persistence:'Use this topic to compare bounded persistence captures.',background:'Use this topic to inspect background registrations.',network:'Use this topic to inspect current or retained network evidence.',storage:'Use this topic to measure storage before cleanup decisions.',reclaim:'Use this topic to review space-saving candidates.',change:'Use this topic only for previewed, confirmed and recoverable changes.',visibility:'Use this topic to understand evidence boundaries.',guide:'Use this topic to learn the evidence-first product model.',assistant:'Use this topic to understand Local AI as an interpretation layer.'
  };
  function englishCompanion(topic){
    if(EN_TOPIC[topic.id])return EN_TOPIC[topic.id];
    const purpose=EN_LENS[topic.lens]||'Use this topic to understand one Sentinel workflow while keeping observed evidence, interpretation and unknowns separate.';
    const steps=topic.lens?['Read the observed evidence first.','Use the feature only for the concrete question you are trying to answer.','Open related evidence when a result needs verification.','Stop at Unknown when visibility or evidence is insufficient.']:['Read the Chinese detailed guidance and the current Sentinel evidence together.','Follow only the smallest relevant workflow.','Verify important objects before acting.','Use Runtime Logs or Visibility when evidence is incomplete.'];
    return {purpose,steps,caution:'Do not turn one signal, score, unfamiliar object or missing observation into a safety or malware verdict.'};
  }

'''
s=s.replace(anchor,companion+anchor,1)

old="""      <div class=\"manual-warning\"><b>注意</b><span>${esc(topic.caution)}</span></div>\n    </article>`;"""
new="""      <div class=\"manual-warning\"><b>注意 / CAUTION</b><span>${esc(topic.caution)}</span></div>\n      ${(()=>{const en=englishCompanion(topic);return `<section class=\"manual-subsection manual-english\" data-manual-language=\"en\"><h3>English companion / 英文说明</h3><p><b>Purpose:</b> ${esc(en.purpose)}</p><h4>How to use</h4>${list(en.steps)}<div class=\"manual-warning\"><b>Caution</b><span>${esc(en.caution)}</span></div></section>`;})()}\n    </article>`;"""
if old not in s:
    raise SystemExit('manual article tail anchor missing')
s=s.replace(old,new,1)

s=s.replace('<div><span>USER MANUAL / 使用手册</span><h2>从“我完全不知道 Sentinel 是什么”开始，讲到每个主要功能怎么用。</h2><p>这是一份应用内的长篇手册。左边是可点击目录，右边可以一直向下滚动。每个功能都按“它是什么 → 什么时候用 → 怎么用 → 看什么 → 注意什么”来解释。带 <b>Open feature</b> 的章节可以直接跳到真实功能。</p></div>', '<div><span>USER MANUAL / 使用手册</span><h2>每个章节同时提供中文详细说明与 English companion。</h2><p><b>中文：</b>按“它是什么 → 什么时候用 → 怎么用 → 看什么 → 注意什么”解释。<br><b>English:</b> Every topic includes a Purpose, How to use, and Caution companion. Open feature jumps to the real feature.</p></div>',1)
s=s.replace('<span>搜索手册</span>','<span>Search manual / 搜索手册</span>',1)
s=s.replace('显示全部 ${allTopics.length} 个章节','Showing all ${allTopics.length} topics / 显示全部 ${allTopics.length} 个章节',1)
s=s.replace('<b>点击章节直接跳转</b>','<b>Jump to topic / 点击章节直接跳转</b>',1)
p.write_text(s)

# Strengthen the Manual contract: every rendered article must receive the English companion.
p=Path('manual_product_contract_test.go')
s=p.read_text()
anchor='\tif strings.Count(manual, "title:\'") < 30 {'
if anchor not in s:
    raise SystemExit('manual detail contract anchor missing')
insert='''\tfor _, want := range []string{"englishCompanion", "English companion / 英文说明", "data-manual-language=\\\"en\\\"", "Purpose:", "How to use", "Caution"} {\n\t\tif !strings.Contains(manual, want) {\n\t\t\tt.Fatalf("bilingual manual companion missing %q", want)\n\t\t}\n\t}\n\n'''
s=s.replace(anchor,insert+anchor,1)
p.write_text(s)
