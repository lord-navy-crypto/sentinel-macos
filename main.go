// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"
)

//go:embed web/*
var webFS embed.FS

type app struct {
	token        string
	allowedHost  string
	serverOrigin string
	startedAt    time.Time
	ephemeral    bool
	instanceLock *runtimeLock
	work         *workGate
	jobs         *scanManager
	intel        *intelligenceManager
	behavior     *behaviorManager
	trust        *trustManager
	persistence  *persistenceManager
	actions      *actionManager
	changes      *changeManager
	incidents    *incidentManager
}

func main() {
	port := flag.Int("port", 0, "local TCP port (0 selects a random available port)")
	noBrowser := flag.Bool("no-browser", false, "do not automatically open the localhost UI")
	ephemeral := flag.Bool("ephemeral", false, "keep Behavior/Trust history in memory and disable mutating Safe Actions so no recovery metadata is written")
	showVersion := flag.Bool("version", false, "print the Sentinel version and exit")
	doctor := flag.Bool("doctor", false, "print a local capability/privacy self-check and exit")
	desktopMode := flag.Bool("desktop", false, "run as an embedded desktop-app engine and emit a machine-readable bootstrap line on stdout")
	flag.Parse()
	if *showVersion {
		fmt.Printf("Sentinel macOS v%s\n", sentinelVersion)
		return
	}
	if *doctor {
		runDoctor()
		return
	}
	if *port < 0 || *port > 65535 {
		log.Fatal("--port must be between 0 and 65535")
	}
	if *desktopMode {
		*noBrowser = true
	}

	instanceLock, err := acquireRuntimeLock(!*ephemeral)
	if err != nil {
		log.Fatal(err)
	}
	defer instanceLock.release()

	token := randomToken(24)
	intel := newIntelligenceManager()
	a := &app{token: token, startedAt: time.Now(), ephemeral: *ephemeral, instanceLock: instanceLock, work: newWorkGate(2), jobs: newScanManager(), intel: intel, behavior: newBehaviorManager(*ephemeral), trust: newTrustManager(*ephemeral), persistence: newPersistenceManager(), actions: newActionManager(*ephemeral), changes: newChangeManager(intel, *ephemeral), incidents: newIncidentManager(*ephemeral)}

	mux := http.NewServeMux()
	staticFS, err := fs.Sub(webFS, "web")
	if err != nil {
		log.Fatal(err)
	}
	fileServer := http.FileServer(http.FS(staticFS))

	mux.HandleFunc("/api/overview", a.auth(a.handleOverview))
	mux.HandleFunc("/api/system-profile", a.auth(a.handleSystemProfile))
	mux.HandleFunc("/api/system/console", a.auth(a.handleSystemConsole))
	mux.HandleFunc("/api/system/query", a.auth(a.work.wrap("system-query", a.handleSystemConsoleQuery)))
	mux.HandleFunc("/api/system/query/structured", a.auth(a.work.wrap("system-query-structured", a.handleSystemConsoleStructuredQuery)))
	mux.HandleFunc("/api/system/object/inspect", a.auth(a.work.wrap("system-object-inspect", a.handleSystemObjectInspect)))
	mux.HandleFunc("/api/quick-check", a.auth(a.work.wrap("quick-check", a.handleQuickCheck)))
	mux.HandleFunc("/api/search", a.auth(a.handleUniversalSearch))
	mux.HandleFunc("/api/search/deep", a.auth(a.work.wrap("deep-search", a.handleDeepFileSearch)))
	mux.HandleFunc("/api/weakness-audit", a.auth(a.handleWeaknessAudit))
	mux.HandleFunc("/api/coverage", a.auth(a.handleCoverageMap))
	mux.HandleFunc("/api/review-queue", a.auth(a.handleReviewQueue))
	mux.HandleFunc("/api/guided-snapshot", a.auth(a.work.wrap("monitoring-snapshot", a.handleGuidedSnapshot)))
	mux.HandleFunc("/api/capabilities", a.auth(a.handleCapabilities))
	mux.HandleFunc("/api/processes", a.auth(a.handleProcesses))
	mux.HandleFunc("/api/startup", a.auth(a.handleStartup))
	mux.HandleFunc("/api/launch-services", a.auth(a.work.wrap("launch-services", a.handleLaunchServices)))
	mux.HandleFunc("/api/launch-services/detail", a.auth(a.work.wrap("launch-service-detail", a.handleLaunchServiceDetail)))
	mux.HandleFunc("/api/network", a.auth(a.handleNetwork))
	mux.HandleFunc("/api/background", a.auth(a.handleBackgroundItems))
	mux.HandleFunc("/api/storage/scan", a.auth(a.handleStorageScan))
	mux.HandleFunc("/api/storage/jobs", a.auth(a.handleStorageJobs))
	mux.HandleFunc("/api/storage/cancel", a.auth(a.handleStorageCancel))
	mux.HandleFunc("/api/security/audit", a.auth(a.work.wrap("security-audit", a.handleSecurityAudit)))
	mux.HandleFunc("/api/security/investigate", a.auth(a.work.wrap("continue-investigation", a.handleContinueInvestigation)))
	mux.HandleFunc("/api/security/context", a.auth(a.work.wrap("investigation-runtime-context", a.handleInvestigationRuntimeContext)))
	mux.HandleFunc("/api/process/detail", a.auth(a.handleProcessDetail))
	mux.HandleFunc("/api/report/export", a.auth(a.work.wrap("report-export", a.handleReportExport)))
	mux.HandleFunc("/api/cleanup/preview", a.auth(a.handleCleanupPreview))
	mux.HandleFunc("/api/intelligence/graph", a.auth(a.handleIntelligenceGraph))
	mux.HandleFunc("/api/intelligence/timeline", a.auth(a.handleTimeline))
	mux.HandleFunc("/api/object/story", a.auth(a.handleObjectStory))
	mux.HandleFunc("/api/behavior", a.auth(a.handleBehavior))
	mux.HandleFunc("/api/behavior/history", a.auth(a.handleBehaviorHistory))
	mux.HandleFunc("/api/behavior/health", a.auth(a.handleBehaviorHealth))
	mux.HandleFunc("/api/trust/status", a.auth(a.handleTrustStatus))
	mux.HandleFunc("/api/trust/capture", a.auth(a.handleTrustCapture))
	mux.HandleFunc("/api/trust/compare", a.auth(a.handleTrustCompare))
	mux.HandleFunc("/api/trust/health", a.auth(a.handleTrustHealth))
	mux.HandleFunc("/api/trust/history", a.auth(a.handleTrustHistory))
	mux.HandleFunc("/api/trust/restore", a.auth(a.handleTrustRestore))
	mux.HandleFunc("/api/trust/export", a.auth(a.handleTrustExport))
	mux.HandleFunc("/api/doctor", a.auth(a.handleDoctor))
	mux.HandleFunc("/api/diagnostics/export", a.auth(a.work.wrap("diagnostics-export", a.handleDiagnosticsExport)))
	mux.HandleFunc("/api/integrity/inspect", a.auth(a.work.wrap("integrity-inspect", a.handleIntegrityInspect)))
	mux.HandleFunc("/api/self/integrity", a.auth(a.work.wrap("self-integrity", a.handleSelfIntegrity)))
	mux.HandleFunc("/api/persistence", a.auth(a.handlePersistence))
	mux.HandleFunc("/api/actions/status", a.auth(a.handleActionStatus))
	mux.HandleFunc("/api/actions/health", a.auth(a.handleActionHealth))
	mux.HandleFunc("/api/actions/preview", a.auth(a.handleActionPreview))
	mux.HandleFunc("/api/actions/execute", a.auth(a.handleActionExecute))
	mux.HandleFunc("/api/actions/journal", a.auth(a.handleActionJournal))
	mux.HandleFunc("/api/actions/vault", a.auth(a.handleVault))
	mux.HandleFunc("/api/actions/reveal", a.auth(a.handleReveal))
	mux.HandleFunc("/api/changes/status", a.auth(a.handleChangeStatus))
	mux.HandleFunc("/api/changes/events", a.auth(a.handleChangeEvents))
	mux.HandleFunc("/api/changes/start", a.auth(a.handleChangeStart))
	mux.HandleFunc("/api/changes/stop", a.auth(a.handleChangeStop))
	mux.HandleFunc("/api/changes/clear", a.auth(a.handleChangeClear))
	mux.HandleFunc("/api/changes/review", a.auth(a.work.wrap("targeted-review", a.handleChangeReview)))
	mux.HandleFunc("/api/changes/history", a.auth(a.handleChangeHistory))
	mux.HandleFunc("/api/changes/reconcile", a.auth(a.work.wrap("change-reconcile", a.handleChangeReconcile)))
	mux.HandleFunc("/api/incidents", a.auth(a.handleIncidents))
	mux.HandleFunc("/api/incidents/detail", a.auth(a.work.wrap("incident-deep-review", a.handleIncidentDetail)))
	mux.HandleFunc("/api/advanced-sensor/status", a.auth(a.handleAdvancedSensorStatus))
	mux.HandleFunc("/api/readiness", a.auth(a.work.wrap("readiness", a.handleReadiness)))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			page, readErr := fs.ReadFile(staticFS, "index.html")
			if readErr != nil {
				http.Error(w, "Sentinel dashboard unavailable", http.StatusInternalServerError)
				return
			}
			html := strings.Replace(
				string(page),
				"<script src=\"/app.js\"></script>",
				"<script src=\"/core-compat.js\"></script>\n<script src=\"/app.js\"></script>\n<script src=\"/investigation-bridge.js\"></script>",
				1,
			)
			if r.URL.Query().Get("desktop") == "1" {
				html = strings.Replace(html, "</body>", "<script src=\"/desktop-ui.js\"></script>\n</body>", 1)
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(html))
			return
		}
		fileServer.ServeHTTP(w, r)
	})

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		log.Fatal(err)
	}

	addr := listener.Addr().String()
	a.allowedHost = addr
	a.serverOrigin = "http://" + addr
	url := fmt.Sprintf("%s/#token=%s", a.serverOrigin, token)

	if *desktopMode {
		fmt.Println(desktopBootstrapLine(a.serverOrigin, token))
	}
	fmt.Printf("Sentinel macOS v%s\n", sentinelVersion)
	fmt.Println("Local-only system & security auditor")
	fmt.Println("Listening only on 127.0.0.1")
	fmt.Println("Open:", url)
	if *ephemeral {
		fmt.Println("Behavior baseline: ephemeral session only")
	}
	fmt.Println("Press Ctrl+C to stop.")

	if !*noBrowser && os.Getenv("SENTINEL_NO_BROWSER") == "" {
		go func() {
			time.Sleep(250 * time.Millisecond)
			_ = openBrowser(url)
		}()
	}

	server := &http.Server{
		Handler:           securityHeaders(a.requestGuard(mux)),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    32 << 10,
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- server.Serve(listener) }()
	sigCtx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()
	select {
	case err := <-serveErr:
		if err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	case <-sigCtx.Done():
		fmt.Println("\nStopping Sentinel safely…")
		a.shutdown()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_ = server.Shutdown(ctx)
		cancel()
		select {
		case err := <-serveErr:
			if err != nil && err != http.ErrServerClosed {
				log.Printf("server shutdown: %v", err)
			}
		case <-time.After(2 * time.Second):
		}
	}
}

func (a *app) shutdown() {
	if a == nil {
		return
	}
	if a.jobs != nil {
		a.jobs.cancelAll()
	}
	if a.changes != nil {
		a.changes.stop()
	}
}

func desktopBootstrapLine(origin, token string) string {
	payload, _ := json.Marshal(map[string]string{
		"origin":  origin,
		"token":   token,
		"version": sentinelVersion,
	})
	return "SENTINEL_DESKTOP_BOOTSTRAP " + string(payload)
}

func randomToken(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func (a *app) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Sentinel-Token") != a.token {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "invalid session token"})
			return
		}
		next(w, r)
	}
}

func (a *app) requestGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Defense-in-depth for a localhost application: reject unexpected Host
		// values (DNS rebinding) and cross-site browser requests before auth.
		if a.allowedHost != "" && r.Host != a.allowedHost {
			writeJSON(w, http.StatusMisdirectedRequest, map[string]any{"error": "unexpected Host header"})
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			if origin := r.Header.Get("Origin"); origin != "" && a.serverOrigin != "" && origin != a.serverOrigin {
				writeJSON(w, http.StatusForbidden, map[string]any{"error": "cross-origin API request rejected"})
				return
			}
			if site := strings.ToLower(strings.TrimSpace(r.Header.Get("Sec-Fetch-Site"))); site != "" && site != "same-origin" && site != "none" {
				writeJSON(w, http.StatusForbidden, map[string]any{"error": "cross-site API request rejected"})
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("X-DNS-Prefetch-Control", "off")
		w.Header().Set("X-Permitted-Cross-Domain-Policies", "none")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}

func commandExists(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

func cleanCommandPath(command string) string {
	fields := strings.Fields(command)
	if len(fields) == 0 {
		return ""
	}
	return strings.Trim(fields[0], "\"'")
}