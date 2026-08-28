# Sentinel V2.2 — System Profile Guide

System Profile is an Easy Mode, read-only hardware page for users who do not know how to inspect or interpret Mac hardware information.

It reports:

- Mac model and model identifier
- Apple Silicon vs Intel family
- chip / processor description
- current architecture and Sentinel engine architecture
- physical and logical CPU core counts
- performance / efficiency core split when macOS reports it
- total memory
- macOS product version and exact build
- Darwin kernel version
- root storage total / available capacity
- Rosetta translation state

The page also explains what each field means and why architecture matters to Sentinel.

## Privacy

System Profile intentionally does **not** expose the full serial number or Hardware UUID. Those are unique device identifiers and are not necessary for compatibility explanations. Low-sensitivity diagnostics must continue to omit them.

## macOS evidence

On macOS, Sentinel uses bounded local system tools such as `system_profiler`, `sysctl`, `sw_vers`, `uname`, and existing storage/memory helpers. If a source is unavailable or times out, Sentinel leaves the corresponding field unavailable rather than inventing a value.
