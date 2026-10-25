# Sentinel Box Visual Discovery Refresh — Design Specification

## Goal

Make Sentinel Box easier to navigate and understand without removing, duplicating, or weakening any existing tool behavior. Improve the home screen, tool catalog, category accuracy, search discoverability, and visual consistency.

## User and product intent

Sentinel Box is a unified macOS productivity toolbox. Sentinel is its system-observation and security module; Better Terminal is its terminal, Homebrew software-center, and task-management module. Both remain first-class built-in modules in the same app.

The interface should help users discover existing capabilities through task language, file formats, clear names, and predictable categories. It must not hide features for the sake of a cleaner-looking screen.

## Non-negotiable constraints

- Preserve every existing tool ID, view/module route, and underlying processing implementation.
- Preserve all parameters, previews, batch operations, import/export options, error handling, permissions, and safety confirmations.
- Do not create duplicate implementations when a shortcut can open an existing tool.
- Keep global search, keyboard shortcut, favorites, recents, light/dark themes, accessibility options, and responsive behavior.
- Search is local and must not upload query text, file names, file contents, or usage history.
- Only show capability labels that are grounded in the existing tool implementation.
- Sentinel and Better Terminal remain clearly visible within the Sentinel Box navigation and home screen.
- Avoid adding dependencies for presentation-only improvements.

## Visual approach

1. Keep the existing restrained macOS-style design tokens and theme system.
2. Make the home screen task-first: search and file intake first, then give Sentinel and Better Terminal prominent peer-level built-in module cards before task-category browsing, followed by favorites/recents/exports.
3. Make the complete tool catalog the authoritative inventory of existing tools.
4. Make cards easier to scan with concise labels, accurate category metadata, stable icons, and clear open/favorite actions.
5. Improve tool discovery using Chinese and English task synonyms, file-format names, module names, and existing IDs.
6. Use progressive disclosure for advanced settings only when their presence remains obvious; never remove controls.
7. Keep each specialized workbench appropriate to its task instead of forcing every tool into the same minimal card layout.

## First implementation slice

- Improve and test the presentation-only category classifier, including separate Files & Batch Processing, Office Workflows, and Creative & Design families so output formats do not override the user's actual task.
- Add a pure, local tool-catalog search helper with common bilingual task aliases and tests.
- Integrate the helper into the existing ToolLaunchpad without changing launch routes or favorites.
- Refine catalog UI hierarchy, result counts, empty state, category filters, and responsive behavior through the existing CSS system.
- Refine the home-screen visual hierarchy without removing any current sections or shortcuts.
- Show live category counts on home shortcuts and provide common task-search chips in the catalog.
- Prioritize everyday productivity categories in the unfiltered catalog while keeping favorites first and preserving all Sentinel/Better Terminal routes.
- Reuse concise descriptions already present in tool titles rather than repeating generic card copy.
- Keep catalog controls, empty states, and external-service notes consistently localized.
- Add/adjust regression tests and verify via repository CI before packaging.

## Acceptance criteria

- Existing routes and tool IDs are unchanged.
- Search finds selected high-frequency tools using common Chinese and English intents.
- Category filtering classifies common file, media, data, text, office workflow, creative, sharing, and Sentinel tools sensibly; document output formats do not automatically misclassify a workflow as a PDF tool.
- All tools remain discoverable in the complete catalog.
- Favorites and grid/list layout continue to work; removing the last visible favorite does not strand the catalog in an empty favorites-only filter.
- The unfiltered catalog surfaces everyday productivity tools before the large Sentinel subsystem collection; favorites remain prioritized.
- Home category counts reflect the same source catalog used by the full catalog.
- Common search chips populate the existing local search field and preserve the existing launch targets.
- No functional control is removed or replaced by a decorative element.
- Light/dark themes and narrow windows remain usable.
- At a 390px viewport, the home screen has no horizontal document overflow, core module cards stack in one column, and task-category shortcuts remain readable.
- Mobile topbar controls remain available without pushing the page wider than the viewport.
- Browser evidence includes a desktop home screenshot and a dark-mode mobile screenshot; separate mobile geometry assertions verify the light-mode layout.
- The relevant tests and build checks pass; failures are reported honestly.
