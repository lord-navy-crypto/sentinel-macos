// SPDX-License-Identifier: MPL-2.0
import AppKit
import Foundation
import Darwin

let args = CommandLine.arguments
if args.count != 2 {
    fputs("usage: GenerateAppIcon <output.png>\n", stderr)
    exit(2)
}

let output = URL(fileURLWithPath: args[1])
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()

NSColor.clear.setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()

let outer = NSBezierPath(roundedRect: NSRect(x: 72, y: 72, width: 880, height: 880), xRadius: 210, yRadius: 210)
NSColor(calibratedWhite: 0.06, alpha: 1).setFill()
outer.fill()

let inset = NSBezierPath(roundedRect: NSRect(x: 116, y: 116, width: 792, height: 792), xRadius: 178, yRadius: 178)
NSColor(calibratedWhite: 0.98, alpha: 1).setStroke()
inset.lineWidth = 18
inset.stroke()

let shield = NSBezierPath()
shield.move(to: NSPoint(x: 512, y: 760))
shield.line(to: NSPoint(x: 706, y: 676))
shield.line(to: NSPoint(x: 676, y: 440))
shield.curve(to: NSPoint(x: 512, y: 276), controlPoint1: NSPoint(x: 650, y: 354), controlPoint2: NSPoint(x: 590, y: 304))
shield.curve(to: NSPoint(x: 348, y: 440), controlPoint1: NSPoint(x: 434, y: 304), controlPoint2: NSPoint(x: 374, y: 354))
shield.line(to: NSPoint(x: 318, y: 676))
shield.close()
NSColor(calibratedWhite: 0.98, alpha: 1).setStroke()
shield.lineWidth = 22
shield.lineJoinStyle = .round
shield.stroke()

let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
let font = NSFont.systemFont(ofSize: 300, weight: .heavy)
let attrs: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: NSColor(calibratedWhite: 0.98, alpha: 1),
    .paragraphStyle: paragraph
]
let text = NSAttributedString(string: "S", attributes: attrs)
let textRect = NSRect(x: 300, y: 350, width: 424, height: 360)
text.draw(in: textRect)

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fputs("failed to render icon\n", stderr)
    exit(3)
}

try png.write(to: output, options: .atomic)
print("Rendered monochrome Sentinel Mac app icon: \(output.path)")
