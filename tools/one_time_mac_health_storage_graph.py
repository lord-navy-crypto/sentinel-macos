from pathlib import Path

# Add read-only backend endpoints.
Path('mac_health_storage.go').write_text(r'''// SPDX-License-Identifier: MPL-2.0
package main

import (
    "bufio"
    "context"
    "fmt"
    "net/http"
    "os"
    "os/exec"
    "path/filepath"
    "regexp"
    "runtime"
    "sort"
    "strconv"
    "strings"
    "time"
)

const macHealthStorageMarker = "Sentinel 2.8 Mac Health + Lazy Storage Graph"

func commandText(ctx context.Context, name string, args ...string) (string, string, error) {
    cmd := exec.CommandContext(ctx, name, args...)
    var stderr strings.Builder
    cmd.Stderr = &stderr
    out, err := cmd.Output()
    return string(out), stderr.String(), err
}

func parseVMStat(raw string) map[string]uint64 {
    result := map[string]uint64{}
    pageSize := uint64(4096)
    if i := strings.Index(raw, "page size of "); i >= 0 {
        rest := raw[i+len("page size of "):]
        fields := strings.Fields(rest)
        if len(fields) > 0 { if n, err := strconv.ParseUint(fields[0], 10, 64); err == nil { pageSize = n } }
    }
    scanner := bufio.NewScanner(strings.NewReader(raw))
    for scanner.Scan() {
        line := scanner.Text()
        parts := strings.SplitN(line, ":", 2)
        if len(parts) != 2 { continue }
        key := strings.TrimSpace(parts[0])
        value := strings.TrimSpace(strings.TrimSuffix(parts[1], "."))
        if n, err := strconv.ParseUint(value, 10, 64); err == nil { result[key] = n * pageSize }
    }
    result["page_size"] = pageSize
    return result
}

func parseBattery(raw string) map[string]any {
    out := map[string]any{"available": false}
    re := regexp.MustCompile(`([0-9]{1,3})%`)
    if m := re.FindStringSubmatch(raw); len(m) == 2 {
        pct, _ := strconv.Atoi(m[1]); out["available"] = true; out["charge_percent"] = pct
    }
    lower := strings.ToLower(raw)
    out["charging"] = strings.Contains(lower, "charging") && !strings.Contains(lower, "not charging")
    out["charged"] = strings.Contains(lower, "charged")
    out["ac_power"] = strings.Contains(lower, "ac power")
    out["raw_state"] = strings.TrimSpace(raw)
    return out
}

func (a *app) handleMacHealth(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet { writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error":"GET required"}); return }
    ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second); defer cancel()
    result := map[string]any{"marker": macHealthStorageMarker, "captured_at": time.Now().UTC().Format(time.RFC3339), "logical_cpus": runtime.NumCPU()}

    if raw, _, err := commandText(ctx, "/bin/ps", "-A", "-o", "%cpu="); err == nil {
        total := 0.0
        for _, line := range strings.Fields(raw) { if v, err := strconv.ParseFloat(line, 64); err == nil { total += v } }
        normalized := total / float64(max(1, runtime.NumCPU()))
        if normalized > 100 { normalized = 100 }
        result["cpu"] = map[string]any{"process_cpu_sum_percent": total, "normalized_percent": normalized}
    }
    if raw, _, err := commandText(ctx, "/usr/bin/vm_stat"); err == nil {
        vm := parseVMStat(raw)
        free := vm["Pages free"] + vm["Pages speculative"]
        active := vm["Pages active"]
        wired := vm["Pages wired down"]
        compressed := vm["Pages occupied by compressor"]
        result["memory"] = map[string]any{"free_bytes":free,"active_bytes":active,"wired_bytes":wired,"compressed_bytes":compressed,"swap_note":"Use compressed + swap together when diagnosing sustained memory pressure."}
    }
    if raw, _, err := commandText(ctx, "/usr/bin/memory_pressure", "-Q"); err == nil {
        re := regexp.MustCompile(`System-wide memory free percentage:\s*([0-9]+)%`)
        if m := re.FindStringSubmatch(raw); len(m)==2 { if n, err := strconv.Atoi(m[1]); err == nil { result["memory_free_percent"] = n } }
    }
    if raw, _, err := commandText(ctx, "/usr/bin/pmset", "-g", "batt"); err == nil { result["battery"] = parseBattery(raw) }
    if raw, _, err := commandText(ctx, "/usr/bin/uptime"); err == nil { result["uptime"] = strings.TrimSpace(raw) }
    writeJSON(w, http.StatusOK, result)
}

type storageGraphNode struct {
    Name string `json:"name"`
    Path string `json:"path"`
    Bytes int64 `json:"bytes"`
    IsDir bool `json:"is_dir"`
    Percent float64 `json:"percent"`
}

func (a *app) handleStorageGraph(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet { writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error":"GET required"}); return }
    requested := strings.TrimSpace(r.URL.Query().Get("path"))
    if requested == "" { requested, _ = os.UserHomeDir() }
    clean, err := filepath.Abs(filepath.Clean(requested)); if err != nil { writeJSON(w, 400, map[string]any{"error":"invalid path"}); return }
    info, err := os.Stat(clean); if err != nil { writeJSON(w, 404, map[string]any{"error":err.Error()}); return }
    if !info.IsDir() { writeJSON(w, 400, map[string]any{"error":"Storage Graph expands directories only"}); return }
    limit := 24
    if raw := r.URL.Query().Get("limit"); raw != "" { if n, err := strconv.Atoi(raw); err == nil && n >= 6 && n <= 60 { limit = n } }

    ctx, cancel := context.WithTimeout(r.Context(), 18*time.Second); defer cancel()
    raw, stderr, runErr := commandText(ctx, "/usr/bin/du", "-sk", "-d", "1", clean)
    if ctx.Err() != nil { writeJSON(w, http.StatusRequestTimeout, map[string]any{"error":"Storage Graph directory measurement exceeded the 18-second bound", "path":clean}); return }
    nodes := []storageGraphNode{}
    parentBytes := int64(0)
    scanner := bufio.NewScanner(strings.NewReader(raw))
    for scanner.Scan() {
        line := scanner.Text(); fields := strings.SplitN(line, "\t", 2); if len(fields) != 2 { continue }
        kb, err := strconv.ParseInt(strings.TrimSpace(fields[0]),10,64); if err != nil { continue }
        p := strings.TrimSpace(fields[1]); b := kb * 1024
        if filepath.Clean(p) == clean { parentBytes = b; continue }
        st, statErr := os.Stat(p)
        nodes = append(nodes, storageGraphNode{Name:filepath.Base(p),Path:p,Bytes:b,IsDir:statErr==nil&&st.IsDir()})
    }
    sort.Slice(nodes, func(i,j int) bool { return nodes[i].Bytes > nodes[j].Bytes })
    if parentBytes <= 0 { for _, n := range nodes { parentBytes += n.Bytes } }
    for i := range nodes { if parentBytes > 0 { nodes[i].Percent = float64(nodes[i].Bytes)*100/float64(parentBytes) } }
    hidden := 0; if len(nodes) > limit { hidden = len(nodes)-limit; nodes = nodes[:limit] }
    limited := strings.TrimSpace(stderr) != "" || runErr != nil
    writeJSON(w, http.StatusOK, map[string]any{"marker":macHealthStorageMarker,"path":clean,"name":filepath.Base(clean),"bytes":parentBytes,"children":nodes,"hidden_children":hidden,"limited":limited,"detail":func() string { if limited { return "Some entries could not be measured because of permissions or filesystem boundaries." }; return "Measured with a bounded, read-only macOS directory-size query." }()})
}

func max(a,b int) int { if a>b { return a }; return b }
''')

# Register endpoints in main.go.
p=Path('main.go'); s=p.read_text()
anchor='\tmux.HandleFunc("/api/system-profile", a.auth(a.handleSystemProfile))\n'
if anchor not in s: raise SystemExit('main.go system-profile route anchor missing')
s=s.replace(anchor, anchor+'\tmux.HandleFunc("/api/health/live", a.auth(a.handleMacHealth))\n',1)
anchor='\tmux.HandleFunc("/api/storage/aging", a.auth(a.handleStorageAging))\n'
if anchor not in s: raise SystemExit('main.go storage route anchor missing')
s=s.replace(anchor, anchor+'\tmux.HandleFunc("/api/storage/graph", a.auth(a.work.wrap("storage-graph", a.handleStorageGraph)))\n',1)
p.write_text(s)

# Patch existing System UI without adding another canonical script.
p=Path('web/app/lenses/system.js'); s=p.read_text()
old="  async function renderMachine(){busy('Reading machine','System Profile');const d=await api('/api/system-profile');const rows=[['Model',d.model_name,d.model_identifier],['Chip',d.chip||d.processor,d.platform_family],['Architecture',d.architecture,d.engine_explanation],['Physical cores',d.physical_cores],['Logical cores',d.logical_cores],['Memory',bytes(d.memory_bytes)],['macOS',d.os_version,d.os_build],['Kernel',d.kernel_version],['Rosetta',d.rosetta_translated?'Yes':'No'],['Root storage',bytes(d.disk_total),`${bytes(d.disk_available)} available`]];$('#evidenceStage').innerHTML=question()+band(1,'Machine identity',ledger(rows),'Unique serial number and Hardware UUID are intentionally unnecessary for this view.')+band(2,'Runtime implication',`<div class=\"s24-note good\">${esc(d.engine_explanation||'Sentinel uses the architecture-matched local engine packaged in the Universal app.')}</div>`);activity('Ready',100,'Machine profile loaded');}"
new="""  function healthHTML(h){const cpu=h?.cpu||{},mem=h?.memory||{},bat=h?.battery||{};return ledger([['CPU load',cpu.normalized_percent!=null?Number(cpu.normalized_percent).toFixed(1)+'%':'—','Normalized from current process CPU across logical cores'],['Memory free',h?.memory_free_percent!=null?h.memory_free_percent+'%':'—','Use together with compressed memory and swap, not as a verdict'],['Compressed memory',bytes(mem.compressed_bytes||0)],['Wired memory',bytes(mem.wired_bytes||0)],['Battery',bat.available?(bat.charge_percent+'%'):'Not reported',bat.available?(bat.charging?'Charging':bat.ac_power?'On AC power':'On battery'):'Desktop Macs may not expose a battery'],['Uptime',h?.uptime||'—']]);}\n\n  async function renderMachine(){busy('Reading machine','System Profile + live health');const [d,h]=await Promise.all([api('/api/system-profile'),api('/api/health/live').catch(()=>null)]);const rows=[['Model',d.model_name,d.model_identifier],['Chip',d.chip||d.processor,d.platform_family],['Architecture',d.architecture,d.engine_explanation],['Physical cores',d.physical_cores],['Logical cores',d.logical_cores],['Memory',bytes(d.memory_bytes)],['macOS',d.os_version,d.os_build],['Kernel',d.kernel_version],['Rosetta',d.rosetta_translated?'Yes':'No'],['Root storage',bytes(d.disk_total),`${bytes(d.disk_available)} available`]];$('#evidenceStage').innerHTML=question()+band(1,'Machine identity',ledger(rows),'Unique serial number and Hardware UUID are intentionally unnecessary for this view.')+band(2,'Mac Health',h?healthHTML(h):empty('Live health data was not available.'),'A current convenience view of CPU, memory and battery state. It is not a benchmark or hardware-health certificate.','<button type=\"button\" class=\"s24-action\" data-do=\"refresh-machine-health\">Refresh health</button>')+band(3,'Runtime implication',`<div class=\"s24-note good\">${esc(d.engine_explanation||'Sentinel uses the architecture-matched local engine packaged in the Universal app.')}</div>`);activity('Ready',100,'Machine profile + health loaded');}"""
if old not in s: raise SystemExit('renderMachine anchor missing')
s=s.replace(old,new,1)
old="+band(3,'Objects',`<div id=\"storageObjects\">${empty('No storage result yet.')}</div>`);activity('Ready',0,'Storage measurement idle');}"
new="+band(3,'Objects',`<div id=\"storageObjects\">${empty('No storage result yet.')}</div>`)+band(4,'Storage Graph',`<form class=\"s24-form\" data-form=\"storage-graph\"><label class=\"s24-field\"><span>Folder</span><input name=\"path\" value=\"${esc('/Users/'+(location.pathname?'':'')}\" placeholder=\"Leave blank for Home\"></label><label class=\"s24-field\"><span>Top children per level</span><input name=\"limit\" type=\"number\" min=\"6\" max=\"60\" value=\"24\"></label><div class=\"s24-form-actions\"><button class=\"s24-action primary\" type=\"submit\">Generate Storage Graph</button></div></form><div id=\"storageGraph\">${empty('Generate a graph, then expand only the folders you want to inspect.')}</div>`,'Lazy, bounded expansion keeps the graph responsive even when the Mac contains hundreds of thousands of files.');activity('Ready',0,'Storage measurement idle');}"
# The weird dynamic placeholder above is intentionally replaced below with clean blank input.
new=new.replace("value=\"${esc('/Users/'+(location.pathname?'':'')}\"", "value=\"\"")
if old not in s: raise SystemExit('renderStorage anchor missing')
s=s.replace(old,new,1)
insert="""
  function storageGraphRows(d){const rows=d.children||[];return `<div class=\"s24-note ${d.limited?'warn':'good'}\"><b>${esc(d.path||'')}</b><br>${esc(d.detail||'')} ${d.hidden_children?`· ${d.hidden_children} smaller child item(s) hidden at this level.`:''}</div><div class=\"storage-graph-tree\">${rows.map(x=>`<div class=\"storage-graph-node\"><div><b>${esc(x.name)}</b><span>${bytes(x.bytes)} · ${Number(x.percent||0).toFixed(1)}%</span></div><progress max=\"100\" value=\"${Math.max(0,Math.min(100,Number(x.percent||0)))}\"></progress>${x.is_dir?`<button type=\"button\" class=\"s24-action\" data-storage-graph-path=\"${esc(encodeURIComponent(x.path))}\">Expand</button>`:''}<div class=\"storage-graph-children\"></div></div>`).join('')}</div>`;}
  async function loadStorageGraph(path='',limit=24,host=$('#storageGraph')){if(!host)return;host.innerHTML=empty('Measuring this folder…');const d=await api('/api/storage/graph?path='+encodeURIComponent(path)+'&limit='+encodeURIComponent(limit));host.innerHTML=storageGraphRows(d);return d;}
  document.addEventListener('click',async event=>{const button=event.target.closest('[data-storage-graph-path]');if(!button)return;const node=button.closest('.storage-graph-node'),host=node?.querySelector('.storage-graph-children');if(!host)return;button.disabled=true;try{await loadStorageGraph(decodeURIComponent(button.dataset.storageGraphPath||''),18,host);button.textContent='Refresh branch';}catch(error){host.innerHTML=`<div class=\"s24-note warn\">${esc(error?.message||String(error))}</div>`;}finally{button.disabled=false;}});
"""
anchor="  registerLens('machine',renderMachine);"
if anchor not in s: raise SystemExit('system register anchor missing')
s=s.replace(anchor,insert+'\n'+anchor,1)
p.write_text(s)

# Runtime handlers for the new controls/forms.
p=Path('web/app/runtime.js'); s=p.read_text()
old="    if(name==='cancel-storage'){if(state.scanJob)await api('/api/storage/cancel?id='+encodeURIComponent(state.scanJob),{method:'POST'});return;}"
new=old+"\n    if(name==='refresh-machine-health')return navigate('machine',{push:false});"
if old not in s: raise SystemExit('runtime action anchor missing')
s=s.replace(old,new,1)
old="      else if(form.dataset.form==='storage')await S.startStorage(form);"
new=old+"\n      else if(form.dataset.form==='storage-graph'){const fd=new FormData(form);await S.loadStorageGraph(String(fd.get('path')||''),Number(fd.get('limit')||24));}"
if old not in s: raise SystemExit('runtime form anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# Export loader from system module.
p=Path('web/app/lenses/system.js'); s=p.read_text()
old="  S.startStorage=startStorage;S.pollStorage=pollStorage;S.renderStorage=renderStorage;"
new="  S.startStorage=startStorage;S.pollStorage=pollStorage;S.renderStorage=renderStorage;S.loadStorageGraph=loadStorageGraph;"
if old not in s: raise SystemExit('system export anchor missing')
p.write_text(s.replace(old,new,1))

Path('mac_health_storage_contract_test.go').write_text(r'''// SPDX-License-Identifier: MPL-2.0
package main

import (
    "os"
    "strings"
    "testing"
)

func TestMacHealthAndStorageGraphContract(t *testing.T) {
    goSrc, err := os.ReadFile("mac_health_storage.go"); if err != nil { t.Fatal(err) }
    src := string(goSrc)
    for _, want := range []string{"Sentinel 2.8 Mac Health + Lazy Storage Graph", "/usr/bin/vm_stat", "/usr/bin/memory_pressure", "/usr/bin/pmset", "/usr/bin/du", "18*time.Second", "hidden_children"} {
        if !strings.Contains(src, want) { t.Fatalf("Mac Health/Storage Graph backend missing %q", want) }
    }
    mainRaw, _ := os.ReadFile("main.go"); mainSrc := string(mainRaw)
    for _, want := range []string{"/api/health/live", "/api/storage/graph"} { if !strings.Contains(mainSrc,want) { t.Fatalf("route missing %q",want) } }
    uiRaw, _ := os.ReadFile("web/app/lenses/system.js"); ui := string(uiRaw)
    for _, want := range []string{"Mac Health", "Generate Storage Graph", "storageGraphRows", "loadStorageGraph", "Top children per level", "Lazy, bounded expansion"} { if !strings.Contains(ui,want) { t.Fatalf("UI missing %q",want) } }
}
''')
