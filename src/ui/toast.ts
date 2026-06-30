import { el } from './dom'

let stack: HTMLElement | null = null

/** Show a transient toast (e.g., an achievement unlock). Auto-dismisses. */
export function showToast(text: string) {
  if (!stack) {
    stack = el('div', { class: 'toast-stack' })
    document.body.append(stack)
  }
  const t = el('div', { class: 'toast', text })
  stack.append(t)
  window.setTimeout(() => t.classList.add('toast-out'), 2600)
  window.setTimeout(() => t.remove(), 3100)
}
