// SPDX-License-Identifier: MPL-2.0
import AppKit
import Foundation

private struct Bootstrap: Decodable {
    let origin: String
    let token: String
    let version: String
}

private final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var window: NSWindow!
    private var engine: Process?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?
    private var stdoutBuffer = Data()
    private var stderrBuffer = Data()
    private var isQuitting = false
    private var dashboardURL: URL?
    private var didOpenDashboard = false

    private var statusLabel: NSTextField!
    private var detailLabel: NSTextField!
    private var openButton: NSButton!

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
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 300),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Sentinel Mac"
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

        let subtitle = NSTextField(labelWithString: "Local Mac System Intelligence")
        subtitle.font = .systemFont(ofSize: 13, weight: .regular)
        subtitle.textColor = .secondaryLabelColor

        statusLabel = NSTextField(labelWithString: "Starting local engine…")
        statusLabel.font = .systemFont(ofSize: 14, weight: .medium)

        detailLabel = NSTextField(wrappingLabelWithString: "Sentinel will open its dashboard in your default browser. Keep this app open while you use the localhost dashboard.")
        detailLabel.font = .systemFont(ofSize: 12)
        detailLabel.textColor = .secondaryLabelColor
        detailLabel.maximumNumberOfLines = 3

        openButton = NSButton(title: "Open Dashboard", target: self, action: #selector(openDashboard))
        openButton.bezelStyle = .rounded
        openButton.keyEquivalent = "\r"
        openButton.isEnabled = false

        let quitButton = NSButton(title: "Quit Sentinel", target: NSApplication.shared, action: #selector(NSApplication.terminate(_:)))
        quitButton.bezelStyle = .rounded

        let buttonRow = NSStackView(views: [openButton, quitButton])
        buttonRow.orientation = .horizontal
        buttonRow.alignment = .centerY
        buttonRow.spacing = 10

        let textStack = NSStackView(views: [title, subtitle, statusLabel, detailLabel, buttonRow])
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

            detailLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 390)
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
        appMenu.addItem(withTitle: "Open Dashboard", action: #selector(openDashboard), keyEquivalent: "o")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit Sentinel Mac", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        NSApplication.shared.mainMenu = main
    }

    @objc private func showAbout() {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        let alert = NSAlert()
        alert.messageText = "Sentinel Mac"
        alert.informativeText = "Local Mac System Intelligence\nVersion \(version)\n\nSentinel runs a loopback-only local engine and opens the full dashboard in your default browser."
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    @objc private func openDashboard() {
        guard let dashboardURL else {
            NSSound.beep()
            return
        }
        NSWorkspace.shared.open(dashboardURL)
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

            // Open the real localhost dashboard directly. The server injects only a
            // small desktop enhancement script when desktop=1 is present, so there is
            // no iframe and Sentinel's X-Frame-Options/CSP protections stay intact.
            components.path = "/"
            components.queryItems = [URLQueryItem(name: "desktop", value: "1")]
            components.fragment = "token=\(payload.token)"
            guard let url = components.url else { continue }

            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.dashboardURL = url
                self.window.title = "Sentinel Mac \(payload.version)"
                self.statusLabel.stringValue = "Running locally"
                self.detailLabel.stringValue = "Dashboard: \(payload.origin)\nKeep Sentinel Mac open while the browser dashboard is in use."
                self.openButton.isEnabled = true
                if !self.didOpenDashboard {
                    self.didOpenDashboard = true
                    self.openDashboard()
                }
            }
        }
    }

    private func showFatal(_ detail: String) {
        if isQuitting { return }
        statusLabel?.stringValue = "Engine unavailable"
        detailLabel?.stringValue = detail
        openButton?.isEnabled = false

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
