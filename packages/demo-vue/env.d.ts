/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

declare module "*.vue?raw" {
	const content: string
	export default content
}

declare module "*.tsx?raw" {
	const content: string
	export default content
}

declare module "shiki/langs/*" {
	import type { LanguageRegistration } from "shiki"
	const language: LanguageRegistration
	export default language
}

declare module "shiki/themes/*" {
	import type { ThemeRegistrationAny } from "shiki"
	const theme: ThemeRegistrationAny
	export default theme
}

declare module "shiki/engine/oniguruma" {
	export { createOnigurumaEngine } from "@shikijs/engine-oniguruma"
}

declare module "shiki/onig.wasm?url" {
	const url: string
	export default url
}
