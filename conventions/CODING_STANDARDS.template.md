# <Project> — Coding standards

<!--
Keel template. Copy to the project root as CODING_STANDARDS.md —
`mattpocock-skills:code-review` always reads that file and reviews the Standards axis against it
(a rule here overrides its built-in Fowler smell baseline). Keep each rule one
line plus its reason; delete any section that doesn't fit this project.
-->

## Modules
- **Deep modules:** a small interface hiding a lot of behaviour. If deleting a
  module would just move its complexity to the callers, it was a pass-through.
- **Accept dependencies, don't create them** — pass in clients, clocks, stores.
- **Return results, don't cause side effects** where you can; push I/O to the edges.
- **The interface is the test surface** — test through it, not around it.

## State (TypeScript)
- **State changes go through a reducer** `(state, action) => state`: one place
  to read every transition, testable without mocks.
- **Actions are a discriminated union** on `type`; the reducer's `switch` ends in
  an exhaustive `never` check so a new action can't be silently ignored.
- **Make impossible states impossible:** model status as a union
  (`{ status: "loading" } | { status: "error"; error: E } | { status: "ok"; data: T }`),
  not independent booleans.

```ts
type Action = { type: "added"; item: Item } | { type: "removed"; id: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "added":   return { ...state, items: [...state.items, action.item] };
    case "removed": return { ...state, items: state.items.filter(i => i.id !== action.id) };
    default: { const _exhaustive: never = action; return state; }
  }
}
```

## Naming
- Use the terms in `GLOSSARY.md`; a new concept gets a glossary entry first.

## Project-specific
- <rule> — <why>
