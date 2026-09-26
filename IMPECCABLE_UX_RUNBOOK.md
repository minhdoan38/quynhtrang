# Impeccable UX/UI Runbook

Use `PRODUCT.md` and `DESIGN.md` at the repository root as durable context.

This project already has an implementation. The goal is not to ask Impeccable to invent a random visual identity on every branch. The target visual world is already established by `DESIGN.md`; each branch should investigate one UX problem, inspect the current implementation, then improve it within that world.

## Recommended sequence

### 1. Establish context

Run the Impeccable context/init flow supported by the installed version.

Verify that it has loaded:

- `PRODUCT.md`;
- `DESIGN.md`;
- the current route/component being worked on.

Do not let the agent replace those files casually during a narrow UX task.

### 2. Audit current UI before editing

For a branch, first inspect the live surface and current source.

Use the equivalent Impeccable critique/audit command on the exact page or editor surface.

The agent should identify:

- task hierarchy;
- interaction friction;
- visual hierarchy;
- mobile behavior;
- accidental complexity;
- component inconsistencies;
- accessibility problems;
- current-state strengths worth preserving.

### 3. Shape one branch at a time

Before implementation, run the equivalent of:

```text
/impeccable shape <specific UX area>
```

Examples:

```text
/impeccable shape mobile editor shell
/impeccable shape template browser
/impeccable shape image editing flow
/impeccable shape die-cut sticker flow
/impeccable shape preflight flow
```

The branch brief should specify:

- user goal;
- entry point;
- exit point;
- primary mobile state;
- important edge states;
- what existing behavior must remain;
- acceptance criteria.

Do not redesign unrelated surfaces.

### 4. Implement against DESIGN.md

The desired visual register is:

> Pastel Stationery Workbench

The editor itself stays quiet and operational.

Brand expression becomes stronger in:

- product selection;
- template browsing;
- onboarding;
- empty states;
- previews;
- confirmation.

### 5. Adapt mobile first

Run mobile adaptation review before treating a branch as finished.

Test at minimum:

- small phone portrait;
- normal phone portrait;
- keyboard open;
- bottom sheet open;
- zoomed canvas;
- selected tiny object;
- loading state;
- error/warning state.

Desktop is a second adaptation pass.

### 6. Clarify copy

Use the equivalent Impeccable clarify pass for:

- tool labels;
- warning copy;
- empty states;
- buttons;
- error states;
- preflight;
- checkout.

The language target is short Vietnamese for non-designers.

### 7. Polish only after flow is correct

Polish is the last pass.

Polish should improve:

- spacing;
- hierarchy;
- typography;
- motion;
- perceived quality;
- consistency.

It should not hide unresolved navigation or task-flow problems.

## Branch rule

Each branch should answer one UX question.

Bad branch:

```text
Redesign the whole app to look better.
```

Good branch:

```text
Make the mobile editor shell let a first-time user understand:
1. where the canvas is,
2. how to add something,
3. how to preview,
4. how to finish,
without permanently exposing advanced tools.
```

## Suggested first branches

1. Information architecture / route split.
2. Customer journey and back behavior.
3. Mobile editor shell.
4. Canvas touch interactions.
5. Selection + contextual toolbar.
6. Bottom sheet system.
7. Template browser.
8. Text editing.
9. Image editing + replace.
10. Product-specific flows.
11. Preview.
12. Preflight.
13. Checkout.
14. Visual system consolidation.
