import {
  getCurrentInstance,
  inject,
  provide,
  readonly,
  shallowRef,
  type InjectionKey,
  type ShallowRef,
} from "vue"
import type { OverlayRegistrar, OverlayRegistration } from "@affino/dialog-core"

export interface DialogOverlayRegistrar extends OverlayRegistrar {
  readonly stack: Readonly<ShallowRef<readonly OverlayRegistration[]>>
}

export interface DialogOverlayRegistrarOptions {
  onStackChange?: (stack: readonly OverlayRegistration[]) => void
}

const overlayRegistrarKey: InjectionKey<DialogOverlayRegistrar> = Symbol(
  "affino:dialog-overlay-registrar"
)

export function createDialogOverlayRegistrar(
  options: DialogOverlayRegistrarOptions = {}
): DialogOverlayRegistrar {
  const stackRef = shallowRef<readonly OverlayRegistration[]>([])
  const publicStack = readonly(stackRef)

  const notify = () => {
    options.onStackChange?.([...stackRef.value])
  }

  const register: OverlayRegistrar["register"] = (registration) => {
    stackRef.value = [
      ...stackRef.value.filter((entry) => entry.id !== registration.id),
      registration,
    ]
    notify()
    return () => {
      stackRef.value = stackRef.value.filter((entry) => entry.id !== registration.id)
      notify()
    }
  }

  const isTopMost: OverlayRegistrar["isTopMost"] = (id) => {
    const stack = stackRef.value
    if (!stack.length) {
      return false
    }
    const top = stack[stack.length - 1]
    return top?.id === id
  }

  return {
    stack: publicStack,
    register,
    isTopMost,
  }
}

export function provideDialogOverlayRegistrar(
  registrar?: DialogOverlayRegistrar
): DialogOverlayRegistrar {
  const instance = getCurrentInstance()
  if (!instance) {
    throw new Error("provideDialogOverlayRegistrar must be called within setup().")
  }
  const resolved = registrar ?? createDialogOverlayRegistrar()
  provide(overlayRegistrarKey, resolved)
  return resolved
}

export function useDialogOverlayRegistrar(): DialogOverlayRegistrar | null {
  if (!getCurrentInstance()) {
    return null
  }
  return inject(overlayRegistrarKey, null)
}
