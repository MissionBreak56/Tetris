import Foundation
import Darwin

/// Rede local do Tetris para iPhone: porta fiel da classe Java `LanNet` (mesmo protocolo, então iPhone e Android jogam entre si).
/// - Anfitrião: servidor TCP + anúncio por broadcast UDP até alguém conectar.
/// - Cliente: procura anúncios (scan) ou conecta direto por IP.
/// - Uma única conexão, mensagens em linhas UTF-8 (JSON gerado pelo JavaScript).
/// Obs.: o iOS só libera broadcast/multicast para apps com um entitlement especial da Apple; sem ele a busca automática
/// de salas pode não achar nada. Entrar digitando o IP do anfitrião (TCP) funciona normalmente.
final class LanNet {
    static let tcpPort = 47600
    static let udpPortDefault: UInt16 = 47601
    private static let magic = "TETRIS1"
    private static let maxLine = 16384

    var onEvent: ((String) -> Void)?     // JSON de evento ({"e":"hosting",...})
    var onLine: ((String) -> Void)?      // linha recebida do oponente

    private let udpPort: UInt16
    private let lock = NSLock()
    private var gen = 0                  // cada host/join/scan/close cancela as threads anteriores
    private var serverFd: Int32 = -1
    private var sockFd: Int32 = -1
    private let sendQ = DispatchQueue(label: "tetris.lan.send")

    init(udpPort: UInt16 = LanNet.udpPortDefault) { self.udpPort = udpPort }

    // MARK: util
    /// Texto JSON entre aspas (igual ao `q` do Java).
    static func q(_ s: String) -> String {
        var out = "\""
        for u in s.unicodeScalars {
            switch u {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if u.value < 0x20 || u.value == 0x2028 || u.value == 0x2029 { out += String(format: "\\u%04x", u.value) }
                else { out.unicodeScalars.append(u) }
            }
        }
        return out + "\""
    }

    private func emit(_ json: String) { onEvent?(json) }
    private func alive(_ g: Int) -> Bool { lock.lock(); defer { lock.unlock() }; return g == gen }
    private static func errText() -> String { String(cString: strerror(errno)) }

    private func closeFd(_ fd: Int32) { if fd >= 0 { _ = Darwin.shutdown(fd, SHUT_RDWR); _ = Darwin.close(fd) } }
    private func closeLocked() { closeFd(serverFd); closeFd(sockFd); serverFd = -1; sockFd = -1 }

    private static func sockAddr(_ addr: in_addr, port: UInt16) -> sockaddr_in {
        var a = sockaddr_in()
        a.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        a.sin_family = sa_family_t(AF_INET)
        a.sin_port = port.bigEndian
        a.sin_addr = addr
        return a
    }

    private static func ipString(_ addr: in_addr) -> String {
        var buf = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
        var a = addr
        inet_ntop(AF_INET, &a, &buf, socklen_t(INET_ADDRSTRLEN))
        return String(cString: buf)
    }

    /// IPv4 ativos do aparelho: [(nome da interface, ip)].
    private static func interfaces() -> [(String, String)] {
        var res: [(String, String)] = []
        var ifap: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifap) == 0, let first = ifap else { return res }
        defer { freeifaddrs(ifap) }
        var p: UnsafeMutablePointer<ifaddrs>? = first
        while let cur = p {
            let f = Int32(cur.pointee.ifa_flags)
            if (f & IFF_UP) != 0, (f & IFF_LOOPBACK) == 0, let sa = cur.pointee.ifa_addr, sa.pointee.sa_family == sa_family_t(AF_INET) {
                let sin = sa.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee }
                let ip = ipString(sin.sin_addr)
                if !ip.hasPrefix("169.254.") { res.append((String(cString: cur.pointee.ifa_name), ip)) }
            }
            p = cur.pointee.ifa_next
        }
        return res
    }

    private static func isPrivate(_ ip: String) -> Bool {
        if ip.hasPrefix("10.") || ip.hasPrefix("192.168.") { return true }
        let parts = ip.split(separator: ".")
        if parts.count == 4, parts[0] == "172", let b = Int(parts[1]) { return b >= 16 && b <= 31 }
        return false
    }

    /// IPv4 local preferindo endereços privados (Wi-Fi/hotspot).
    static func localIp() -> String {
        let all = interfaces()
        if let p = all.first(where: { isPrivate($0.1) }) { return p.1 }
        return all.first?.1 ?? ""
    }

    /// [{"n":"en0","ip":"192.168.0.5"}, ...]
    static func localIpsJson() -> String {
        let items = interfaces().prefix(8).map { "{\"n\":\(q($0.0)),\"ip\":\(q($0.1))}" }
        return "[" + items.joined(separator: ",") + "]"
    }

    private static func broadcastTargets() -> [in_addr] {
        var r = [in_addr(s_addr: UInt32.max)]            // 255.255.255.255
        var ifap: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifap) == 0, let first = ifap else { return r }
        defer { freeifaddrs(ifap) }
        var p: UnsafeMutablePointer<ifaddrs>? = first
        while let cur = p {
            let f = Int32(cur.pointee.ifa_flags)
            if (f & IFF_UP) != 0, (f & IFF_BROADCAST) != 0, (f & IFF_LOOPBACK) == 0,
               let da = cur.pointee.ifa_dstaddr, da.pointee.sa_family == sa_family_t(AF_INET) {
                let sin = da.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee }
                r.append(sin.sin_addr)
            }
            p = cur.pointee.ifa_next
        }
        return r
    }

    // MARK: anfitrião
    func host(name: String, port: Int) { hostImpl(name: name, port: port, announce: true) }
    /// Reabre a porta SEM anunciar a sala: usado pelo anfitrião para o cliente retomar uma partida depois de uma queda.
    func listen(port: Int) { hostImpl(name: "", port: port, announce: false) }

    private func hostImpl(name: String, port: Int, announce: Bool) {
        lock.lock(); closeLocked(); gen += 1; let g = gen; lock.unlock()
        Thread.detachNewThread { [self] in
            let ss = socket(AF_INET, SOCK_STREAM, 0)
            if ss < 0 { hostFail(g, "Não foi possível abrir a sala: \(LanNet.errText())"); return }
            var one: Int32 = 1
            setsockopt(ss, SOL_SOCKET, SO_REUSEADDR, &one, socklen_t(MemoryLayout<Int32>.size))
            var addr = LanNet.sockAddr(in_addr(s_addr: 0), port: UInt16(truncatingIfNeeded: port))
            let rb = withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(ss, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
            if rb != 0 || Darwin.listen(ss, 1) != 0 {
                let why = LanNet.errText(); _ = Darwin.close(ss)
                hostFail(g, "Não foi possível abrir a sala: \(why)"); return
            }
            lock.lock()
            if g != gen { lock.unlock(); _ = Darwin.close(ss); return }
            serverFd = ss
            lock.unlock()
            var bound = sockaddr_in(); var blen = socklen_t(MemoryLayout<sockaddr_in>.size)
            _ = withUnsafeMutablePointer(to: &bound) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(ss, $0, &blen) } }
            let p = Int(UInt16(bigEndian: bound.sin_port))
            emit("{\"e\":\"hosting\",\"ip\":\(LanNet.q(LanNet.localIp())),\"ips\":\(LanNet.localIpsJson()),\"port\":\(p)}")
            if announce { startAnnouncer(g, name, p) }
            while true {
                lock.lock(); let open = (g == gen && serverFd == ss); lock.unlock()
                if !open { return }
                var pfd = pollfd(fd: ss, events: Int16(POLLIN), revents: 0)
                let r = poll(&pfd, 1, 250)
                if r < 0 && errno != EINTR { break }
                if r <= 0 { continue }
                let c = accept(ss, nil, nil)
                if c < 0 { if errno == EINTR || errno == EAGAIN || errno == ECONNABORTED { continue }; break }
                lock.lock()
                if g != gen { lock.unlock(); _ = Darwin.close(c); return }
                serverFd = -1
                lock.unlock()
                _ = Darwin.close(ss)
                attach(c, g)
                return
            }
            hostFail(g, "Não foi possível abrir a sala: \(LanNet.errText())")
        }
    }

    private func hostFail(_ g: Int, _ msg: String) {
        if !alive(g) { return }
        emit("{\"e\":\"error\",\"msg\":\(LanNet.q(msg))}")
        close()
    }

    private func startAnnouncer(_ g: Int, _ name: String, _ port: Int) {
        Thread.detachNewThread { [self] in
            let fd = socket(AF_INET, SOCK_DGRAM, 0)
            if fd < 0 { return }
            defer { _ = Darwin.close(fd) }
            var on: Int32 = 1
            setsockopt(fd, SOL_SOCKET, SO_BROADCAST, &on, socklen_t(MemoryLayout<Int32>.size))
            let clean = name.replacingOccurrences(of: "|", with: " ").replacingOccurrences(of: "\n", with: " ")
            let data = Array("\(LanNet.magic)|1|\(clean)|\(port)".utf8)
            while true {
                lock.lock(); let go = (g == gen && serverFd >= 0); lock.unlock()
                if !go { break }
                for t in LanNet.broadcastTargets() {
                    var sa = LanNet.sockAddr(t, port: udpPort)
                    _ = data.withUnsafeBytes { dp in
                        withUnsafePointer(to: &sa) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                            sendto(fd, dp.baseAddress, dp.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
                        } }
                    }
                }
                Thread.sleep(forTimeInterval: 0.8)
            }
        }
    }

    // MARK: procurar salas
    func scan(millis: Int) {
        lock.lock(); closeLocked(); gen += 1; let g = gen; lock.unlock()
        Thread.detachNewThread { [self] in
            var seen = Set<String>()
            let fd = socket(AF_INET, SOCK_DGRAM, 0)
            var failed: String? = nil
            if fd < 0 { failed = LanNet.errText() }
            else {
                var one: Int32 = 1
                setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, socklen_t(MemoryLayout<Int32>.size))
                setsockopt(fd, SOL_SOCKET, SO_REUSEPORT, &one, socklen_t(MemoryLayout<Int32>.size))
                var tv = timeval(tv_sec: 0, tv_usec: 250_000)
                setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
                var addr = LanNet.sockAddr(in_addr(s_addr: 0), port: udpPort)
                let rb = withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
                if rb != 0 { failed = LanNet.errText() }
            }
            if let why = failed {
                if fd >= 0 { _ = Darwin.close(fd) }
                if alive(g) {
                    emit("{\"e\":\"error\",\"msg\":\(LanNet.q("Falha ao procurar salas: \(why)"))}")
                    emit("{\"e\":\"scanDone\"}")
                }
                return
            }
            defer { _ = Darwin.close(fd) }
            let end = Date().addingTimeInterval(Double(millis) / 1000)
            var buf = [UInt8](repeating: 0, count: 512)
            while Date() < end {
                if !alive(g) { return }
                var src = sockaddr_in(); var slen = socklen_t(MemoryLayout<sockaddr_in>.size)
                let n = withUnsafeMutablePointer(to: &src) { sp in
                    sp.withMemoryRebound(to: sockaddr.self, capacity: 1) { recvfrom(fd, &buf, buf.count, 0, $0, &slen) }
                }
                if n <= 0 { continue }                                   // tempo esgotado: confere se ainda vale
                let text = String(decoding: buf[0..<n], as: UTF8.self)
                let f = text.split(separator: "|", maxSplits: 3, omittingEmptySubsequences: false).map(String.init)
                guard f.count == 4, f[0] == LanNet.magic, f[1] == "1", let port = Int(f[3].trimmingCharacters(in: .whitespaces)), port >= 1, port <= 65535 else { continue }
                let ip = LanNet.ipString(src.sin_addr)
                if !seen.insert("\(ip):\(port)").inserted { continue }
                let nm = f[2].count > 24 ? String(f[2].prefix(24)) : f[2]
                emit("{\"e\":\"found\",\"name\":\(LanNet.q(nm)),\"ip\":\(LanNet.q(ip)),\"port\":\(port)}")
            }
            if alive(g) { emit("{\"e\":\"scanDone\"}") }
        }
    }

    // MARK: entrar numa sala
    func join(ip: String, port: Int) {
        lock.lock(); closeLocked(); gen += 1; let g = gen; lock.unlock()
        Thread.detachNewThread { [self] in
            func fail(_ why: String) { if alive(g) { emit("{\"e\":\"error\",\"msg\":\(LanNet.q("Não foi possível conectar a \(ip): \(why)"))}") } }
            var inaddr = in_addr()
            if inet_pton(AF_INET, ip, &inaddr) != 1 { fail("endereço inválido"); return }
            let fd = socket(AF_INET, SOCK_STREAM, 0)
            if fd < 0 { fail(LanNet.errText()); return }
            let fl = fcntl(fd, F_GETFL)
            _ = fcntl(fd, F_SETFL, fl | O_NONBLOCK)
            var addr = LanNet.sockAddr(inaddr, port: UInt16(truncatingIfNeeded: port))
            let rc = withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
            if rc != 0 && errno != EINPROGRESS { let why = LanNet.errText(); _ = Darwin.close(fd); fail(why); return }
            if rc != 0 {
                var ok = false
                let end = Date().addingTimeInterval(4)
                while Date() < end {
                    if !alive(g) { _ = Darwin.close(fd); return }
                    var pfd = pollfd(fd: fd, events: Int16(POLLOUT), revents: 0)
                    let r = poll(&pfd, 1, 250)
                    if r < 0 && errno != EINTR { break }
                    if r > 0 { ok = true; break }
                }
                var soErr: Int32 = 0; var sl = socklen_t(MemoryLayout<Int32>.size)
                getsockopt(fd, SOL_SOCKET, SO_ERROR, &soErr, &sl)
                if !ok || soErr != 0 {
                    _ = Darwin.close(fd)
                    fail(!ok ? "tempo esgotado" : String(cString: strerror(soErr))); return
                }
            }
            _ = fcntl(fd, F_SETFL, fl)
            lock.lock()
            if g != gen { lock.unlock(); _ = Darwin.close(fd); return }
            lock.unlock()
            attach(fd, g)
        }
    }

    // MARK: conexão
    private func attach(_ fd: Int32, _ g: Int) {
        var on: Int32 = 1
        setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &on, socklen_t(MemoryLayout<Int32>.size))      // sem agrupar pacotes pequenos
        setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &on, socklen_t(MemoryLayout<Int32>.size))
        setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))       // sem SIGPIPE ao escrever em conexão caída
        var tos: Int32 = 0x10                                                                    // IPTOS_LOWDELAY
        setsockopt(fd, IPPROTO_IP, IP_TOS, &tos, socklen_t(MemoryLayout<Int32>.size))
        lock.lock()
        if g != gen { lock.unlock(); _ = Darwin.close(fd); return }
        sockFd = fd
        lock.unlock()
        var peer = sockaddr_in(); var plen = socklen_t(MemoryLayout<sockaddr_in>.size)
        _ = withUnsafeMutablePointer(to: &peer) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getpeername(fd, $0, &plen) } }
        emit("{\"e\":\"connected\",\"peer\":\(LanNet.q(LanNet.ipString(peer.sin_addr)))}")
        var buf = [UInt8](repeating: 0, count: 4096)
        var line = [UInt8]()
        while true {
            if !alive(g) { return }
            var pfd = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
            let r = poll(&pfd, 1, 250)
            if r < 0 { if errno == EINTR { continue }; endConnection(g, "Conexão perdida"); return }
            if r == 0 { continue }
            let n = Darwin.read(fd, &buf, buf.count)
            if n == 0 { endConnection(g, "Conexão encerrada"); return }
            if n < 0 { if errno == EINTR || errno == EAGAIN { continue }; endConnection(g, "Conexão perdida"); return }
            for i in 0..<n {
                let b = buf[i]
                if b == 10 {
                    let l = String(decoding: line, as: UTF8.self)
                    line.removeAll(keepingCapacity: true)
                    if !alive(g) { return }
                    onLine?(l)
                } else {
                    line.append(b)
                    if line.count > LanNet.maxLine { endConnection(g, "Mensagem grande demais"); return }
                }
            }
        }
    }

    private func endConnection(_ g: Int, _ why: String) {
        lock.lock()
        if g != gen { lock.unlock(); return }
        closeLocked(); gen += 1
        lock.unlock()
        emit("{\"e\":\"closed\",\"why\":\(LanNet.q(why))}")
    }

    /// Envia uma linha (sem quebras). Falha de envio encerra a conexão.
    func send(_ line: String) {
        lock.lock(); let fd = sockFd; let g = gen; lock.unlock()
        if fd < 0 { return }
        let bytes = Array((line.replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "\r", with: " ") + "\n").utf8)
        sendQ.async { [self] in
            if !alive(g) { return }
            var off = 0
            while off < bytes.count {
                let n = bytes[off...].withUnsafeBytes { Darwin.send(fd, $0.baseAddress, $0.count, 0) }
                if n < 0 { if errno == EINTR { continue }; endConnection(g, "Falha ao enviar"); return }
                off += n
            }
        }
    }

    /// Encerra tudo (sem emitir evento: quem chamou já sabe).
    func close() { lock.lock(); closeLocked(); gen += 1; lock.unlock() }
}
