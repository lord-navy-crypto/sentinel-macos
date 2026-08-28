# Sentinel Open-Source & License Recommendation

## Selected license: MPL-2.0

Sentinel is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. The repository root `LICENSE` contains the full license text, and project-owned source files carry an SPDX MPL-2.0 identifier.

Why it fits Sentinel:

- Sentinel remains genuinely open source: anyone may run, study, modify, redistribute, and use it commercially.
- MPL uses **file-level copyleft**. If someone modifies MPL-covered Sentinel source files and distributes those modifications, the modified covered files must remain available under MPL-2.0.
- MPL still allows Sentinel to be combined with separate proprietary/open components with much less friction than GPL-style whole-program copyleft.
- It is a standard, OSI-approved license with established tooling and community understanding.
- It preserves a better path for a long-lived community project than a custom “no commercial use” license.

## Why Sentinel did not keep MIT

MIT is excellent for maximum adoption, but it permits a third party to take Sentinel, modify it, distribute a closed-source commercial fork, and keep those modifications private as long as the MIT notice remains. That may be acceptable for a library; it is less aligned with Sentinel's stated goal of remaining an owner-led open system product.

## Why not Apache-2.0?

Apache-2.0 is also a strong permissive option and includes explicit patent terms, but like MIT it does not require distributed modifications to be published. Choose Apache-2.0 if maximum corporate adoption matters more than keeping distributed improvements open.

## Why not GPLv3?

GPLv3 gives much stronger copyleft. It is appropriate if the goal is that distributed derivative programs broadly remain GPL. For Sentinel, that can create more integration friction for native macOS shells, third-party integrations, and commercial extensions than necessary.

## Suggested repository policy

- Source code: MPL-2.0.
- Keep copyright notices accurate; do not claim third-party code as your own.
- Add `TRADEMARKS.md` if you want the Sentinel name/logo governed separately. Open-source code licensing does not automatically mean others should be allowed to impersonate the official Sentinel distribution.
- Add `THIRD_PARTY_NOTICES.md` when external dependencies/assets are introduced.
- Keep Developer ID certificates, private keys, notarization credentials, `.p12` files, and secrets out of Git.
- If future proprietary dual-licensing becomes a serious goal, get legal advice before accepting substantial outside contributions; relicensing contributor-owned code can require additional contributor permissions.

This file is project-planning guidance, not legal advice. Read the actual license before publishing and seek qualified legal advice if commercialization or dual licensing becomes material.
