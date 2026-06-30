import type { Backend } from '../types'
import type { Store } from '../store'
import { el, rafThrottle } from './dom'
import { fmtVotes } from './format'
import { Turnstile } from './turnstile'

const COOLDOWN_MS = 1500
const VOTE_GAIN = 10 // a vote is +1.0 (10 tenths)

/** The voting booth: search box, a button per language, Turnstile, status line. */
export function mountVotePanel(root: HTMLElement, store: Store, backend: Backend): void {
  const turnstile = new Turnstile()
  const status = el('p', { class: 'vote-status', text: '오늘 점심 메뉴에 한 표! 🍽' })
  const tsBox = el('div', { class: 'turnstile-box' })
  const search = el('input', {
    class: 'vote-search',
    type: 'search',
    placeholder: '메뉴 검색…',
    'aria-label': '메뉴 검색',
  }) as HTMLInputElement
  const grid = el('div', { class: 'vote-grid' })

  root.append(
    el('div', { class: 'panel' }, [
      el('h2', { class: 'panel-title', text: '🗳 투표 (Cast your vote)' }),
      search,
      grid,
      tsBox,
      status,
    ]),
  )
  turnstile.mount(tsBox)

  let cooldownUntil = 0
  const buttons = new Map<string, HTMLButtonElement>()

  function setStatus(msg: string, kind: 'info' | 'ok' | 'err' = 'info') {
    status.textContent = msg
    status.dataset.kind = kind
  }

  async function castVote(slug: string) {
    const now = Date.now()
    if (now < cooldownUntil) return
    if (turnstile.enabled && !turnstile.token()) {
      setStatus('잠깐! 봇 확인을 먼저 완료해주세요.', 'err')
      return
    }
    cooldownUntil = now + COOLDOWN_MS
    const btn = buttons.get(slug)
    btn?.setAttribute('disabled', '')

    const res = await backend.vote(slug, turnstile.token())
    turnstile.consume()

    if (res.ok) {
      store.applyVote({ slug, total: res.total, amount: VOTE_GAIN, kind: 'vote' }, true)
      const name = store.get(slug)?.name ?? slug
      setStatus(`${name}에 투표 완료! 🍽 (총 ${fmtVotes(res.total)}표)`, 'ok')
    } else {
      cooldownUntil = res.retryAfter ? now + res.retryAfter * 1000 : cooldownUntil
      setStatus(
        res.retryAfter
          ? `너무 빠릅니다 — ${res.retryAfter}초 후 다시 시도하세요.`
          : `투표 실패: ${res.error}`,
        'err',
      )
    }
    // re-enable after cooldown
    const wait = Math.max(0, cooldownUntil - Date.now())
    window.setTimeout(() => btn?.removeAttribute('disabled'), wait)
  }

  const renderGrid = rafThrottle(() => {
    const q = search.value.trim().toLowerCase()
    const ranked = store.ranked()
    for (const lang of ranked) {
      let btn = buttons.get(lang.slug)
      if (!btn) {
        const swatch = el('span', { class: 'vote-swatch' })
        swatch.style.background = lang.color
        btn = el(
          'button',
          { class: 'vote-btn', type: 'button', onClick: () => castVote(lang.slug) },
          [swatch, el('span', { class: 'vote-btn-name', text: lang.name })],
        )
        buttons.set(lang.slug, btn)
      }
      const match = !q || lang.name.toLowerCase().includes(q) || lang.slug.includes(q)
      btn.style.display = match ? '' : 'none'
      grid.append(btn) // keep grid roughly in rank order
    }
  })

  search.addEventListener('input', renderGrid)
  store.onChange(renderGrid)
  renderGrid()
}
