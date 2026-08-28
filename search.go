// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
)

type searchQuery struct {
	Terms   []string
	Filters map[string]string
}

var searchFilterKeys = map[string]bool{
	"kind": true, "severity": true, "pid": true, "path": true, "endpoint": true, "source": true,
}

func parseSearchQuery(raw string) searchQuery {
	q := searchQuery{Filters: map[string]string{}}
	var tokens []string
	var b strings.Builder
	quoted := false
	for _, r := range strings.TrimSpace(raw) {
		switch {
		case r == '"':
			quoted = !quoted
		case unicode.IsSpace(r) && !quoted:
			if b.Len() > 0 {
				tokens = append(tokens, b.String())
				b.Reset()
			}
		default:
			b.WriteRune(r)
		}
	}
	if b.Len() > 0 {
		tokens = append(tokens, b.String())
	}
	for _, t := range tokens {
		if i := strings.IndexByte(t, ':'); i > 0 {
			k, v := strings.ToLower(strings.TrimSpace(t[:i])), strings.TrimSpace(t[i+1:])
			if searchFilterKeys[k] && v != "" {
				q.Filters[k] = strings.ToLower(v)
				continue
			}
		}
		if strings.TrimSpace(t) != "" {
			q.Terms = append(q.Terms, strings.ToLower(strings.TrimSpace(t)))
		}
	}
	return q
}

func wordTokens(s string) []string {
	return strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !(unicode.IsLetter(r) || unicode.IsDigit(r))
	})
}

func editDistance(a, b string) int {
	ra, rb := []rune(strings.ToLower(a)), []rune(strings.ToLower(b))
	if len(ra) == 0 {
		return len(rb)
	}
	if len(rb) == 0 {
		return len(ra)
	}
	prev := make([]int, len(rb)+1)
	for j := range prev {
		prev[j] = j
	}
	for i, ca := range ra {
		cur := make([]int, len(rb)+1)
		cur[0] = i + 1
		for j, cb := range rb {
			cost := 0
			if ca != cb {
				cost = 1
			}
			del, ins, sub := prev[j+1]+1, cur[j]+1, prev[j]+cost
			cur[j+1] = minInt(del, minInt(ins, sub))
		}
		prev = cur
	}
	return prev[len(rb)]
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func fuzzyFieldScore(field, term string) int {
	f := strings.ToLower(strings.TrimSpace(field))
	t := strings.ToLower(strings.TrimSpace(term))
	if f == "" || t == "" {
		return 0
	}
	if f == t {
		return 100
	}
	if strings.HasPrefix(f, t) {
		return 88
	}
	if strings.Contains(f, t) {
		return 72
	}
	best := 0
	for _, w := range wordTokens(f) {
		if w == t {
			return 92
		}
		if strings.HasPrefix(w, t) && len(t) >= 2 {
			if best < 80 {
				best = 80
			}
		}
		if len(t) >= 3 && len(w) >= 3 {
			d := editDistance(w, t)
			maxLen := len([]rune(w))
			if len([]rune(t)) > maxLen {
				maxLen = len([]rune(t))
			}
			if d <= 2 && maxLen <= 12 {
				s := 58 - d*10
				if s > best {
					best = s
				}
			}
		}
	}
	return best
}

func scoreSearchResult(r UniversalSearchResult, terms []string) (int, []string, bool) {
	if len(terms) == 0 {
		return 20, nil, true
	}
	fields := []struct {
		name, value string
		weight      int
	}{
		{"title", r.Title, 15}, {"path", r.Path, 8}, {"subtitle", r.Subtitle, 0}, {"kind", r.Kind, -5},
	}
	total := 0
	matched := map[string]bool{}
	for _, term := range terms {
		best, bestName := 0, ""
		for _, f := range fields {
			s := fuzzyFieldScore(f.value, term)
			if s > 0 {
				s += f.weight
			}
			if s > best {
				best, bestName = s, f.name
			}
		}
		if r.PID > 0 && strconv.Itoa(r.PID) == term {
			best, bestName = 120, "pid"
		}
		if best == 0 {
			return 0, nil, false
		}
		total += best
		matched[bestName] = true
	}
	out := make([]string, 0, len(matched))
	for k := range matched {
		out = append(out, k)
	}
	sort.Strings(out)
	return total / len(terms), out, true
}

func resultMatchesFilters(r UniversalSearchResult, filters map[string]string) bool {
	for k, v := range filters {
		switch k {
		case "kind":
			if !strings.EqualFold(r.Kind, v) {
				return false
			}
		case "severity":
			if !strings.EqualFold(firstNonEmpty(r.Severity, "info"), v) {
				return false
			}
		case "pid":
			if strconv.Itoa(r.PID) != v {
				return false
			}
		case "path":
			if !containsFold(r.Path, v) && !containsFold(r.Subtitle, v) {
				return false
			}
		case "endpoint":
			if !containsFold(r.Subtitle, v) {
				return false
			}
		case "source":
			if !containsFold(r.Subtitle, v) && !strings.EqualFold(r.Kind, v) {
				return false
			}
		}
	}
	return true
}

func (a *app) searchCorpus() []UniversalSearchResult {
	items := make([]UniversalSearchResult, 0, 600)
	candidateAdd := func(r UniversalSearchResult) {
		if len(items) < 800 {
			items = append(items, r)
		}
	}

	procs := macProcesses(300)
	if runtime.GOOS != "darwin" {
		procs = genericProcesses(300)
	}
	for _, p := range procs {
		path, _ := auditTargetFromCommand(p.Command)
		title := filepath.Base(path)
		if title == "." || title == "" {
			title = p.Command
		}
		candidateAdd(UniversalSearchResult{Kind: "process", Title: title, Subtitle: fmt.Sprintf("PID %d · %s", p.PID, p.Command), Path: path, PID: p.PID, View: "processes"})
	}
	for _, s := range collectStartupItems() {
		sev := "info"
		if s.Risk >= 60 {
			sev = "high"
		} else if s.Risk >= 40 {
			sev = "review"
		}
		candidateAdd(UniversalSearchResult{Kind: "startup", Title: s.Name, Subtitle: s.Scope + " · " + s.Executable, Path: s.Executable, Severity: sev, View: "startup"})
	}
	if netItems, _ := collectNetwork(); len(netItems) > 0 {
		for _, n := range netItems {
			candidateAdd(UniversalSearchResult{Kind: "network", Title: n.Command, Subtitle: fmt.Sprintf("PID %d · %s · %s", n.PID, n.EndpointClass, firstNonEmpty(n.Remote, n.Address)), PID: n.PID, View: "network"})
		}
	}
	if a.incidents != nil {
		for _, in := range a.incidents.snapshot(false).Incidents {
			candidateAdd(UniversalSearchResult{Kind: "incident", Title: in.Title, Subtitle: fmt.Sprintf("confidence %d · %s", in.Confidence, strings.Join(in.Sources, " + ")), Path: in.PrimaryPath, Severity: in.Severity, View: "incidents"})
		}
	}
	if a.actions != nil {
		for _, v := range a.actions.vaultSnapshot() {
			candidateAdd(UniversalSearchResult{Kind: "vault", Title: v.OriginalName, Subtitle: "Sentinel Vault · original: " + v.OriginalPath, Path: v.OriginalPath, Severity: "review", View: "actions"})
		}
	}
	if a.changes != nil {
		for _, e := range a.changes.eventsSnapshot(200) {
			candidateAdd(UniversalSearchResult{Kind: "change", Title: humanChangeTitle(e), Subtitle: e.Source + " · " + e.Kind + " · " + e.Why, Path: e.Path, Severity: e.Severity, View: "changes"})
		}
	}
	if a.jobs != nil {
		if scan := a.jobs.latestResult(); scan != nil {
			for _, f := range scan.LargeFiles {
				candidateAdd(UniversalSearchResult{Kind: "file", Title: f.Name, Subtitle: f.Path, Path: f.Path, View: "storage"})
			}
		}
	}
	for _, q := range a.reviewQueue().Items {
		candidateAdd(UniversalSearchResult{Kind: "review", Title: q.Title, Subtitle: q.Source + " · " + q.Detail, Path: q.Path, PID: q.PID, Severity: q.Severity, View: q.View})
	}
	return items
}

func (a *app) powerSearch(raw string) UniversalSearchResponse {
	raw = strings.TrimSpace(raw)
	parsed := parseSearchQuery(raw)
	out := UniversalSearchResponse{Query: raw, ParsedTerms: parsed.Terms, Filters: parsed.Filters, Results: []UniversalSearchResult{}, Note: "Ranked search covers bounded live evidence and the latest storage scan. Use Deep filename search only when you explicitly want a bounded walk of a Home subdirectory; file contents are never indexed.", Help: []string{"kind:process chrome", "kind:change launchagent", "kind:startup severity:review", "pid:1234", "endpoint:public safari", "path:downloads zip", "quoted terms: \"Google Chrome\""}}
	if raw == "" {
		return out
	}

	candidate := raw
	if strings.HasPrefix(candidate, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			candidate = filepath.Join(home, strings.TrimPrefix(candidate, "~/"))
		}
	}
	if filepath.IsAbs(candidate) {
		if st, err := os.Stat(candidate); err == nil {
			kind := "file"
			if st.IsDir() {
				kind = "path"
			}
			out.Results = append(out.Results, UniversalSearchResult{Kind: kind, Title: filepath.Base(candidate), Subtitle: "Exact local path · " + candidate, Path: candidate, View: "integrity", Score: 1000, MatchedFields: []string{"exact_path"}, WhyMatched: "Exact existing local path"})
		}
	}

	for _, r := range a.searchCorpus() {
		if !resultMatchesFilters(r, parsed.Filters) {
			continue
		}
		score, fields, ok := scoreSearchResult(r, parsed.Terms)
		if !ok {
			continue
		}
		r.Score = score
		r.MatchedFields = fields
		if len(fields) > 0 {
			r.WhyMatched = "Matched " + strings.Join(fields, ", ")
		} else {
			r.WhyMatched = "Matched filters"
		}
		out.Results = append(out.Results, r)
	}
	sort.SliceStable(out.Results, func(i, j int) bool {
		if out.Results[i].Score != out.Results[j].Score {
			return out.Results[i].Score > out.Results[j].Score
		}
		return strings.ToLower(out.Results[i].Title) < strings.ToLower(out.Results[j].Title)
	})
	if len(out.Results) > 100 {
		out.Results = out.Results[:100]
	}
	return out
}

type DeepFileSearchResult struct {
	Path       string `json:"path"`
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	Size       uint64 `json:"size,omitempty"`
	Score      int    `json:"score"`
	WhyMatched string `json:"why_matched"`
}

type DeepFileSearchResponse struct {
	Query     string                 `json:"query"`
	Scope     string                 `json:"scope"`
	Root      string                 `json:"root"`
	Results   []DeepFileSearchResult `json:"results"`
	Visited   int                    `json:"visited"`
	ElapsedMS int64                  `json:"elapsed_ms"`
	Truncated bool                   `json:"truncated"`
	Warnings  []string               `json:"warnings,omitempty"`
	Note      string                 `json:"note"`
}

func deepScopeRoot(scope string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	switch strings.ToLower(strings.TrimSpace(scope)) {
	case "downloads":
		return filepath.Join(home, "Downloads"), nil
	case "desktop":
		return filepath.Join(home, "Desktop"), nil
	case "documents":
		return filepath.Join(home, "Documents"), nil
	case "library":
		return filepath.Join(home, "Library"), nil
	case "home", "":
		return home, nil
	default:
		if strings.HasPrefix(scope, "~/") {
			scope = filepath.Join(home, strings.TrimPrefix(scope, "~/"))
		}
		if !filepath.IsAbs(scope) {
			return "", fmt.Errorf("scope must be home/downloads/desktop/documents/library or an absolute path inside Home")
		}
		clean := filepath.Clean(scope)
		realHome, homeErr := filepath.EvalSymlinks(home)
		if homeErr != nil {
			realHome = filepath.Clean(home)
		}
		realScope, scopeErr := filepath.EvalSymlinks(clean)
		if scopeErr != nil {
			return "", fmt.Errorf("search scope does not exist or cannot be resolved")
		}
		rel, err := filepath.Rel(realHome, realScope)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
			return "", fmt.Errorf("resolved scope must remain inside the current user Home")
		}
		return realScope, nil
	}
}

func deepFileNameSearch(q, scope string, limit int) DeepFileSearchResponse {
	start := time.Now()
	if limit < 1 || limit > 200 {
		limit = 100
	}
	out := DeepFileSearchResponse{Query: strings.TrimSpace(q), Scope: scope, Results: []DeepFileSearchResult{}, Note: "Explicit bounded filename/path search only. Sentinel does not read file contents, does not follow symlinks, and stops after 30,000 entries or about 3 seconds."}
	root, err := deepScopeRoot(scope)
	if err != nil {
		out.Warnings = append(out.Warnings, err.Error())
		return out
	}
	out.Root = root
	if len([]rune(strings.TrimSpace(q))) < 2 {
		out.Warnings = append(out.Warnings, "query must contain at least 2 characters")
		return out
	}
	deadline := time.Now().Add(3 * time.Second)
	maxVisited := 30000
	term := strings.ToLower(strings.TrimSpace(q))
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if time.Now().After(deadline) || out.Visited >= maxVisited {
			out.Truncated = true
			return filepath.SkipAll
		}
		if walkErr != nil {
			return nil
		}
		out.Visited++
		if d.Type()&os.ModeSymlink != 0 {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if path == root {
			return nil
		}
		if d.IsDir() && filepath.Clean(path) == filepath.Clean(filepath.Join(root, "Library", "Application Support", "Sentinel")) {
			return filepath.SkipDir
		}
		name := d.Name()
		s := fuzzyFieldScore(name, term)
		ps := fuzzyFieldScore(path, term) - 15
		if ps > s {
			s = ps
		}
		if s <= 0 {
			return nil
		}
		kind := "file"
		var size uint64
		if d.IsDir() {
			kind = "directory"
		} else if info, e := d.Info(); e == nil {
			size = uint64(info.Size())
		}
		out.Results = append(out.Results, DeepFileSearchResult{Path: path, Name: name, Kind: kind, Size: size, Score: s, WhyMatched: "Filename/path similarity"})
		if len(out.Results) > limit*3 {
			sort.Slice(out.Results, func(i, j int) bool { return out.Results[i].Score > out.Results[j].Score })
			out.Results = out.Results[:limit*2]
		}
		return nil
	})
	sort.SliceStable(out.Results, func(i, j int) bool {
		if out.Results[i].Score != out.Results[j].Score {
			return out.Results[i].Score > out.Results[j].Score
		}
		return out.Results[i].Path < out.Results[j].Path
	})
	if len(out.Results) > limit {
		out.Results = out.Results[:limit]
	}
	out.ElapsedMS = time.Since(start).Milliseconds()
	return out
}

func (a *app) handleDeepFileSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	res := deepFileNameSearch(r.URL.Query().Get("q"), r.URL.Query().Get("scope"), limit)
	if len(res.Warnings) > 0 && res.Root == "" {
		writeJSON(w, http.StatusBadRequest, res)
		return
	}
	writeJSON(w, http.StatusOK, res)
}
