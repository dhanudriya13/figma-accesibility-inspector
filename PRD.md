# Refined Product Strategy: Open-Source Figma Accessibility Inspector

The strongest direction is to build an adaptive accessibility auditor for existing Figma design assets, rather than a design-system generator. The plugin should work with mature design systems, partially structured libraries, and standalone UI designs—without forcing users to adopt a predefined template.

The central product promise is:

> Find accessibility issues in your existing designs, understand their root causes, and fix them at the source.

This gives the project a clear, achievable MVP while preserving a path toward future design-system generation.

## 1. Product strategy

Adaptive scan

Automatically discover available variables, styles, components, variants, text layers, and frames in the current Figma file. Users should not need to configure their design system before scanning.

Evidence-based accessibility audit

Evaluate applicable, automatable WCAG 2.2 AA checks and explain the evidence, threshold, confidence, and limitations for each finding.

Root-cause analysis

Identify when multiple failures originate from the same variable, style, or component. Help designers fix shared causes instead of repeatedly editing individual instances.

### Target users

- UI/UX designers who want to check designs before implementation.
- Design-system maintainers who need to identify recurring accessibility issues.
- Students and lecturers who need a transparent, inspectable tool for accessibility education and HCI research.
- Open-source contributors who want deterministic rules and testable audit logic.

### Product principles

1. Inspect before asking. Discover the available assets automatically.
2. Respect the existing design. Do not replace the user's visual language or prescribe a template.
3. Show evidence, not just scores. Explain what failed and how it was evaluated.
4. Trace before grouping. Only group findings when a genuine shared dependency can be established.
5. Separate automation from judgment. Distinguish confirmed failures from warnings and checks that require human review.
6. Keep the MVP local-first. No account, cloud upload, or external service should be required for core auditing.

## 2. Proposed user journey

1\. Open the plugin

Launch inside the Figma file the user wants to inspect.

2\. Discover assets automatically

Inventory variables, styles, components, variants, text, frames, and relevant node properties.

3\. Confirm the scan scope

Offer the whole file, selected frames, or selected assets when supported. Show what can and cannot be audited.

4\. Run accessibility checks

Evaluate supported rules, resolve relevant colors, and record evidence and uncertainty.

5\. Review findings

Filter failures, warnings, manual-review items, and passing checks; navigate to the affected layers.

6\. Trace and fix root causes

Inspect shared variables, styles, or component relationships and decide where to make changes.

7\. Export and repeat

Export a report, revise the design, and run the audit again to compare results.

### The key onboarding decision: adapt the scan to the file

The plugin should not make users answer a long setup questionnaire. Instead, the first scan should discover the available structure and adapt its reporting.

| Detected file structure      | Plugin behavior                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Mature design system         | Audit variables, styles, components, variants, and relevant usages; prioritize shared causes.                                  |
| Partially structured system  | Audit the assets that exist; report missing or unresolved relationships without treating them automatically as failures.       |
| Standalone frames or mockups | Audit visible design properties where enough information exists; flag ambiguous backgrounds and missing interaction semantics. |
| Empty or unsupported file    | Explain what was found, what is missing, and how to select suitable frames or assets.                                          |

The scan should never label a file “inaccessible” simply because it lacks design tokens. An unstructured file is a different input condition, not necessarily a defective design system.

## 3. MVP scope and boundaries

The MVP should answer one question reliably: “Which accessibility problems can I identify in this Figma file, what evidence supports each finding, and where should I fix it?”

### In scope for the MVP

A. Automatic asset discovery

- Local variables and variable collections, including modes.
- Local paint and text styles.
- Components, component sets, variants, and instances.
- Text nodes, fills, strokes, frames, and relevant dimensions.
- Variable bindings and traceable component relationships.
- Scan-scope selection and an inventory of skipped or unsupported assets.

B. Automated accessibility checks

- Text contrast against a reliably resolved background.
- Relevant non-text UI contrast, such as component boundaries and graphical controls, when their function and comparison can be determined.
- Preliminary target-size checks where a likely interactive target can be identified.
- Detection of unresolved colors, unsupported visual effects, and other conditions that prevent a reliable verdict.

C. Findings and root causes

- Pass, fail, needs review, and not evaluated states.
- Affected node, rule, measured value, threshold, and evidence.
- Navigation to the relevant layer in Figma.
- Grouping by verified shared variable, style, or component dependency.
- Severity, estimated reach, and confidence indicators.

D. Local reporting

- Summary by rule and result status.
- Filtering and sorting.
- Export to JSON or CSV.
- Re-scan after changes.
- Clear explanations of audit limitations.

The standards baseline should be WCAG 2.2 Level AA, but only criteria that can be meaningfully evaluated from the available Figma evidence should receive automated verdicts. For example, WCAG text contrast generally requires 4.5:1 for normal text and 3:1 for large text; non-text contrast and target-size rules have their own applicability conditions and exceptions.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.w3.org\&sz=32)

W3C



### Explicitly out of scope

| Feature                                                          | Why it should wait                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Generating a new design system                                   | A separate product workflow with different risks and acceptance criteria.                   |
| Automatically redesigning failed components                      | Could change intent, introduce regressions, or make unjustified design decisions.           |
| Claiming a complete WCAG compliance score                        | Static Figma files cannot establish every behavior or criterion of a finished interface.    |
| Fully automated keyboard and screen-reader testing               | Requires implementation and runtime behavior beyond static design inspection.               |
| Guaranteed identification of every button, link, or touch target | A visual mockup does not always encode interaction semantics.                               |
| Auditing every remote team-library asset automatically           | Library access, permissions, and published asset relationships can constrain discovery.     |
| Cloud dashboards, accounts, and team analytics                   | Adds infrastructure, privacy concerns, and maintenance before the core engine is validated. |
| AI-based subjective design judgments                             | Less reproducible than a deterministic, evidence-based first release.                       |

Important distinction: a failed contrast calculation can be a strong automated finding. A button that appears too small may only be a candidate finding if the plugin cannot establish that it represents an actual interactive target. The product must not present these as equally certain.

## 4. Technical implications of adaptive scanning

Figma's Plugin API exposes document nodes and properties, and provides access to local variables and their bindings. That makes automatic discovery feasible without requiring the user to manually define a design system first.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://developers.figma.com\&sz=32)

Developer Docs

+3



However, discovering assets is easier than understanding their intended accessibility role. That distinction should shape the architecture.

### Recommended architecture

Figma document

Nodes · Variables · Styles · Components · Instances

1\. Asset discovery

Inventory assets and identify scan scope

2\. Normalized design model

Common representation of nodes, properties, modes, and bindings

3\. Context and dependency resolver

Resolve foreground/background, variable aliases, and component relationships

4\. Rule engine

Run deterministic WCAG checks and record uncertainty

5\. Findings and root-cause engine

Evidence · Impact · Dependency-based grouping

6\. Plugin UI and export

Summary · Findings · Layer navigation · Reports

### Architectural decisions

1\. Separate scanning from auditing. The scanner should inventory what exists without deciding whether it passes WCAG. The rule engine should operate on a normalized model, not directly on raw Figma nodes. This makes rules easier to test and lets future versions add checks without rewriting discovery.

2\. Preserve provenance. Every normalized property should retain its source node ID, property name, variable/style reference where available, and relevant mode. This is essential for navigating to the original layer and tracing failures to their source.

3\. Model uncertainty explicitly. Background resolution should support outcomes such as `resolved`, `ambiguous`, and `unsupported`. Do not silently choose a background color when overlapping layers, opacity, gradients, images, or effects make the calculation unreliable.

4\. Treat variable modes as separate contexts. A foreground/background pairing that passes in a light mode may fail in a dark mode. Audit each applicable mode independently where the relevant bindings and values can be resolved.

5\. Do not equate similar values with shared causes. Two components using the same hex color are not necessarily linked. Root-cause groups should be based on actual bindings or component dependencies, with value similarity used only as a secondary hint.

6\. Keep the first release read-only by default. The plugin can highlight nodes and provide recommended fixes without modifying design assets. If later releases offer automatic fixes, make them explicit, previewable, and reversible where possible.

## 5. Product requirements document (PRD)

Proposed MVP specification · Version 1.0 · Open-source Figma plugin

### Product definition

| Field               | Decision                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Product             | A11y System Inspector — working name                                                         |
| Product type        | Figma plugin                                                                                 |
| Primary function    | Audit existing design assets for accessibility issues                                        |
| Onboarding          | Adaptive automatic scan                                                                      |
| Standards baseline  | WCAG 2.2 AA                                                                                  |
| Initial asset scope | Current Figma file; local assets and supported usages                                        |
| Modification policy | Read-only audit by default                                                                   |
| Data architecture   | Local-first, no backend required for core functionality                                      |
| License             | MIT or Apache-2.0, subject to final project choice                                           |
| Future direction    | Optional accessible design-system generation, considered after the audit engine is validated |

### Functional requirements

## Requirements checklist

12 requirements

AllP0 · EssentialP1 · Next

FR-01 · Automatic discovery

P0

Inventory supported local variables, styles, components, variants, frames, text, and relevant node properties without a setup questionnaire.

FR-02 · Adaptive scan scope

P0

Offer a full-file scan and supported selection-based scans. Clearly report the included scope and skipped assets.

FR-03 · Contrast evaluation

P0

Calculate text contrast when foreground and background colors are reliably resolvable; apply applicable WCAG thresholds.

FR-04 · Evidence-based findings

P0

Store the rule, affected node, measured value, threshold, source properties, and confidence or evaluation status.

FR-05 · Layer navigation

P0

Allow the user to locate the affected node in the Figma document.

FR-06 · Dependency tracing

P0

Trace findings to known variable bindings, styles, and component relationships; do not infer a shared source from matching values alone.

FR-07 · Uncertainty handling

P0

Report ambiguous backgrounds and unsupported cases as needs review or not evaluated rather than silently guessing.

FR-08 · Filtering and summary

P0

Filter by status, rule, severity, and root-cause group; summarize findings without implying full conformance.

FR-09 · Export

P1

Export a reproducible JSON report and a designer-friendly CSV.

FR-10 · Before/after comparison

P1

Compare successive scans to show resolved, unchanged, and newly introduced findings.

FR-11 · Non-text contrast

P1

Evaluate identifiable UI boundaries and graphical indicators when the required comparison and applicability are sufficiently clear.

FR-12 · Target-size checks

P1

Flag likely undersized targets as candidates; account for known spacing exceptions where feasible.

I recommend moving non-text contrast and target-size checks into the next milestone unless early prototypes demonstrate that they can be implemented accurately. The first release will be more credible if its smaller set of checks has well-tested results.

### Finding data model

Every finding should be machine-readable, independently testable, and traceable to the source.

```

type AuditStatus =
  | "pass"
  | "fail"
  | "needs-review"
  | "not-evaluated";

type AuditFinding = {
  id: string;
  ruleId: string;
  status: AuditStatus;

  nodeId?: string;
  nodeName?: string;
  propertyPath?: string;

  measuredValue?: number | string;
  threshold?: number | string;
  evidence: string[];

  confidence: "high" | "medium" | "low";
  rootCauseIds: string[];
  limitations: string[];
};

type DesignAsset = {
  id: string;
  kind:
    | "variable"
    | "style"
    | "component"
    | "variant"
    | "frame"
    | "text"
    | "other";
  name: string;
  sourceNodeId?: string;
  dependencies: string[];
};

type AuditRun = {
  id: string;
  startedAt: string;
  scope: string;
  ruleSetVersion: string;
  findings: AuditFinding[];
};

```

This is a conceptual schema rather than a finalized implementation. In production, `rootCauseIds` should reference structured root-cause records containing the source asset, dependency path, affected findings, and evidence that the relationship is real.

### Non-functional requirements

- Accuracy: every automated failure must have reproducible evidence and a unit-tested rule.
- Transparency: the interface must explain why a check could not be evaluated.
- Performance: process large files in manageable batches, avoid redundant property resolution, and provide progress feedback.
- Privacy: keep file inspection and report generation local unless a future, explicitly opted-in feature requires otherwise.
- Accessibility: keyboard-operable plugin UI, readable contrast, clear focus states, and meaningful status text.
- Maintainability: isolate each accessibility rule from Figma-specific discovery code.
- Compatibility: develop against current supported Figma Plugin API typings and verify behavior in the target Figma editor.

## 6. Technical design details

### Suggested repository structure

```

a11y-system-inspector/
├── manifest.json
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts
│   ├── scanner/
│   │   ├── discover-assets.ts
│   │   ├── scan-scope.ts
│   │   └── node-adapters.ts
│   ├── model/
│   │   ├── design-asset.ts
│   │   ├── audit-run.ts
│   │   └── finding.ts
│   ├── resolver/
│   │   ├── variable-resolver.ts
│   │   ├── color-resolver.ts
│   │   ├── background-resolver.ts
│   │   └── dependency-graph.ts
│   ├── rules/
│   │   ├── contrast-minimum.ts
│   │   ├── non-text-contrast.ts
│   │   └── target-size.ts
│   ├── engine/
│   │   ├── audit-engine.ts
│   │   └── root-cause.ts
│   ├── report/
│   │   ├── json-export.ts
│   │   └── csv-export.ts
│   └── ui/
│       ├── app.ts
│       ├── styles.css
│       └── views/
└── tests/
    ├── fixtures/
    ├── rules/
    ├── resolver/
    └── integration/

```

### Critical implementation considerations

Color resolution. Implement the WCAG relative-luminance formula with the required sRGB linearization. Support solid colors first. Define explicit handling for opacity, gradients, image fills, overlapping layers, and inherited backgrounds. A result should only be marked as a definite failure when the chosen comparison is sufficiently reliable.

Large text classification. The contrast rule uses a lower threshold for qualifying large text. Do not infer this from a rough visual estimate; derive it from available text properties and the intended rendered context, and flag uncertain cases.

Variable modes. Retrieve local variable collections and variables, resolve aliases and mode-specific values, and record the active or evaluated mode in the finding. Figma documents variable access and bindings in its [Plugin API variables guide](https://developers.figma.com/docs/plugins/working-with-variables/?utm_source=chatgpt.com).&#x20;

[image](https://www.google.com/s2/favicons?domain=https://developers.figma.com\&sz=32)

Developer Docs

+1



Component relationships. Distinguish a component definition from an instance and an instance's overridden properties. A component-level finding should not automatically imply that every instance has the same rendered outcome.

Target dimensions. Figma geometry is not itself proof of the final CSS-pixel dimensions or interaction target in the implemented product. Use target-size findings as candidates unless the implementation context and relevant exceptions can be established. WCAG 2.2 SC 2.5.8 includes a 24-by-24 CSS-pixel requirement with exceptions, including spacing.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.w3.org\&sz=32)

W3C



Dynamic document access. Prefer asynchronous APIs where required by the current Plugin API and manifest configuration. Test discovery across multiple pages and large files, and handle nodes or assets that cannot be read rather than assuming the document is fully loaded. The [official API reference](https://developers.figma.com/docs/plugins/api/api-reference/?utm_source=chatgpt.com) is the implementation authority.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://developers.figma.com\&sz=32)

Developer Docs

+1



## 7. Validation and acceptance criteria

Before calling the MVP ready, test it against three representative fixture files:

[Building a Design System in Figma: Creating a design system and managing design tokens](https://images.openai.com/static-rsc-4/yk0FjZ0PhzPwVudPS1McAP_bVpy8GZjmvviF-UxJgDUz0iutHHC7gT72ajrL65Q4Fowtbgq6CDHTOMq-OpINliNeJYXdPyc6nFGf50IpLj-QJvLr4mtaBzuiq2ONO8hSNdY5iKkgz8gimEDIC-ZOZn7X-blX2J4U2zAd7tEgtSU?purpose=inline)

Fixture A — Structured design system

Variables, modes, text styles, reusable components, and component variants.

Goal: validate asset discovery, mode coverage, and root-cause tracing.

[Figma App : Guide, Présentation & Avis (2025)](https://images.openai.com/static-rsc-4/DxEmn4zzZ0JnFJCmzqfHndcROKjRW5D-8bxt3Oeay78U3cuvaGTLJP9cbruMYyixmeHDkRtGg-XJRGwM5zBkv2lDdp3MUATFMnEuh-Iuzblc0aOUYCnZ_aT_1nTndQ_POHauBhVImRj-G1WLbRvusKr_EQ-6TpoThtgtJS-ZvNU?purpose=inline)

Fixture B — Partially structured file

Some reusable styles and components, mixed with detached layers and overrides.

Goal: validate graceful handling of missing bindings and inconsistent structure.

[Wirebones Design System by Braulio Romero on Dribbble](https://images.openai.com/static-rsc-4/noQG3wbUMxwdtojjuzknEdQdgIpxVAB36MPIoxCtBS6xKOyUumocmttAkmRXz7I8uA8fT32kKapPr5APnC6dsNBMRIrNkJmjrABt85xS8-4lPonJbtcRMAs3rj6CRzU7cGE9wCMDvdfw4g7f2WB8mK4xC1uFJX6SZNTXeSxwP1I?purpose=inline)

Fixture C — Standalone mockups

Frames and visible UI elements with little or no formal design system.

Goal: validate useful findings without requiring tokens or component libraries.

Acceptance tests should include known passing and failing contrast pairs, large-text edge cases, variable-mode differences, unresolved backgrounds, repeated component instances, and root-cause relationships. Use the W3C's normative requirements and understanding documents as the rule reference—not arbitrary design conventions.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.w3.org\&sz=32)

W3C

+2



Track these release metrics:

- Precision of automated failure findings against manually verified fixtures.
- Rate of ambiguous or unevaluated cases.
- Percentage of supported assets successfully discovered.
- Percentage of findings with valid navigation and traceable evidence.
- Time to scan representative small, medium, and large files.
- Number of duplicate findings eliminated through dependency-based grouping.

Do not promise a universal accuracy percentage before testing establishes a defensible baseline.

## 8. Roadmap

## Phase 1

Foundation

Asset discovery and first contrast rule

Set up the plugin, scan current-file assets, normalize data, resolve simple solid-color pairs, and implement a tested contrast calculation.

## Phase 2

Audit UX

Findings and evidence

Build scan progress, result filtering, status explanations, Figma layer navigation, and report generation.

## Phase 3

Root causes

Dependency tracing and variable modes

Add robust variable resolution, component relationships, root-cause grouping, and light/dark mode coverage.

## Phase 4

Validation

Broader rules and open-source beta

Validate across representative files, add selected non-text contrast or target-size checks, document limitations, and publish contribution guidance.

Treat these as milestone boundaries rather than fixed deadlines. The main schedule risk is not the plugin interface; it is correctly resolving visual context and avoiding misleading findings.

## 9. Future generation strategy

Design-system generation should be a separate future capability, not an implicit part of auditing.

MVP — Audit existing designs

Build first

Inspect, evaluate, explain, trace, and report. No automatic creation or replacement of design assets.

Future — Accessible design foundations

Explore later

Optionally propose semantic color tokens, typography roles, component foundations, and state variants. Validate generated candidates using the same audit engine before users apply them.

Keeping generation separate preserves the credibility of the audit engine. It also allows future users to start with their own palette, fonts, brand requirements, and visual language without assuming that a color palette alone is a complete design system.

## Final recommendation

Build an adaptive, local-first, evidence-based auditor with root-cause tracing. Start with contrast checks and reliable asset discovery; then add more rules as the resolver and test suite mature. Avoid automatic generation, automatic fixes, and broad compliance claims in the first release.

The differentiator should not simply be “a plugin that checks contrast.” It should be a tool that explains where an accessibility problem comes from, how certain the finding is, and what shared design-system source can be corrected.
