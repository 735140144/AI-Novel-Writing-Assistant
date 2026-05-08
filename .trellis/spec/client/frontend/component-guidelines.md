# Component Guidelines

> How components are built in this project.

---

## Overview

Frontend components should keep user entry points aligned with the workflow scope they control. A component that renders one repeated entity, such as a novel card, should not become the primary entry point for a cross-entity workflow unless the product requirement explicitly approves that placement.

---

## Component Structure

<!-- Standard structure of a component file -->

(To be filled by the team)

## Entry Point Placement

### Convention: Menu-Level Entry Points for Cross-Novel Workflows

**What**: Product capabilities that operate across novels, or that first require choosing a novel, should use a menu-level route and page. Examples include `/publishing`, which opens the publishing platform and then lets the user choose the novel to publish.

**Why**: Repeated cards are for actions on that specific item. Putting a new workflow into every card makes the feature harder to find as a product-level capability, increases visual noise, and can conflict with user expectations when the workflow begins with choosing or managing a project.

**Correct**:

```tsx
// Router and menu expose the feature as a standalone workflow.
{ path: "publishing", element: <PublishingPlatformPage /> }
{ to: "/publishing", label: "发布平台", icon: UploadCloud }
```

```tsx
// The standalone page chooses a novel before rendering the workflow.
<PublishingWorkspaceTab {...publishingTab} />
```

**Wrong**:

```tsx
// Do not add cross-novel workflow entry points to every novel card.
<Link to={`/novels/${novel.id}/edit?stage=publishing`}>发布平台</Link>
```

**Tests Required**:

- Assert the menu-level route exists in router, desktop navigation, and mobile navigation.
- Assert repeated item views such as `NovelList.tsx` do not contain the forbidden card-level route.
- Assert the standalone page reuses the workflow component instead of duplicating publishing controls.

---

## Props Conventions

<!-- How props should be defined and typed -->

(To be filled by the team)

---

## Styling Patterns

<!-- How styles are applied (CSS modules, styled-components, Tailwind, etc.) -->

(To be filled by the team)

---

## Accessibility

<!-- A11y requirements and patterns -->

(To be filled by the team)

---

## Common Mistakes

<!-- Component-related mistakes your team has made -->

(To be filled by the team)
