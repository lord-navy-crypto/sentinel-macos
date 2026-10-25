# Sentinel Box Visual Discovery Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Improve Sentinel Box home/catalog visual discoverability while preserving every existing feature, route, and operation.

**Architecture:** Keep the existing React/Tauri shell and CSS token system. Add pure catalog search helpers and improve presentation-only categorization, then integrate them into ToolLaunchpad and refine the existing home/catalog styles without rewriting individual processing workbenches.

**Tech Stack:** React 19, TypeScript, Vitest, existing CSS, Tauri 2.

**Spec:** `docs/superpowers/specs/sentinel-box-visual-discovery.md`

## Global Constraints

- Preserve all existing `LOCAL_TOOLS` IDs, `view` values, and optional `module` values.
- Preserve existing file processing, terminal, Homebrew, Sentinel, approval, export, and privacy behavior.
- Do not add dependencies or network-backed search.
- Do not remove any current home sections, tool catalog controls, favorites, or grid/list view.
- All added search aliases must point to existing tools; never invent functionality.

## Review Focus

- Empty or whitespace-only search must continue to show the full catalog.
- Chinese and English synonyms must find only existing matching tools.
- Category filtering and favorite-only filtering must compose without dropping tools.
- Similar tools in the same workspace must retain their distinct `module` launch targets.
- Narrow layouts and dark theme must keep search controls and result cards readable.

---

### Task 1: Document baseline and test catalog search behavior

**Files:**
- Create: `docs/superpowers/specs/sentinel-box-visual-discovery.md`
- Create: `docs/superpowers/plans/2026-10-25-sentinel-box-visual-discovery.md`
- Create: `apps/universal-box/src/lib/toolCatalogSearch.test.ts`

**Interfaces:**
- The tests define the expected behavior of `matchesToolQuery` and `filterToolCatalog`, which Task 2 will implement.

- [x] Step 1: Add tests for English/Chinese intent aliases, normalized whitespace/case, empty queries, favorites-only filtering, category filtering, and preserving distinct modules.
- [x] Step 2: Run the catalog search test in CI before adding implementation; confirm failure is due to the missing helper module.
- [x] Step 3: Keep the tests focused on real tool IDs and expected launch targets.

### Task 2: Implement pure catalog search and accurate presentation categories

**Files:**
- Create: `apps/universal-box/src/lib/toolCatalogSearch.ts`
- Modify: `apps/universal-box/src/lib/toolVisualCategories.ts`
- Test: `apps/universal-box/src/lib/toolCatalogSearch.test.ts`

**Interfaces:**
- `matchesToolQuery(tool, query): boolean`
- `filterToolCatalog(items, options): items`
- Existing `visualToolFamily(tool)` remains the category API used by the UI.

- [x] Step 1: Run the new tests and confirm they fail before implementation.
- [x] Step 2: Implement bounded NFKC normalization and a curated alias map for existing tool IDs only.
- [x] Step 3: Add a Files & Batch Processing category and refine classification order so document, media, data, text, sharing, file-management, and Sentinel entries are not misclassified by broad `area === files` fallbacks.
- [x] Step 4: Run the focused test and existing command-discovery/category-related tests.

### Task 3: Integrate search and improve tool-catalog hierarchy

**Files:**
- Modify: `apps/universal-box/src/components/ToolLaunchpad.tsx`
- Modify: `apps/universal-box/src/desktop-refresh.css`
- Test: `apps/universal-box/src/lib/toolCatalogSearch.test.ts`

- [x] Step 1: Replace inline substring filtering with the pure catalog search helper while preserving category, favorites, sorting, and launch callback behavior.
- [x] Step 2: Improve the catalog heading, result count, search placeholder/help, category filter wrapping, card hierarchy, favorite/open focus states, and empty state.
- [x] Step 3: Keep grid/list modes, external tools link, all cards, and exact existing `onLaunch(item.view, item.module)` routing.
- [x] Step 4: Add responsive and dark-theme CSS refinements without changing processing components.

### Task 4: Refine the home screen without removing capability

**Files:**
- Modify: `apps/universal-box/src/components/OfficeHome.tsx` only if a focused improvement is needed.
- Modify: `apps/universal-box/src/desktop-refresh.css`

- [x] Step 1: Review the current home screen and preserve file intake, Sentinel/Better Terminal modules, Sentinel submodules, office shortcuts, fast actions, favorites, recents, exports, and privacy note.
- [x] Step 2: Improve visual hierarchy and responsive spacing using existing design tokens.
- [x] Step 3: Confirm no current home section or route is removed.

### Task 5: Full verification and release handoff

**Files:** No further source changes unless verification exposes a regression.

- [x] Step 1: Run the complete Sentinel Box test suite and TypeScript/build checks through CI.
- [x] Step 2: Review the final diff against this plan and the design specification.
- [x] Step 3: Create a pull request for review; do not merge or claim a DMG is ready without successful build and artifact verification.

---

### Task 6: Second-round discovery polish

**Files:**
- Modify: `apps/universal-box/src/App.tsx`
- Modify: `apps/universal-box/src/components/OfficeHome.tsx`
- Modify: `apps/universal-box/src/components/ToolLaunchpad.tsx`
- Modify: `apps/universal-box/src/lib/toolCatalogSearch.ts`
- Test: `apps/universal-box/src/lib/toolCatalogSearch.test.ts`
- Test: `apps/universal-box/test/browser-ui-smoke.cjs`
- Modify: `apps/universal-box/src/desktop-refresh.css`

- [x] Step 1: Add live counts to the home-screen category shortcuts using the same tool inventory as the catalog.
- [x] Step 2: Add common local search chips, a clearer empty state, localized catalog controls, and live counts on home shortcuts.
- [x] Step 3: Sort the unfiltered catalog by everyday task family while keeping favorites prioritized; separate Office Workflows and Creative & Design from document-output format matches.
- [x] Step 4: Prefer concise human-authored details already present in tool names over identical generic card descriptions.
- [x] Step 5: Add regression coverage for task chips, dynamic category counts, default category order, favorite priority, category accuracy, and unique card summaries.
- [ ] Step 6: Re-run browser, unit, Sentinel validation, and both architecture-specific desktop CI checks on the final source revision.



### Task 7: Promote the built-in modules in the dashboard hierarchy

**Files:**
- Modify: `apps/universal-box/src/components/OfficeHome.tsx`
- Modify: `apps/universal-box/src/desktop-refresh.css`
- Test: `apps/universal-box/test/browser-ui-smoke.cjs`

- [x] Step 1: Place Sentinel and Better Terminal peer cards before secondary category browsing so the two defining Box modules are visible earlier.
- [x] Step 2: Make module headings Chinese-first while retaining English identifiers, and give both cards a restrained visual accent without changing their actions.
- [x] Step 3: Add browser regression assertions for module visibility, order, and primary actions.
- [ ] Step 4: Re-run browser, Sentinel, and both architecture-specific desktop CI checks against the updated source.


### Task 8: Improve mobile and dark-mode dashboard presentation

**Files:**
- Modify: `apps/universal-box/src/desktop-refresh.css`
- Test: `apps/universal-box/test/browser-ui-smoke.cjs`

- [x] Step 1: Reclaim horizontal space at phone widths by compacting the icon rail, topbar controls, and home content padding.
- [x] Step 2: Keep the home header actions, file intake, module cards, category shortcuts, and status facts readable and touch-friendly on narrow screens.
- [x] Step 3: Add browser assertions for the 390px viewport width, single-column module/category grids, and dark-theme activation; capture desktop and dark-mode mobile dashboard screenshots.
- [x] Step 4: Browser UI/workflow tests and Sentinel validation passed; Intel x86_64 and Apple Silicon ARM64 DMGs built, opened, and passed architecture/provenance checks on the latest app-code revision.
