// SPDX-License-Identifier: MPL-2.0
// Host-app scaffold for an optional Endpoint Security System Extension.
// The normal Sentinel release does not submit this request automatically.
import Foundation
import SystemExtensions

final class SentinelSystemExtensionController: NSObject, OSSystemExtensionRequestDelegate {
    static let extensionIdentifier = "local.sentinel.macos.endpointsecurity"

    func requestActivation() {
        let request = OSSystemExtensionRequest.activationRequest(
            forExtensionWithIdentifier: Self.extensionIdentifier,
            queue: .main
        )
        request.delegate = self
        OSSystemExtensionManager.shared.submitRequest(request)
    }

    func requestDeactivation() {
        let request = OSSystemExtensionRequest.deactivationRequest(
            forExtensionWithIdentifier: Self.extensionIdentifier,
            queue: .main
        )
        request.delegate = self
        OSSystemExtensionManager.shared.submitRequest(request)
    }

    func request(_ request: OSSystemExtensionRequest, didFinishWithResult result: OSSystemExtensionRequest.Result) {
        NSLog("Sentinel System Extension request finished: %ld", result.rawValue)
    }
    func request(_ request: OSSystemExtensionRequest, didFailWithError error: Error) {
        NSLog("Sentinel System Extension request failed: %@", String(describing: error))
    }
    func requestNeedsUserApproval(_ request: OSSystemExtensionRequest) {
        NSLog("Sentinel System Extension requires explicit user approval in macOS settings.")
    }
    func request(_ request: OSSystemExtensionRequest, actionForReplacingExtension existing: OSSystemExtensionProperties, withExtension ext: OSSystemExtensionProperties) -> OSSystemExtensionRequest.ReplacementAction {
        return .replace
    }
}
