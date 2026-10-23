# Figma Accesibility Inspector WCAG 2.2

A local-first, open-source Figma plugin that audits existing design assets for WCAG 2.2 AA accessibility issues, with evidence and root-cause tracing.

> Find accessibility issues in your existing designs, understand their root causes, and fix them at the source.

The plugin works with mature design systems, partially structured libraries, and standalone UI mockups — without forcing you to adopt a predefined template or answer a setup questionnaire.

## Developed by

- Putu Dhanu Driya | VCD MCUT 110
- I Nyoman Triarta | VCD MCUT 111

## Features

- **Adaptive asset discovery** — automatically inventories local variables, collections and modes, paint/text styles, components, variants, instances, frames, and text layers.
- **Evidence-based audit** — evaluates automatable WCAG 2.2 AA checks and records the measured value, threshold, evidence, confidence, and limitations for each finding.
- **Root-cause analysis** — groups failures by verified shared variable, style, or component dependency (never by matching color values alone).
- **Variable-mode coverage** — evaluates each applicable variable mode (e.g. light/dark) independently.
- **Uncertainty handling** — ambiguous backgrounds and unsupported cases are reported as `needs-review` or `not-evaluated` instead of being guessed.
- **Local reporting** — filter and sort findings, navigate to the affected layer in Figma, and export reproducible JSON or CSV reports.
- **Before/after comparison** — compare successive scans to see resolved, unchanged, and newly introduced findings.
- **Read-only by default** — highlights and explains issues without modifying your design assets.

## Supported checks

| Rule | WCAG | Threshold | Status |
| --- | --- | --- | --- |
| Text contrast (minimum) | 1.4.3 Contrast (Minimum) | 4.5:1 (3:1 large text) | Automated |
| Non-text contrast | 1.4.11 Non-text Contrast | 3:1 | Automated (where comparison is reliable) |
| Target size (minimum) | 2.5.8 Target Size (Minimum) | 24 × 24 CSS px | Candidate findings |

Findings are classified as `pass`, `fail`, `needs-review`, or `not-evaluated`, with a severity (`critical` … `info`) and confidence (`high` / `medium` / `low`) per result. Checks that cannot be evaluated reliably from static Figma geometry are never presented as certain failures.

## Architecture

The pipeline separates scanning from auditing so rules operate on a normalized model rather than raw Figma nodes:

```
Figma document
  → 1. Asset discovery      (scanner/)
  → 2. Normalized model     (model/)
  → 3. Context & dependency resolver  (resolver/)
  → 4. Rule engine          (rules/, engine/)
  → 5. Findings & root causes        (engine/root-cause.ts)
  → 6. Plugin UI & export   (ui/, report/)
```

Key directories:

- `src/scanner/` — asset discovery, scan-scope selection, and node adapters.
- `src/model/` — normalized design model, findings, audit runs, and color types.
- `src/resolver/` — variable resolution, color/background resolution, and the dependency graph.
- `src/rules/` — WCAG rules (text contrast, non-text contrast, target size).
- `src/engine/` — audit engine and root-cause grouping.
- `src/report/` — JSON/CSV export and scan comparison.
- `src/ui/` — plugin UI (summary, findings, root causes, comparison).
- `tests/` — unit and integration tests with fixtures.

## Development

### Prerequisites

- Node.js (18+)
- npm

### Install

```bash
npm install
```

### Commands

| Command | Description |
| --- | --- |
| `npm run build` | Build `dist/code.js` and `dist/ui.html` with esbuild |
| `npm run watch` | Rebuild on change (reload the plugin in Figma to see updates) |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm test` | Run the Vitest suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run check` | Type-check, test, and build |

### Running in Figma

1. `npm run build`
2. Open Figma → **Plugins → Development → Import plugin from manifest…**
3. Select `manifest.json`


## License

MIT
