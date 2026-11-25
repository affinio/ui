<template>
  <article class="workspace-content">
    <p class="ui-eyebrow">Global preferences</p>
    <h2>Settings</h2>
    <p>These settings live in their own route-backed workspace tab.</p>
    <label class="workspace-content__setting">
      <span>Workspace name</span>
      <input value="Substation Engineering" aria-label="Workspace name" />
    </label>
  </article>
</template>

<style scoped>
.workspace-content { display: grid; align-content: start; gap: 0.8rem; min-height: 15rem; padding: 1.5rem; border: 1px solid var(--glass-border); border-radius: 1rem; background: color-mix(in srgb, var(--surface-alt) 72%, transparent); }
.workspace-content h2, .workspace-content p { margin: 0; }
.workspace-content > p:last-of-type { color: var(--text-muted); }
.workspace-content__setting { display: grid; gap: 0.4rem; max-width: 24rem; margin-top: 0.6rem; color: var(--text-muted); font-size: 0.9rem; }
.workspace-content__setting input { padding: 0.7rem 0.8rem; border: 1px solid var(--glass-border); border-radius: 0.6rem; color: var(--text-primary); background: var(--surface); font: inherit; }
</style>
