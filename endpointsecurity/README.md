# Optional Endpoint Security sensor scaffold

This directory is **not enabled in the normal Sentinel binary**. It is a notification-only starting point for a future System Extension.

Apple requires the `com.apple.developer.endpoint-security.client` entitlement. Without it, `es_new_client` fails. Users also must approve the product through macOS privacy/security controls, including Full Disk Access for Endpoint Security clients.

The scaffold subscribes only to NOTIFY events (exec/fork/exit/mount). It does not block or authorize events. Production deployment still requires a signed host app, System Extension packaging, Developer ID provisioning, entitlement approval, lifecycle management, privacy review, and real-Mac testing.
