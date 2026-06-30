# LUNCH WARS 🍱⚔ — 점심 메뉴 투표 전장

> 오늘 점심 뭐 먹지? 메뉴에 한 표를 던져 행성을 키우고, 라이벌 행성을 꾹 눌러 부숴라.
> 모든 접속자가 공유하는 픽셀 전장에서 파타퐁풍 군대가 실시간으로 행진하고 창을 던집니다.

스페인 길거리에서 여행자들이 _"가장 위대한 점심 메뉴"_ 를 묻는 깡통 투표로 여비를 벌던
일화에서 출발했습니다. 메뉴마다 "얼굴 달린 행성"과 군대가 있고, 득표하면 군대가 늘고,
공격하면 병사들이 적 행성으로 창을 던집니다.

## 핵심 특징

- **실시간 공유 전장** — Supabase Realtime으로 모든 접속자가 같은 전투를 봅니다.
- **파타퐁풍 픽셀 전쟁 UI** — Canvas로 그린 병사 군대가 공용 비트(BPM)에 맞춰 행진·홉하고,
  공격 시 땅의 병사들이 타깃 행성으로 창을 포물선으로 던집니다. 선택형 드럼 사운드(🥁) 포함.
- **무료 익명 투표 + 전투** — 로그인 불필요. 자기 행성을 꾹 누르면 투표(+), 라이벌을 누르면 공격(−).
- **하루 단위 라운드** — KST 자정마다 어제 1위를 명예의 전당에 보관하고 득표를 리셋, 새 점심 레이스 시작.
- **하루치 채팅** — 라이브 채팅이 당일분만 저장되어 새로고침해도 유지되고 롤오버 때 비워집니다.
- **DEMO 모드 내장** — Supabase 미설정 시 인메모리 시뮬레이션으로 곧바로 플레이 가능.

## 아키텍처

```
브라우저 (정적 SPA, Vite + TS + Canvas)
  │  Realtime 구독 ─────────────► Supabase Realtime ◄─ 모든 접속자 공유
  │     • battlefield : languages UPDATE (권위 있는 득표 총계)
  │     • arena       : 채팅 + 공격 애니메이션 broadcast
  │     • lobby       : 접속자 presence
  │  투표/공격 RPC ─► cast_vote / attack_language (SECURITY DEFINER)
  │                     └─ languages.total_votes 갱신 → Realtime 자동 브로드캐스트
  │  채팅 ─► post_message (저장) + arena broadcast (즉시 전달)
  │  부팅 시 ─► roll_round_if_due() : 새 KST 날이면 우승 보관·득표 리셋·구 채팅 정리
  └─ 이벤트 수신 → 픽셀 군대 행진·창 투척·파티클 연출
```

**보안 모델**: 클라이언트(anon 키)는 테이블을 **읽기만** 가능합니다(RLS). 모든 쓰기는
`SECURITY DEFINER` RPC(`cast_vote`, `attack_language`, `post_message`, `roll_round_if_due`)를
거치므로 anon 키로 득표를 직접 조작할 수 없습니다. (별도 서버/Edge Function 불필요 —
`supabase/functions/vote` 는 더 이상 라이브 경로에 쓰이지 않는 레거시입니다.)

> 득표는 **1/10 단위 정수**로 저장됩니다(투표 +10 = 1.0, 공격 한 틱 −1 = 0.1). 표시할 때만
> 10으로 나눕니다(`fmtVotes`).

## 기술 스택

| 영역      | 사용 기술                                          |
| --------- | -------------------------------------------------- |
| 프론트    | Vite + TypeScript, HTML5 Canvas (의존성 거의 없음) |
| 오디오    | Web Audio API 신스 드럼 (`src/audio/drums.ts`)     |
| DB        | Supabase Postgres                                  |
| 실시간    | Supabase Realtime (Postgres Changes + Broadcast)   |
| 서버 로직 | Postgres `SECURITY DEFINER` 함수 (RPC)             |
| 호스팅    | Vercel (`main` 푸시 시 자동 배포)                  |
| 봇 차단   | (선택) Cloudflare Turnstile                        |

## 로컬 실행

```bash
npm install
npm run dev          # http://localhost:5173/code-can/   (Supabase 미설정 시 DEMO 모드)
```

> 베이스 경로가 `/code-can/` 이므로 dev URL 끝에 `/code-can/` 가 붙습니다(루트는 404).
> Vercel 빌드는 자동으로 `base: '/'` 를 씁니다. `vite.config.ts` / `VITE_BASE` 참고.

빌드/타입체크:

```bash
npm run build        # tsc(타입체크) + vite build. 테스트/린터는 없고 이 빌드가 유일한 검사.
                     # tsconfig 의 noUnusedLocals/Parameters 때문에 미사용 변수는 빌드를 깨뜨립니다.
```

### LIVE 모드 (실제 Supabase 연결)

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성.
2. 환경변수 설정:
   ```bash
   cp .env.example .env
   # .env 에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 입력
   ```
3. 스키마 + RPC 배포 — **Supabase 대시보드 → SQL Editor** 에 `supabase/deploy.sql` 전체를
   붙여넣고 Run. (멱등이라 재실행해도 안전. CLI 를 쓴다면 `npx supabase db push` 로 마이그레이션 적용도 가능.)
4. `npm run dev` — 헤더 배지가 `● LIVE` 면 연결 성공. 탭 2개로 열어 한쪽에서 투표/공격하면
   다른 탭이 실시간 갱신되는지 확인하세요.

## 배포 (Vercel)

`main` 브랜치에 푸시하면 Vercel 의 GitHub 연동이 프로덕션 빌드를 자동 트리거합니다(레포에
설정 파일 없음 — 빌드/환경변수는 Vercel 대시보드에서 관리). LIVE 모드로 띄우려면 Vercel
프로젝트의 **Settings → Environment Variables (Production)** 에 `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` (선택 `VITE_TURNSTILE_SITE_KEY`) 를 넣으세요. 미설정이면 DEMO 모드로 배포됩니다.

> **프론트 배포와 DB 는 독립**입니다. 스키마/RPC 를 바꾸면 `deploy.sql` 을 Supabase 에 별도로 적용해야 합니다.
> (레포에 GitHub Pages 워크플로(`.github/workflows/deploy.yml`)도 남아 있지만 현재 활성 호스트는 Vercel 입니다.)

## 프로젝트 구조

```
src/
  main.ts            진입점: 레이아웃 구성 + 백엔드 선택 + 전장 시작
  battle.ts          픽셀 전장 Canvas 렌더러 (비트 클럭 · 행진 병사 · 창 투척 · 드럼)
  store.ts           클라이언트 상태 허브 (이벤트 중복 제거 포함)
  types.ts           Backend 인터페이스 + 공유 타입
  config.ts          환경변수 · 전장 상수(BATTLE_SQUADS, BPM 등)
  languages.ts       메뉴 카탈로그(slug/이름/색/태그/이모지) — DB 시드의 원본
  audio/drums.ts     Web Audio 신스 드럼 (파타·폰)
  backend/
    supabase.ts      LIVE 백엔드 (Postgres + Realtime + RPC)
    demo.ts          DEMO 백엔드 (인메모리 시뮬레이션)
  ui/                leaderboard / votePanel / combatPanel / chatPanel / 모달 등
supabase/
  deploy.sql         ★ 정식 one-shot 설정 (SQL Editor 에 붙여넣어 실행)
  migrations/        증분 마이그레이션 (…0008 일일 라운드, 0009 채팅 영속)
  setup.sql          구버전 스크립트 (사용하지 말 것)
  functions/vote/    레거시 Edge Function (현재 미사용)
.github/workflows/   GitHub Pages 워크플로 (비활성 — 현재 Vercel 사용)
```
