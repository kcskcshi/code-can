import './style.css'
import type { Backend } from './types'
import { Store } from './store'
import { BattleField } from './battle'
import { IS_LIVE } from './config'
import { DemoBackend } from './backend/demo'
import { SupabaseBackend } from './backend/supabase'
import { mountLeaderboard } from './ui/leaderboard'
import { mountVotePanel } from './ui/votePanel'
import { mountLiveFeed } from './ui/liveFeed'
import { el } from './ui/dom'

async function boot() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  const store = new Store()

  // --- layout ---------------------------------------------------------------
  const modeBadge = el('span', { class: 'mode-badge', text: '...' })
  const canvas = el('canvas', { class: 'battle-canvas' })
  const battleWrap = el('section', { class: 'battlefield' }, [canvas])
  const colLeft = el('div', { class: 'col col-left' })
  const colMid = el('div', { class: 'col col-mid' })
  const colRight = el('div', { class: 'col col-right' })

  app.append(
    el('header', { class: 'site-header' }, [
      el('div', { class: 'brand' }, [
        el('h1', { class: 'logo', text: 'code-can' }),
        modeBadge,
      ]),
      el('p', {
        class: 'tagline',
        text: '세상에서 가장 위대한 프로그래밍 언어는? 깡통에 한 표를 던지면, 도트 군대가 전쟁을 시작한다.',
      }),
    ]),
    battleWrap,
    el('main', { class: 'grid' }, [colLeft, colMid, colRight]),
    el('footer', { class: 'site-footer' }, [
      el('p', {
        text: '스페인 길거리에서 여행자들이 "가장 위대한 언어"를 묻는 깡통 투표로 여비를 벌던 일화에서 출발했습니다.',
      }),
    ]),
  )

  // --- backend (live Supabase, or in-memory demo) ---------------------------
  let backend: Backend
  try {
    backend = IS_LIVE ? new SupabaseBackend() : new DemoBackend()
    const langs = await backend.load()
    store.init(langs)
  } catch (err) {
    console.warn('[code-can] live backend unavailable, falling back to demo:', err)
    backend = new DemoBackend()
    store.init(await backend.load())
  }

  modeBadge.textContent = backend.mode === 'live' ? '● LIVE' : '● DEMO'
  modeBadge.dataset.mode = backend.mode
  modeBadge.title =
    backend.mode === 'live'
      ? 'Supabase 실시간 연결됨'
      : 'Supabase 미설정 — 로컬 시뮬레이션 모드 (README 참고)'

  // stream remote votes into the store
  backend.subscribe((e) => store.applyVote(e, false))

  // --- mount UI -------------------------------------------------------------
  mountLeaderboard(colLeft, store)
  mountVotePanel(colMid, store, backend)
  mountLiveFeed(colRight, store)

  const battle = new BattleField(canvas, store)
  battle.start()
}

boot()
