# Components

Use these conventions for reusable UI in `apps/frontend/src/components`. Read the existing component before adding a sibling so APIs and styling stay consistent.

## Placement and composition

- Put reusable primitives in `src/components/ui` (the current `Button` wraps `@base-ui/react/button` and uses class-variance-authority). Put form fields in `src/components/forms`, and domain components in a focused folder such as `src/components/auth`.
- Keep route-only presentation next to its owner under `src/routes` (or a route-owned subfolder). Do not make a generic component for a one-route detail.
- Use a barrel (`index.ts`) for a component group when it already has one or when it makes a cohesive public surface; avoid barrels that obscure ownership.
- A component should have one responsibility. Keep data loading, transformations, and complex business rules in route loaders, query hooks, or pure utilities, then pass the resulting data into presentational components.
- Split long components and modules when they develop multiple responsibilities. Do not create abstractions solely to avoid a short, clear JSX expression.

## UI and styling

- Build controls on the existing Base UI primitives where one exists, and follow the local shadcn component pattern for generated primitives. Preserve keyboard behavior, focus-visible styles, disabled states, and correct native semantics rather than replacing them with clickable `div`s.
- Use Tailwind CSS 4 utilities from the vocabulary configured in `src/styles/globals.css`. Use the `cn` helper from `src/lib/utils/cn.ts` when combining conditional classes, and let component variants be explicit (as in `buttonVariants`). Do not concatenate classes with string interpolation.
- Define a props type for each component. Prefer named exports and normal React imports; framework/config files are the exception when TanStack Start or Vite requires a default export.
- Prefer controlled inputs when the parent owns the value. For self-contained interactive widgets, keep state local only when it is part of that widget's behavior.
- Use semantic elements (`button`, `a`, `label`, headings, lists, and landmarks) before adding ARIA. Ensure labels and descriptions are associated with controls, focus is visible, and errors expose their state.

## Testability

- Accept data and callbacks as props rather than importing mutable global state directly. This keeps rendering deterministic and allows tests to supply controlled fixtures.

```tsx
type User = { name: string };
type UserCardProps = { user: User };

export function UserCard({ user }: UserCardProps) {
  return <article aria-label={`User: ${user.name}`}>{user.name}</article>;
}
```

- Extract non-trivial formatting and business rules into pure, typed functions. Keep browser effects and network calls out of presentational components where possible.

```tsx
export function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    price
  );
}
```

- Prefer queries that reflect user behavior (`getByRole`, `getByLabelText`, and `getByText`) over selectors coupled to CSS or implementation details. Use a test id only when no meaningful semantic target exists.
- Avoid uninjectable `Date.now()`, `Math.random()`, and direct `window` access during render. If a value is part of the component's contract, inject a typed function or value.

```tsx
type TimestampProps = { now?: () => number };

export function Timestamp({ now = Date.now }: TimestampProps) {
  const timestamp = now();
  const iso = new Date(timestamp).toISOString();
  return <time dateTime={iso}>{new Date(timestamp).toLocaleString()}</time>;
}
```

## Accessibility checklist

- Every form control has a visible label or an intentional accessible name.
- Connect descriptions and validation messages with `id`/`aria-describedby`; set `aria-invalid` when a value is invalid.
- Use `role="alert"` for prominent asynchronous errors, and make loading state discoverable with `aria-busy` when appropriate.
- Do not use color alone to communicate state, and preserve a logical tab order.
