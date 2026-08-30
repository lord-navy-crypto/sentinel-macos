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
    private var appViewWindow: NSWindow?
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
    private var browserButton: NSButton!
    private var appViewButton: NSButton!

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
            contentRect: NSRect(x: 0, y: 0, width: 650, height: 330),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Sentinel Mac 2.4"
        window.center()
        window.delegate = self

        let root = NSView()
        root.translatesAutoresizingMaskIntoConstraints = false
        window.contentView = root

        let icon = NSTextField(labelWithString: "S")
        icon.alignment = .center
        icon.font = .systemFont(ofSize: 30, weight: .bold)
        icon.textColor = .white
        icon.wantsLayer = true
        icon.layer?.backgroundColor = NSColor.labelColor.cgColor
        icon.layer?.cornerRadius = 16
        icon.translatesAutoresizingMaskIntoConstraints = false

        let title = NSTextField(labelWithString: "Sentinel Mac")
        title.font = .systemFont(ofSize: 24, weight: .semibold)

        let subtitle = NSTextField(labelWithString: "Local Evidence · Native Frontend")
        subtitle.font = .systemFont(ofSize: 13, weight: .regular)
        subtitle.textColor = .secondaryLabelColor

        statusLabel = NSTextField(labelWithString: "Starting local engine…")
        statusLabel.font = .systemFont(ofSize: 14, weight: .medium)

        detailLabel = NSTextField(wrappingLabelWithString: "Sentinel starts one loopback-only engine and one Sentinel 2.4 product interface. Open it in your browser or inside the native App View; both containers use the same local source, session, and evidence.")
        detailLabel.font = .systemFont(ofSize: 12)
        detailLabel.textColor = .secondaryLabelColor
        detailLabel.maximumNumberOfLines = 4

        browserButton = NSButton(title: "Open in Browser", target: self, action: #selector(openBrowserProduct))
        browserButton.bezelStyle = .rounded
        browserButton.keyEquivalent = "\r"
        browserButton.isEnabled = false

        appViewButton = NSButton(title: "Open App View", target: self, action: #selector(openAppView))
        appViewButton.bezelStyle = .rounded
        appViewButton.isEnabled = false

        let quitButton = NSButton(title: "Quit Sentinel", target: NSApplication.shared, action: #selector(NSApplication.terminate(_:)))
        quitButton.bezelStyle = .rounded

        let buttonRow = NSStackView(views: [browserButton, appViewButton, quitButton])
        buttonRow.orientation = .horizontal
        buttonRow.alignment = .centerY
        buttonRow.spacing = 10

        let hint = NSTextField(labelWithString: "Browser and App View render the same Sentinel 2.4 Native Frontend; only the window container differs.")
        hint.font = .systemFont(ofSize: 11)
        hint.textColor = .tertiaryLabelColor

        let textStack = NSStackView(views: [title, subtitle, statusLabel, detailLabel, buttonRow, hint])
        textStack.orientation = .vertical
        textStack.alignment = .leading
        textStack.spacing = 9
        textStack.translatesAutoresizingMaskIntoConstraints = false

        root.addSubview(icon)
        root.addSubview(textStack)

        NSLayoutConstraint.activate([
            icon.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 28),
            icon.topAnchor.constraint(equalTo: root.topAnchor, constant: 30),
            icon.widthAnchor.constraint(equalToConstant: 64),
            icon.heightAnchor.constraint(equalToConstant: 64),

            textStack.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 22),
            textStack.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -28),
            textStack.topAnchor.constraint(equalTo: root.topAnchor, constant: 28),
            textStack.bottomAnchor.constraint(lessThanOrEqualTo: root.bottomAnchor, constant: -28),

            detailLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 465)
        ])

        window.makeKeyAndOrderFront(nil)
    }

    private func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        main.addItem(appItem)

        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Sentinel Mac", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Open in Browser", action: #selector(openBrowserProduct), keyEquivalent: "o")
        appMenu.addItem(withTitle: "Open App View", action: #selector(openAppView), keyEquivalent: "a")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit Sentinel Mac", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        NSApplication.shared.mainMenu = main
    }

    @objc private func showAbout() {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        let ui = Bundle.main.object(forInfoDictionaryKey: "SentinelDesktopUI") as? String ?? "2.4 Native Frontend"
        let alert = NSAlert()
        alert.messageText = "Sentinel Mac"
        alert.informativeText = "Local Evidence\nVersion \(version)\n\(ui)\n\nSentinel runs one architecture-matched, loopback-only local engine. Browser and native App View render the same token-authenticated Sentinel product source."
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    @objc private func openBrowserProduct() {
        guard let productURL else {
            NSSound.beep()
            return
        }
        NSWorkspace.shared.open(productURL)
    }

    @objc private func openAppView() {
        guard let productURL else {
            NSSound.beep()
            return
        }

        if let appViewWindow, let webView {
            if webView.url != productURL {
                webView.load(URLRequest(url: productURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
            }
            appViewWindow.makeKeyAndOrderFront(nil)
            NSApplication.shared.activate(ignoringOtherApps: true)
            return
        }

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        let view = WKWebView(frame: .zero, configuration: config)
        view.translatesAutoresizingMaskIntoConstraints = false
        view.uiDelegate = self
        view.navigationDelegate = self

        let appWindow = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        appWindow.title = "Sentinel 2.4 · Local Evidence"
        appWindow.minSize = NSSize(width: 1080, height: 700)
        appWindow.isReleasedWhenClosed = false
        appWindow.contentView = view
        appWindow.center()

        self.webView = view
        self.appViewWindow = appWindow

        view.load(URLRequest(url: productURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
        appWindow.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    private func isAllowedProductURL(_ url: URL?) -> Bool {
        guard let url else { return false }
        if url.scheme == "about" || url.scheme == "blob" { return true }
        guard url.scheme == "http", url.host == "127.0.0.1" else { return false }
        guard let productURL else { return true }
        return url.port == productURL.port
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if isAllowedProductURL(url) {
            decisionHandler(.allow)
        } else {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if isAllowedProductURL(url) {
                webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
            } else {
                NSWorkspace.shared.open(url)
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "Sentinel Mac"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Sentinel Mac"
        alert.informativeText = message
        alert.addButton(withTitle: "Continue")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Sentinel Mac"
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

            components.path = "/"
            components.query = nil
            components.fragment = "token=\(payload.token)"
            guard let url = components.url else { continue }

            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.productURL = url
                self.window.title = "Sentinel Mac \(payload.version)"
                self.statusLabel.stringValue = "Local engine ready · Sentinel \(payload.version)"
                self.detailLabel.stringValue = "Product source: \(payload.origin)\nBrowser and App View both open the same Sentinel 2.4 Native Frontend and the same token-authenticated local evidence session."
                self.browserButton.isEnabled = true
                self.appViewButton.isEnabled = true
            }
        }
    }

    private func showFatal(_ detail: String) {
        if isQuitting { return }
        statusLabel?.stringValue = "Engine unavailable"
        detailLabel?.stringValue = detail
        browserButton?.isEnabled = false
        appViewButton?.isEnabled = false

        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Sentinel Mac could not start"
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
