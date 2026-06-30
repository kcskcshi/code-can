import { el } from './dom'

/** Open a simple centered modal. Closes on the X, backdrop click, or Escape. */
export function openModal(title: string, content: Node): () => void {
  const close = () => {
    document.removeEventListener('keydown', onKey)
    overlay.remove()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
  }
  const card = el('div', { class: 'modal-card' }, [
    el('div', { class: 'modal-head' }, [
      el('h3', { class: 'modal-title', text: title }),
      el('button', { class: 'modal-close', type: 'button', text: '✕', onClick: close }),
    ]),
    el('div', { class: 'modal-body' }, [content]),
  ])
  const overlay = el('div', {
    class: 'modal-overlay',
    onClick: (e: Event) => {
      if (e.target === overlay) close()
    },
  }, [card])
  document.body.append(overlay)
  document.addEventListener('keydown', onKey)
  return close
}
