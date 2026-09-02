// SPDX-License-Identifier: MPL-2.0
import AppKit
import Foundation
import WebKit

private struct Bootstrap: Decodable {
    let origin: String
    let token: String
    let version: String
}

private final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView?
    private var engine: Process?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?
    private var stdoutBuffer = Data()
    private var stderrBuffer = Data()
    private var isQuitting = false
    private var productURL: URL?

    private var statusLabel: NSTextField!
    private var detailLabel: NSTextField!

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
        if notification.object as AnyObject? === window {
            NSApplication.shared.terminate(nil)
        }
    }

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Sentinel · Local Evidence"
        window.minSize = NSSize(width: 1080, height: 700)
        window.center()
        window.delegate = self

        let root = NSView()
        root.translatesAutoresizingMaskIntoConstraints = false
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        window.contentView = root

        let icon = NSTextField(labelWithString: "S")
        icon.alignment = .center
        icon.font = .systemFont(ofSize: 30, weight: .bold)
        icon.textColor = .white
        icon.wantsLayer = true
        icon.layer?.backgroundColor = NSColor.labelColor.cgColor
        icon.layer?.cornerRadius = 16
        icon.translatesAutoresizingMaskIntoConstraints = false

        let title = NSTextField(labelWithString: "Sentinel")
        title.font = .systemFont(ofSize: 25, weight: .semibold)

        let subtitle = NSTextField(labelWithString: "Local Evidence · Native App")
        subtitle.font = .systemFont(ofSize: 13)
        subtitle.textColor = .secondaryLabelColor

        statusLabel = NSTextField(labelWithString: "Starting local engine…")
        statusLabel.font = .systemFont(ofSize: 14, weight: .medium)

        detailLabel = NSTextField(wrappingLabelWithString: "Sentinel is starting its architecture-matched, loopback-only local engine. The product opens directly in this native app window.")
        detailLabel.font = .systemFont(ofSize: 12)
        detailLabel.textColor = .secondaryLabelColor
        detailLabel.maximumNumberOfLines = 4

        let progress = NSProgressIndicator()
        progress.style = .spinning
        progress.controlSize = .small
        progress.startAnimation(nil)

        let loadingRow = NSStackView(views: [progress, statusLabel])
        loadingRow.orientation = .horizontal
        loadingRow.alignment = .centerY
        loadingRow.spacing = 9

        let textStack = NSStackView(views: [title, subtitle, loadingRow, detailLabel])
        textStack.orientation = .vertical
        textStack.alignment = .leading
        textStack.spacing = 9
        textStack.translatesAutoresizingMaskIntoConstraints = false

        root.addSubview(icon)
        root.addSubview(textStack)

        NSLayoutConstraint.activate([
            icon.centerYAnchor.constraint(equalTo: root.centerYAnchor, constant: -24),
            icon.trailingAnchor.constraint(equalTo: root.centerXAnchor, constant: -18),
            icon.widthAnchor.constraint(equalToConstant: 64),
            icon.heightAnchor.constraint(equalToConstant: 64),

            textStack.leadingAnchor.constraint(equalTo: root.centerXAnchor, constant: 10),
            textStack.centerYAnchor.constraint(equalTo: root.centerYAnchor),
            textStack.widthAnchor.constraint(lessThanOrEqualToConstant: 520)
        ])

        window.makeKeyAndOrderFront(nil)
    }

    private func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        main.addItem(appItem)

        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Sentinel", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(withTitle: "Reload Sentinel", action: #selector(reloadProduct), keyEquivalent: "r")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit Sentinel", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        NSApplication.shared.mainMenu = main
    }

    private func bundleVersion() -> String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
    }

    @objc private func showAbout() {
        let version = bundleVersion()
        let ui = Bundle.main.object(forInfoDictionaryKey: "SentinelDesktopUI") as? String ?? "2.7 Native Frontend"
        let alert = NSAlert()
        alert.messageText = "Sentinel"
        alert.informativeText = "Local Evidence\nVersion \(version)\n\(ui)\n\nSentinel is a native macOS app backed by one architecture-matched, loopback-only local engine and a token-authenticated App View."
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    @objc private func reloadProduct() {
        guard let productURL, isAllowedProductURL(productURL) else {
            NSSound.beep()
            return
        }
        if let webView {
            webView.load(URLRequest(url: productURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
        } else {
            showProduct(productURL, version: bundleVersion())
        }
    }

    private func makeWebView() -> WKWebView {
        let config = WKWebViewConfiguration()
        // Keep downloaded Local AI artifacts across launches. The native marker
        // lets the frontend avoid worker paths that WKWebView cannot support.
        config.websiteDataStore = .default()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        let nativeMarker = WKUserScript(
            source: "window.__sentinelNativeAppView = true;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(nativeMarker)

        let view = WKWebView(frame: .zero, configuration: config)
        view.autoresizingMask = [.width, .height]
        view.uiDelegate = self
        view.navigationDelegate = self
        return view
    }

    private func showProduct(_ url: URL, version: String) {
        productURL = url
        let view = webView ?? makeWebView()
        webView = view
        window.title = "Sentinel \(version) · Local Evidence"
        window.contentView = view
        view.frame = window.contentView?.bounds ?? .zero
        view.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    private func productOrigin() -> String? {
        guard let productURL,
              productURL.scheme == "http",
              productURL.host == "127.0.0.1",
              let port = productURL.port else { return nil }
        return "http://127.0.0.1:\(port)"
    }

    private func isAllowedProductURL(_ url: URL?) -> Bool {
        guard let url else { return false }
        if url.scheme == "about" {
            return url.absoluteString == "about:blank"
        }
        if url.scheme == "blob" {
            guard let origin = productOrigin() else { return false }
            return url.absoluteString.hasPrefix("blob:\(origin)/")
        }
        guard url.scheme == "http",
              url.host == "127.0.0.1",
              url.user == nil,
              url.password == nil,
              let port = url.port else { return false }
        guard let productURL, let productPort = productURL.port else { return false }
        return port == productPort
    }

    private func isSafeExternalURL(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https" else { return false }
        guard url.host != nil, url.user == nil, url.password == nil else { return false }
        return true
    }

    private func openExternalIfUserActivated(_ url: URL, navigationAction: WKNavigationAction) {
        guard navigationAction.navigationType == .linkActivated, isSafeExternalURL(url) else { return }
        NSWorkspace.shared.open(url)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if isAllowedProductURL(url) {
            decisionHandler(.allow)
        } else {
            openExternalIfUserActivated(url, navigationAction: navigationAction)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if isAllowedProductURL(url) {
                webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
            } else {
                openExternalIfUserActivated(url, navigationAction: navigationAction)
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "Sentinel"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Sentinel"
        alert.informativeText = message
        alert.addButton(withTitle: "Continue")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Sentinel"
        alert.informativeText = prompt
        let input = NSTextField(string: defaultText ?? "")
        input.frame = NSRect(x: 0, y: 0, width: 360, height: 24)
        alert.accessoryView = input
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn ? input.stringValue : nil)
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
        webView?.stopLoading()
        if let engine, engine.isRunning {
            engine.terminate()
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

    private func validBootstrapToken(_ token: String) -> Bool {
        guard token.count == 48 else { return false }
        return token.unicodeScalars.allSatisfy { scalar in
            (scalar.value >= 48 && scalar.value <= 57) || (scalar.value >= 97 && scalar.value <= 102)
        }
    }

    private func validatedBootstrapURL(_ payload: Bootstrap) -> URL? {
        guard payload.version == bundleVersion(), validBootstrapToken(payload.token) else { return nil }
        guard var components = URLComponents(string: payload.origin),
              components.scheme == "http",
              components.host == "127.0.0.1",
              let port = components.port,
              port > 0 && port <= 65535,
              components.user == nil,
              components.password == nil,
              components.query == nil,
              components.fragment == nil,
              components.path.isEmpty || components.path == "/" else { return nil }
        components.path = "/"
        components.query = nil
        components.fragment = "token=\(payload.token)"
        return components.url
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
                  let url = validatedBootstrapURL(payload) else {
                DispatchQueue.main.async { [weak self] in self?.showFatal("Sentinel returned an invalid or mismatched desktop bootstrap payload.") }
                continue
            }

            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.showProduct(url, version: payload.version)
            }
        }
    }

    private func showFatal(_ detail: String) {
        if isQuitting { return }
        statusLabel?.stringValue = "Engine unavailable"
        detailLabel?.stringValue = detail

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
private let delegate = AppDelegate()
application.delegate = delegate
application.run()
