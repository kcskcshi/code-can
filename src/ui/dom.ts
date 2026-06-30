type Props = Record<string, string | number | boolean | EventListener | undefined>

/** Tiny element helper — keeps the UI modules free of innerHTML/XSS concerns. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue
    if (k === 'class') node.className = String(v)
    else if (k === 'text') node.textContent = String(v)
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
    } else if (typeof v === 'boolean') {
      if (v) node.setAttribute(k, '')
    } else {
      node.setAttribute(k, String(v))
    }
  }
  for (const c of children) node.append(c)
  return node
}

/** requestAnimationFrame-throttled callback (coalesces bursts of updates). */
export function rafThrottle(fn: () => void): () => void {
  let scheduled = false
  return () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      fn()
    })
  }
}
