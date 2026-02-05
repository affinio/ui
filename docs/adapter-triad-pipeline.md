# Adapter Triad Pipeline (`core` + `vue` + `laravel`)

This pipeline standardizes how new Affino primitives are added across ecosystems.

## Why

- Keep package architecture consistent across primitives.
- Ensure every new primitive starts with test coverage.
- Avoid one-off folder structures and integration drift.

## Command

```bash
pnpm run scaffold:adapter-triad -- <feature-kebab>
```

Examples:

```bash
pnpm run scaffold:adapter-triad -- tabs
pnpm run scaffold:adapter-triad -- disclosure
```

## What gets generated

For `<feature>`, the scaffold creates:

- `packages/<feature>-core`
- `packages/<feature>-vue`
- `packages/<feature>-laravel`

Each package includes:

- `package.json`
- `tsconfig.json`
- `README.md`
- `CHANGELOG.md`
- `vitest.config.ts`
- source entrypoint
- baseline tests

## Consistency gates (required)

After scaffold, every new primitive must pass:

```bash
pnpm --filter @affino/<feature>-core test
pnpm --filter @affino/<feature>-vue test
pnpm --filter @affino/<feature>-laravel test

pnpm --filter @affino/<feature>-core build
pnpm --filter @affino/<feature>-vue build
pnpm --filter @affino/<feature>-laravel build
```

## Follow-up implementation checklist

1. Replace baseline state/controller logic in `*-core` with real primitive behavior.
2. Align Vue composable API with ecosystem conventions (`state`, `dispose`, typed helpers).
3. Align Laravel hydration/scan/livewire behavior with adapter standards.
4. Add interop tests where overlay participation is required.
5. Add docs entry to component reference and getting-started guides.
