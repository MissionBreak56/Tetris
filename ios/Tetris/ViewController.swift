import UIKit
import WebKit
import UniformTypeIdentifiers

/// Tela única do app: um WKWebView que roda o mesmo jogo (HTML/JS) do Android, servido de dentro do app pelo esquema
/// `tetris://localhost/` (origem estável, então o localStorage dos dados do jogo continua o mesmo entre atualizações).
/// A ponte nativa expõe ao JavaScript o mesmo objeto `AndroidBridge` que o Android usa (rede local, compartilhar,
/// salvar/abrir arquivos, bateria, vibração).
final class ViewController: UIViewController, WKScriptMessageHandler, WKURLSchemeHandler, WKNavigationDelegate, UIDocumentPickerDelegate {
    private var web: WKWebView!
    private let lan = LanNet()
    private var picking = false                       // true = escolher arquivo para abrir; false = salvar
    private var statusTimer: Timer?
    private let hLight = UIImpactFeedbackGenerator(style: .light)
    private let hMed = UIImpactFeedbackGenerator(style: .medium)
    private let hHeavy = UIImpactFeedbackGenerator(style: .heavy)

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .bottom }   // evita sair do jogo sem querer ao deslizar do canto de baixo

    // MARK: ciclo de vida
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(self, forURLScheme: "tetris")
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.allowsInlineMediaPlayback = true
        let uc = WKUserContentController()
        uc.add(self, name: "bridge")
        uc.addUserScript(WKUserScript(source: shimSource(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        cfg.userContentController = uc
        web = WKWebView(frame: view.bounds, configuration: cfg)
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.scrollView.bounces = false
        web.scrollView.isScrollEnabled = false
        web.scrollView.contentInsetAdjustmentBehavior = .never      // a página usa env(safe-area-inset-*) (viewport-fit=cover)
        web.navigationDelegate = self
        view.addSubview(web)

        lan.onEvent = { [weak self] json in self?.js("Net._ev(\(json))") }
        lan.onLine = { [weak self] line in self?.js("Net._line(\(LanNet.q(line)))") }

        UIDevice.current.isBatteryMonitoringEnabled = true
        let nc = NotificationCenter.default
        for n in [UIDevice.batteryLevelDidChangeNotification, UIDevice.batteryStateDidChangeNotification, Notification.Name.NSProcessInfoPowerStateDidChange] {
            nc.addObserver(self, selector: #selector(pushStatus), name: n, object: nil)
        }
        statusTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.pushStatus() }

        web.load(URLRequest(url: URL(string: "tetris://localhost/index.html")!))
    }

    // MARK: JavaScript
    private func js(_ code: String) {
        DispatchQueue.main.async { [weak self] in self?.web?.evaluateJavaScript(code, completionHandler: nil) }
    }

    /// Valores que o JavaScript lê de forma síncrona (IP, bateria): a ponte os mantém atualizados.
    @objc private func pushStatus() {
        let d = UIDevice.current
        let lvl = d.batteryLevel < 0 ? 100 : Int((d.batteryLevel * 100).rounded())
        let charging = d.batteryState == .charging || d.batteryState == .full
        let battery = "{\"level\":\(lvl),\"charging\":\(charging),\"saver\":\(ProcessInfo.processInfo.isLowPowerModeEnabled)}"
        js("if(window.__ios){__ios.ips=\(LanNet.q(LanNet.localIpsJson()));__ios.ip=\(LanNet.q(LanNet.localIp()));__ios.battery=\(LanNet.q(battery));}")
    }

    private func shimSource() -> String {
        let ver = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? ""
        return #"""
        (function () {
          var S = window.__ios = { ver: \#(LanNet.q(ver)), ips: '[]', ip: '', battery: '' };
          function post(m, a) { try { window.webkit.messageHandlers.bridge.postMessage({ m: m, a: a || [] }); } catch (e) {} }
          window.AndroidBridge = {
            version: function () { return S.ver; },
            battery: function () { return S.battery; },
            lanIp: function () { return S.ip; },
            lanIps: function () { return S.ips; },
            share: function (t, x) { post('share', [t, x]); },
            saveFile: function (n, m, t) { post('saveFile', [n, m, t]); },
            pickFile: function () { post('pickFile'); },
            updateCheck: function () { post('updateCheck'); },
            updateDownload: function () { post('updateCheck'); },
            updateInstall: function () {},
            updateCancel: function () {},
            lanHost: function (n, p) { post('lanHost', [n, p]); },
            lanListen: function (p) { post('lanListen', [p]); },
            lanScan: function () { post('lanScan'); },
            lanJoin: function (ip, p) { post('lanJoin', [ip, p]); },
            lanSend: function (l) { post('lanSend', [l]); },
            lanClose: function () { post('lanClose'); }
          };
          // o Safari do iPhone não tem navigator.vibrate: usa o motor de vibração (haptics) do aparelho
          navigator.vibrate = function (p) {
            var ms = 0; if (Array.isArray(p)) { for (var i = 0; i < p.length; i += 2) ms += p[i]; } else ms = +p || 0;
            if (ms > 0) post('haptic', [ms]); return true;
          };
          document.addEventListener('gesturestart', function (e) { e.preventDefault(); });   // sem zoom por pinça
          document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        })();
        """#
    }

    // MARK: ponte JS -> nativo
    func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let d = message.body as? [String: Any], let m = d["m"] as? String else { return }
        let a = d["a"] as? [Any] ?? []
        func s(_ i: Int) -> String { i < a.count ? "\(a[i])" : "" }
        func n(_ i: Int) -> Int { i < a.count ? ((a[i] as? NSNumber)?.intValue ?? Int(s(i)) ?? 0) : 0 }
        switch m {
        case "lanHost": lan.host(name: s(0), port: n(1)); pushStatus()
        case "lanListen": lan.listen(port: n(0)); pushStatus()
        case "lanScan": lan.scan(millis: 4000)
        case "lanJoin": lan.join(ip: s(0), port: n(1))
        case "lanSend": lan.send(s(0))
        case "lanClose": lan.close()
        case "haptic":
            let ms = n(0)
            (ms <= 15 ? hLight : (ms <= 40 ? hMed : hHeavy)).impactOccurred()
        case "share": share(text: s(1))
        case "saveFile": saveFile(name: s(0), text: s(2))
        case "pickFile": pickFile()
        case "updateCheck":
            js("Updater._ev({\"e\":\"error\",\"msg\":\(LanNet.q("No iPhone a atualização é manual: baixe o novo arquivo IPA na página de releases do projeto no GitHub e instale de novo."))})")
        default: break
        }
    }

    // MARK: compartilhar / salvar / abrir arquivos
    private func share(text: String) {
        DispatchQueue.main.async {
            let vc = UIActivityViewController(activityItems: [text], applicationActivities: nil)
            vc.popoverPresentationController?.sourceView = self.view
            vc.popoverPresentationController?.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY, width: 1, height: 1)
            self.present(vc, animated: true)
        }
    }

    private func saveFile(name: String, text: String) {
        let safe = name.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: ":", with: "_")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(safe.isEmpty ? "tetris.txt" : safe)
        do { try Data(text.utf8).write(to: url, options: .atomic) } catch { js("Native._onSaved(false)"); return }
        DispatchQueue.main.async {
            self.picking = false
            let p = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
            p.delegate = self
            self.present(p, animated: true)
        }
    }

    private func pickFile() {
        DispatchQueue.main.async {
            self.picking = true
            let p = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.item], asCopy: true)
            p.allowsMultipleSelection = false
            p.delegate = self
            self.present(p, animated: true)
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        if !picking { js("Native._onSaved(true)"); return }
        guard let url = urls.first else { js("Native._onPicked(null,'Nenhum arquivo escolhido')"); return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { js("Native._onPicked(null,'Falha ao ler o arquivo')"); return }
        if data.count > 8_000_000 { js("Native._onPicked(null,'Arquivo muito grande')"); return }
        guard let text = String(data: data, encoding: .utf8) else { js("Native._onPicked(null,'Falha ao ler o arquivo')"); return }
        js("Native._onPicked(\(LanNet.q(text)),null)")
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        if picking { js("Native._onPicked(null,'Nenhum arquivo escolhido')") } else { js("Native._onSaved(false)") }
    }

    // MARK: arquivos do jogo (esquema tetris://)
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url, let root = Bundle.main.resourceURL?.appendingPathComponent("assets") else {
            urlSchemeTask.didFailWithError(URLError(.badURL)); return
        }
        var rel = url.path
        if rel.isEmpty || rel == "/" { rel = "/index.html" }
        let file = root.appendingPathComponent(String(rel.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path), let data = try? Data(contentsOf: file) else {
            let r = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!
            urlSchemeTask.didReceive(r); urlSchemeTask.didReceive(Data("404".utf8)); urlSchemeTask.didFinish(); return
        }
        let mimes = ["html": "text/html; charset=utf-8", "js": "application/javascript; charset=utf-8", "css": "text/css; charset=utf-8",
                     "json": "application/json; charset=utf-8", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                     "svg": "image/svg+xml", "webp": "image/webp", "ico": "image/x-icon", "txt": "text/plain; charset=utf-8",
                     "woff2": "font/woff2", "woff": "font/woff", "mp3": "audio/mpeg", "ogg": "audio/ogg", "wav": "audio/wav"]
        let mime = mimes[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let r = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                headerFields: ["Content-Type": mime, "Content-Length": "\(data.count)", "Cache-Control": "no-cache"])!
        urlSchemeTask.didReceive(r); urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    // MARK: navegação
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url?.scheme == "tetris" ? .allow : .cancel)     // só conteúdo do próprio app
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { pushStatus() }
}
