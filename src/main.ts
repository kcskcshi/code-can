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
import { mountCombatHud } from './ui/combatPanel'
import { mountChatPanel } from './ui/chatPanel'
import { el } from './ui/dom'

async function boot() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  const store = new Store()

  // --- layout ---------------------------------------------------------------
  const modeBadge = el('span', { class: 'mode-badge', text: '...' })
  const presenceBadge = el('span', { class: 'presence-badge', text: '🟢 …' })
  const canvas = el('canvas', { class: 'battle-canvas' })
  const battleWrap = el('section', { class: 'battlefield' }, [canvas])
  const hud = el('section', { class: 'hud-bar' })
  const colVote = el('div', { class: 'col col-vote' })
  const colStand = el('div', { class: 'col col-stand' })
  const colFeed = el('div', { class: 'col col-feed' })
  const colChat = el('div', { class: 'col col-chat' })

  app.append(
    el('header', { class: 'site-header' }, [
      el('div', { class: 'brand' }, [
        el('h1', { class: 'logo', text: 'LUNCH WARS' }),
        modeBadge,
        presenceBadge,
      ]),
      el('p', {
        class: 'tagline',
        text: '오늘 점심 뭐 먹지? 메뉴에 투표해 행성을 키우고, 라이벌 행성을 꾹 눌러 부숴라 🍱⚔',
      }),
    ]),
    battleWrap,
    hud,
    el('main', { class: 'grid' }, [colVote, colStand, colFeed, colChat]),
    el('footer', { class: 'site-footer' }, [
      el('p', {
        text: '스페인 길거리에서 여행자들이 "가장 위대한 점심 메뉴"를 묻는 깡통 투표로 여비를 벌던 일화에서 출발했습니다.',
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

  // live player count in the header
  backend.subscribePresence((n) => {
    presenceBadge.textContent = `🟢 ${n}명 전쟁 중`
  })

  // stream remote votes/attacks into the store
  backend.subscribe((e) => store.applyVote(e, false))
  // stream ephemeral chat + assault animations from the arena channel
  backend.subscribeArena({
    onChat: (m) => store.addChat(m),
    onAssault: (a) => store.emitAssault(a),
  })

  // --- mount UI -------------------------------------------------------------
  const combat = mountCombatHud(hud, store, backend)
  mountVotePanel(colVote, store, backend)
  mountLeaderboard(colStand, store)
  mountLiveFeed(colFeed, store)
  mountChatPanel(colChat, store, backend)

  const battle = new BattleField(canvas, store)
  // press-and-hold an enemy planet on the field → auto-fire attacks (combo ramps damage)
  battle.onAttackTarget((slug, amount) => combat.onAttack(slug, amount))
  battle.start()
}

boot()
