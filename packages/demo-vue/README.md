# demo-vue

Sandbox package for trying Affino Vue component scenarios in one Vite app.

Included demo areas:

- menu
- dialog
- tooltip
- popover
- disclosure
- tabs
- treeview
- selection
- combobox
- virtualization

The package is wired against workspace source packages, so local changes in `packages/*` are reflected immediately in the sandbox.

## Commands

```sh
pnpm --dir packages/demo-vue dev
pnpm --dir packages/demo-vue type-check
pnpm --dir packages/demo-vue build
```

## Notes

- This package intentionally does not include datagrid demos.
- The sandbox is intentionally Vue-only and focuses on compact, copy-paste friendly examples.
- Overlay diagnostics are visible in the floating stack panel during local development.
