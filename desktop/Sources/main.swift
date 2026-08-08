import Cocoa
import WebKit

final class HeliosBridge: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?
    private var process: Process?
    private var input: FileHandle?
    private var buffer = Data()
    private var reconnectWorkItem: DispatchWorkItem?
    private var reconnectAttempt = 0
    private var stopping = false

    init(webView: WKWebView) { self.webView = webView }

    func start() {
        guard process?.isRunning != true else { return }
        reconnectWorkItem?.cancel()
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let sourceCheckout = Bundle.main.bundleURL
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("src/cli.mjs").path
        let candidates = [
            ProcessInfo.processInfo.environment["HELIOS_DESKTOP_HELIOS"],
            sourceCheckout,
            home + "/.local/bin/helios",
            "/usr/local/bin/helios",
            "/opt/homebrew/bin/helios",
        ].compactMap { $0 }
        guard let executable = candidates.first(where: FileManager.default.isExecutableFile) else {
            send(["event": "bridge.error", "message": "Helios CLI is not installed. Install Helios first, then reopen Desktop."])
            return
        }
        guard let node = resolveNode() else {
            send(["event": "bridge.error", "message": "Node.js was not found. Open Terminal, confirm node works, then reopen Desktop."])
            return
        }
        let task = Process(), stdin = Pipe(), stdout = Pipe(), stderr = Pipe()
        task.executableURL = URL(fileURLWithPath: node)
        task.arguments = [executable, "desktop-bridge"]
        task.standardInput = stdin; task.standardOutput = stdout; task.standardError = stderr
        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in self?.consume(handle.availableData) }
        stderr.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let message = String(data: handle.availableData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
            if let message, !message.isEmpty { self?.send(["event": "bridge.error", "message": message]) }
        }
        task.terminationHandler = { [weak self, weak task] _ in
            guard let self, self.process === task else { return }
            self.process = nil; self.input = nil
            if !self.stopping { self.scheduleReconnect() }
        }
        do {
            try task.run(); process = task; input = stdin.fileHandleForWriting
            send(["event": "bridge.ready"])
            DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self, weak task] in
                guard let self, let task, self.process === task, task.isRunning else { return }
                self.reconnectAttempt = 0
            }
        } catch {
            send(["event": "bridge.error", "message": error.localizedDescription])
            scheduleReconnect()
        }
    }

    private func scheduleReconnect() {
        guard !stopping, reconnectWorkItem == nil else { return }
        reconnectAttempt += 1
        let delay = min(pow(2.0, Double(reconnectAttempt - 1)), 15.0)
        send(["event": "bridge.reconnecting", "attempt": reconnectAttempt])
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.reconnectWorkItem = nil; self.start()
        }
        reconnectWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func resolveNode() -> String? {
        let direct = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
        if let node = direct.first(where: FileManager.default.isExecutableFile) { return node }
        let task = Process(), output = Pipe()
        task.executableURL = URL(fileURLWithPath: "/bin/zsh")
        task.arguments = ["-lc", "command -v node"]
        task.standardOutput = output
        task.standardError = FileHandle.nullDevice
        do {
            try task.run(); task.waitUntilExit()
            let value = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return value.flatMap { FileManager.default.isExecutableFile(atPath: $0) ? $0 : nil }
        } catch { return nil }
    }

    private func consume(_ data: Data) {
        guard !data.isEmpty else { return }
        buffer.append(data)
        while let newline = buffer.firstIndex(of: 10) {
            let line = buffer.prefix(upTo: newline); buffer.removeSubrange(...newline)
            if let object = try? JSONSerialization.jsonObject(with: line) as? [String: Any] { send(object) }
        }
    }

    private func send(_ object: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: object),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in self?.webView?.evaluateJavaScript("window.__heliosReceive(\(json))") }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let request = message.body as? [String: Any],
              let data = try? JSONSerialization.data(withJSONObject: request) else { return }
        input?.write(data); input?.write(Data([10]))
    }

    func stop() {
        stopping = true; reconnectWorkItem?.cancel(); reconnectWorkItem = nil
        input?.closeFile(); process?.terminate(); process = nil; input = nil
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var bridge: HeliosBridge!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let controller = WKUserContentController()
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        bridge = HeliosBridge(webView: webView)
        controller.add(bridge, name: "helios")
        webView.setValue(false, forKey: "drawsBackground")

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "Helios"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = .black
        window.minSize = NSSize(width: 880, height: 620)
        window.center()
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        guard let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Resources") else {
            fatalError("Desktop resource index.html is missing.")
        }
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        bridge.start()
    }

    func applicationWillTerminate(_ notification: Notification) { bridge.stop() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
