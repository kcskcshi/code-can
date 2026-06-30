import type { Store } from '../store'
import { LANGUAGE_BY_SLUG } from '../languages'
import { stats } from '../stats'
import { fmtVotes } from './format'
import { showToast } from './toast'

const SHARE_URL = 'https://code-can.vercel.app/'

/** Draw a shareable PNG of the current top-5 standings. */
function buildShareCard(store: Store): Promise<Blob> {
  const W = 640
  const H = 420
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  // background
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#1a1330')
  g.addColorStop(1, '#0c0a16')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 60; i++) {
    ctx.globalAlpha = 0.2 + ((i * 7) % 5) * 0.1
    ctx.fillStyle = '#fff'
    ctx.fillRect((i * 53) % W, (i * 97) % H, 2, 2)
  }
  ctx.globalAlpha = 1

  // title
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd34d'
  ctx.font = '28px "Press Start 2P", monospace'
  ctx.fillText('LUNCH WARS', W / 2, 56)
  ctx.fillStyle = '#a99fd0'
  ctx.font = '15px sans-serif'
  ctx.fillText('오늘 점심 1위는? 🍱', W / 2, 84)

  // top 5 rows
  const top = store.ranked().slice(0, 5)
  const leader = top[0]?.votes || 1
  const x0 = 60
  const barX = 230
  const barW = 320
  ctx.textAlign = 'left'
  top.forEach((l, i) => {
    const y = 130 + i * 52
    const emoji = LANGUAGE_BY_SLUG[l.slug]?.emoji ?? '🍽'
    ctx.fillStyle = i === 0 ? '#ffd34d' : '#e9e4ff'
    ctx.font = '18px sans-serif'
    ctx.fillText(`${i + 1}`, x0 - 28, y + 6)
    ctx.font = '22px serif'
    ctx.fillText(emoji, x0, y + 8)
    ctx.font = '17px sans-serif'
    ctx.fillStyle = i === 0 ? '#ffd34d' : '#e9e4ff'
    ctx.fillText(l.name, x0 + 32, y + 6)
    // bar
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(barX, y - 6, barW, 12)
    ctx.fillStyle = l.color
    ctx.fillRect(barX, y - 6, Math.max(6, (l.votes / leader) * barW), 12)
    ctx.fillStyle = '#cbb8ff'
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`${fmtVotes(l.votes)}표`, barX + barW, y - 10)
    ctx.textAlign = 'left'
  })

  // footer
  ctx.textAlign = 'center'
  ctx.fillStyle = '#7c5cff'
  ctx.font = '13px sans-serif'
  ctx.fillText(SHARE_URL, W / 2, H - 22)

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  })
}

/** Share the current standings as an image (Web Share), else download + copy link. */
export async function shareCard(store: Store) {
  const text = '오늘 점심 1위 투표 중! 🍱⚔ LUNCH WARS'
  try {
    const blob = await buildShareCard(store)
    const file = new File([blob], 'lunch-wars.png', { type: 'image/png' })
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: 'LUNCH WARS', text, url: SHARE_URL })
    } else {
      // fallback: download the image + copy the link
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lunch-wars.png'
      a.click()
      URL.revokeObjectURL(url)
      try {
        await navigator.clipboard?.writeText(SHARE_URL)
        showToast('카드 저장 완료! 링크도 복사했어요 📋')
      } catch {
        showToast('카드 이미지를 저장했어요 📸')
      }
    }
    stats.recordShare()
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') showToast('공유에 실패했어요 😢')
  }
}
