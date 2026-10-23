# Sentinel Box — staged PR integration review and read-only audit

**2026-10-23 · Review document, not a release announcement.**

## Verified baseline

On 2026-10-23 the connected GitHub repository reported **50 open pull requests**. Of these, PR **#79 through #116** form a continuous chain of **38** open PRs rooted in `main`:

`#79 (main) → #80 → #81 → … → #114 → #115 → #116`

All 38 remain open. **PR #79 is now Ready for review** (previously Draft); it was verified to have passing Sentinel validation, complete Chromium tests, Intel/Apple Silicon desktop CI and GitHub mergeable status. Marking ready for review **did not merge it**.

The most recent PR **#116** passed the full Chromium and both macOS architectures on commit `bc58eedb75e3b6ce59829595db533bb6aee5a1ea`. None of the above facts establish physical Mac installation validation, complete security review or a published installer. The actual package release version is still `0.36.0`.

Other open PRs such as #74–#78 are direct-to-`main` siblings and must be evaluated separately; some older PRs have branches with non-`main` bases outside this 38-PR chain.

## Actual solution committed in this independent PR

- `.github/scripts/pr-stack-audit.cjs` uses only Node built-ins and read-only GitHub REST `GET /repos/{owner}/{repo}/pulls?state=open`, paginated in groups of 100 until complete.
- It computes root PRs whose base equals the repository default branch, dependency depth and per-tip ancestor sequence, then reports the longest chain.
- Explicitly reports circular base/head chains and references to bases not provided by any currently OPEN PR. **An external base can be a closed or already merged PR; it is a review warning, not automatically a broken branch.**
- `.github/scripts/pr-stack-audit.node.cjs` tests a realistic 38-deep chain, independent root PRs, cycles, ambiguous duplicate branch heads, external parents, pagination of more than 100 results and HTTP failures.
- `.github/workflows/pr-stack-audit.yml` runs tests on changes to this audit code. After the independent PR merges into the default branch, a maintainer can manually trigger **Read-only Pull Request Stack Audit** from GitHub Actions. The workflow creates a human-readable summary and `pr-stack-audit.json` artifact.
- GitHub Actions permissions are explicitly limited to `contents: read` and `pull-requests: read`. It has **no automatic merge, branch deletion, PR review or release permission**.

## Safe staged merge protocol

1. Review the first PR that directly targets `main` in each desired branch of the graph, starting with **#79**, separately from other independent sibling PRs. Review all changed files and confirm required CI checks on the exact HEAD commit.
2. A reviewer decides whether to merge. This tool does not override required reviews, branch protection or manual approval.
3. After each parent merges, ensure the next stacked child PR points at the intended target branch and its diff is still scoped to its own changes. Update bases only after verifying GitHub's changes and re-running necessary CI.
4. Avoid deleting ancestor branches before fixing any child PRs that still point to them.
5. When preparing a package release, reconcile the real `package.json`, root lockfile, Tauri and Cargo versions. Use #115 release-preflight guards and require both DMGs + SHA-256 manifest. Complete physical Mac and Gatekeeper/signing checks before publishing.
6. The audit is a **dependency map**, not an automatic “safe to merge” decision. It does not evaluate security, code quality, privacy, source integrity, conflict resolution, GitHub checks, branch age or approvals.

## Acceptance

- [x] Actual repository PR list inspected; #79 checked for CI results, no unresolved review threads, and made Ready for review.
- [x] Dependency analyzer, stable JSON output and isolated tests committed on an **independent branch based on main**, not a new link in the 38-deep chain.
- [x] Manual GitHub Actions report-and-artifact workflow committed.
- [ ] Audit PR's own GitHub Actions Node tests green.
- [ ] Code review and merge of this small independent infrastructure PR.
- [ ] Maintainer runs the on-demand audit after merge and reviews its reported graph.
- [ ] Parent feature PRs individually reviewed, merged and app validated on real macOS machines.

*No existing feature PR was merged and no new public release was created during this integration audit.*
