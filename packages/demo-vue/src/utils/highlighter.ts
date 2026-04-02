import { createHighlighterCore } from "shiki/core"
import { createOnigurumaEngine } from "shiki/engine/oniguruma"
import onigWasmURL from "shiki/onig.wasm?url"

type ThemeModule = typeof import("shiki/themes/github-dark")
type LanguageModule = typeof import("shiki/langs/vue")
type Theme = ThemeModule extends { default: infer T } ? T : never
type Language = LanguageModule extends { default: infer T } ? T : never

const DEMO_THEME_ID = "github-dark"
const languageImports: Array<() => Promise<LanguageModule>> = [
  () => import("shiki/langs/vue"),
  () => import("shiki/langs/tsx"),
  () => import("shiki/langs/jsx"),
  () => import("shiki/langs/typescript"),
  () => import("shiki/langs/javascript"),
  () => import("shiki/langs/css"),
  () => import("shiki/langs/html"),
  () => import("shiki/langs/php"),
  () => import("shiki/langs/blade"),
]

let highlighterPromise: ReturnType<typeof createHighlighterCore> | null = null
let themePromise: Promise<Theme> | null = null
let languagesPromise: Promise<Language[]> | null = null

const enginePromise = createOnigurumaEngine(async () => {
  const response = await fetch(onigWasmURL)
  return response.arrayBuffer()
})

export const DEMO_HIGHLIGHTER_THEME = DEMO_THEME_ID

export async function getDemoHighlighter() {
  if (!highlighterPromise) {
    const [theme, languages] = await Promise.all([loadTheme(), loadLanguages()])
    highlighterPromise = createHighlighterCore({
      themes: [theme],
      langs: languages,
      engine: enginePromise,
    })
  }
  return highlighterPromise
}

function loadTheme(): Promise<Theme> {
  if (!themePromise) {
    themePromise = import("shiki/themes/github-dark").then((mod) => resolveDefault(mod))
  }
  return themePromise
}

function loadLanguages(): Promise<Language[]> {
  if (!languagesPromise) {
    languagesPromise = Promise.all(languageImports.map((factory) => factory().then((mod) => resolveDefault(mod))))
  }
  return languagesPromise
}

function resolveDefault<T>(module: { default: T } | T): T {
  return (module as { default?: T }).default ?? (module as T)
}
