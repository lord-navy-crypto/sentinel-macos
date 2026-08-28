// SPDX-License-Identifier: MPL-2.0
import AppKit
import Foundation
import WebKit

private struct Bootstrap: Decodable {
    let origin: String
    let token: String
    let version: String
}

private final class SentinelNavigationDelegate: NSObject, WKNavigationDelegate, WKDownloadDelegate {
    var allowedOrigin: String?

    private func uniqueDownloadURL(suggestedFilename: String) -> URL {
        let fm = FileManager.default
        let downloads = fm.urls(for: .downloadsDirectory, in: .userDomainMask).first ?? fm.homeDirectoryForCurrentUser
        let clean = suggestedFilename.replacingOccurrences(of: "/", with: "-")
        var candidate = downloads.appendingPathComponent(clean)
        let ext = candidate.pathExtension
        let stem = candidate.deletingPathExtension().lastPathComponent
        var i = 2
        while fm.fileExists(atPath: candidate.path) {
            let name = ext.isEmpty ? "\(stem)-\(i)" : "\(stem)-\(i).\(ext)"
            candidate = downloads.appendingPathComponent(name)
            i += 1
        }
        return candidate
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        completionHandler(uniqueDownloadURL(suggestedFilename: suggestedFilename))
    }

    func downloadDidFinish(_ download: WKDownload) {
        NSSound.beep()
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        NSLog("Sentinel download failed: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let scheme = url.scheme?.lowercased() ?? ""
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        if scheme == "about" || scheme == "blob" {
            decisionHandler(.allow)
            return
        }
        if let origin = allowedOrigin,
           let base = URL(string: origin),
           url.scheme == base.scheme,
           url.host == base.host,
           url.port == base.port {
            decisionHandler(.allow)
            return
        }
        if scheme == "http" || scheme == "https" {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }
}

private final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var engine: Process?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?
    private var stdoutBuffer = Data()
    private var stderrBuffer = Data()
    private var isQuitting = false
    private let navigationDelegate = SentinelNavigationDelegate()

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWindow()
        startEngine()
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        isQuitting = true
        stopEngine()
    }

    func windowWillClose(_ notification: Notification) {
        NSApplication.shared.terminate(nil)
    }

    private func buildWindow() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = navigationDelegate

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Sentinel"
        window.minSize = NSSize(width: 920, height: 620)
        window.center()
        window.contentView = webView
        window.delegate = self
        window.makeKeyAndOrderFront(nil)
        showLoadingPage("Starting Sentinel engine…")
    }

    private func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Sentinel", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Reload Dashboard", action: #selector(reloadDashboard), keyEquivalent: "r")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit Sentinel", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        NSApplication.shared.mainMenu = main
    }

    @objc private func showAbout() {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        let alert = NSAlert()
        alert.messageText = "Sentinel"
        alert.informativeText = "Local Mac System Intelligence\nVersion \(version)\n\nYour Mac remains the server; this desktop shell embeds the local Sentinel dashboard."
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    @objc private func reloadDashboard() {
        webView.reload()
    }

    private func engineURL() -> URL? {
        guard let resources = Bundle.main.resourceURL else { return nil }
        #if arch(arm64)
        return resources.appendingPathComponent("bin/sentinel-macos-arm64")
        #elseif arch(x86_64)
        return resources.appendingPathComponent("bin/sentinel-macos-x86_64")
        #else
        return nil
        #endif
    }

    private func startEngine() {
        guard engine == nil else { return }
        guard let executable = engineURL(), FileManager.default.isExecutableFile(atPath: executable.path) else {
            showFatal("Sentinel engine is missing or not executable.")
            return
        }

        let process = Process()
        let out = Pipe()
        let err = Pipe()
        process.executableURL = executable
        process.arguments = ["--desktop", "--no-browser"]
        process.standardOutput = out
        process.standardError = err
        process.environment = ProcessInfo.processInfo.environment.merging(["SENTINEL_NO_BROWSER": "1"]) { _, new in new }

        out.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            self?.consumeStdout(data)
        }
        err.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            self?.stderrBuffer.append(data)
        }
        process.terminationHandler = { [weak self] p in
            DispatchQueue.main.async {
                guard let self, !self.isQuitting else { return }
                let detail = String(data: self.stderrBuffer.suffix(4096), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                self.showFatal(detail.isEmpty ? "Sentinel engine stopped unexpectedly (exit \(p.terminationStatus))." : detail)
            }
        }

        do {
            try process.run()
            engine = process
            stdoutPipe = out
            stderrPipe = err
        } catch {
            showFatal("Unable to start Sentinel engine: \(error.localizedDescription)")
        }
    }

    private func stopEngine() {
        stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        stderrPipe?.fileHandleForReading.readabilityHandler = nil
        if let engine, engine.isRunning {
            engine.terminate() // SIGTERM: the Go engine performs graceful checkpoint/shutdown work.
            let deadline = Date().addingTimeInterval(4)
            while engine.isRunning && Date() < deadline {
                RunLoop.current.run(until: Date().addingTimeInterval(0.05))
            }
            if engine.isRunning {
                engine.interrupt()
            }
        }
        engine = nil
    }

    private func consumeStdout(_ data: Data) {
        stdoutBuffer.append(data)
        while let newline = stdoutBuffer.firstRange(of: Data([0x0a])) {
            let lineData = stdoutBuffer.subdata(in: stdoutBuffer.startIndex..<newline.lowerBound)
            stdoutBuffer.removeSubrange(stdoutBuffer.startIndex...newline.lowerBound)
            guard let line = String(data: lineData, encoding: .utf8) else { continue }
            let prefix = "SENTINEL_DESKTOP_BOOTSTRAP "
            guard line.hasPrefix(prefix) else { continue }
            let jsonText = String(line.dropFirst(prefix.count))
            guard let payload = try? JSONDecoder().decode(Bootstrap.self, from: Data(jsonText.utf8)),
                  var components = URLComponents(string: payload.origin) else {
                DispatchQueue.main.async { [weak self] in self?.showFatal("Sentinel returned an invalid desktop bootstrap payload.") }
                continue
            }
            components.fragment = "token=\(payload.token)"
            guard let url = components.url else { continue }
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.navigationDelegate.allowedOrigin = payload.origin
                self.window.title = "Sentinel \(payload.version)"
                self.webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15))
            }
        }
    }

    private func showLoadingPage(_ message: String) {
        let html = """
        <!doctype html><meta charset='utf-8'><style>
        html,body{height:100%;margin:0;background:#0b1020;color:#edf2ff;font:15px -apple-system,BlinkMacSystemFont,sans-serif}
        body{display:grid;place-items:center}.box{text-align:center}.dot{font-size:36px;margin-bottom:14px}
        </style><div class='box'><div class='dot'>◉</div><b>Sentinel</b><p>\(message)</p></div>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    private func showFatal(_ detail: String) {
        showLoadingPage("Engine unavailable")
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Sentinel could not start"
        alert.informativeText = detail
        alert.addButton(withTitle: "Quit")
        alert.runModal()
        NSApplication.shared.terminate(nil)
    }
}

let application = NSApplication.shared
application.setActivationPolicy(.regular)
let delegate = AppDelegate()
application.delegate = delegate
application.run()
