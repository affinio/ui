

<template>
  <footer class="app-footer">
    <div class="app-footer__content">
      <p class="app-footer__copy">
        Affino sandbox for calmer, more tactile component demos.
      </p>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  padding: 0 1rem 1.5rem;
}

.app-footer__content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  border-top: 1px solid var(--glass-border);
  padding-top: 1.2rem;
}

.app-footer__copy {
  font-size: 0.88rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
</style>
