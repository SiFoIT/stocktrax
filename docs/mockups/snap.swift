import Foundation
import WebKit
import AppKit

// usage: swift snap.swift <url> <out.png> <width> <height> <settleSeconds> [js]
let args = CommandLine.arguments
let url = URL(string: args[1])!
let out = args[2]
let w = Double(args[3])!, h = Double(args[4])!
let settle = Double(args[5])!
let js: String? = args.count > 6 ? args[6] : nil

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

let cfg = WKWebViewConfiguration()
let web = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h), configuration: cfg)
let win = NSWindow(contentRect: web.frame, styleMask: [.borderless], backing: .buffered, defer: false)
win.contentView = web

class Nav: NSObject, WKNavigationDelegate {
    var loaded = false
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded = true }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { FileHandle.standardError.write("nav fail: \(error)\n".data(using: .utf8)!); exit(2) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { FileHandle.standardError.write("prov fail: \(error)\n".data(using: .utf8)!); exit(2) }
}
let nav = Nav()
web.navigationDelegate = nav
web.load(URLRequest(url: url))

let deadline = Date().addingTimeInterval(40)
while !nav.loaded && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.1)) }
if !nav.loaded { FileHandle.standardError.write("load timeout\n".data(using: .utf8)!); exit(3) }
RunLoop.main.run(until: Date().addingTimeInterval(settle))

if let js = js, !js.isEmpty {
    var evaluated = false
    web.evaluateJavaScript(js) { _, err in
        if let err = err { FileHandle.standardError.write("js error: \(err)\n".data(using: .utf8)!) }
        evaluated = true
    }
    while !evaluated { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
    RunLoop.main.run(until: Date().addingTimeInterval(3.0))
}

var done = false
let snapCfg = WKSnapshotConfiguration()
snapCfg.rect = NSRect(x: 0, y: 0, width: w, height: h)
web.takeSnapshot(with: snapCfg) { img, err in
    if let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
        try! png.write(to: URL(fileURLWithPath: out))
        print("wrote \(out) \(Int(img.size.width))x\(Int(img.size.height))")
    } else { FileHandle.standardError.write("snapshot error: \(String(describing: err))\n".data(using: .utf8)!) }
    done = true
}
while !done { RunLoop.main.run(until: Date().addingTimeInterval(0.1)) }
