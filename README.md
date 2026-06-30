# code-can ⚔ — Language War Voting Booth

> 세상에서 가장 위대한 프로그래밍 언어는? 깡통에 한 표를 던지면, 도트 픽셀 군대가
> 실시간으로 전쟁을 시작합니다.

스페인 길거리에서 여행자들이 _"가장 위대한 언어"_ 를 묻는 깡통 투표로 여비를 벌던
일화에서 출발한 프로젝트입니다. 개발자들이 자기 언어에 한 표씩 던지고, 모든 접속자가
공유하는 8-bit 전장에서 언어별 군대가 충돌·전진하는 모습을 실시간으로 봅니다.

## 핵심 특징

- **실시간 공유 전장** — Supabase Realtime으로 모든 접속자가 같은 전투를 봅니다.
- **도트 픽셀 전쟁 UI** — Canvas로 그린 픽셀 군대, 득표 시 증원·돌격·파티클 이펙트.
- **무료 익명 투표** — 로그인 불필요. 레이트리밋 + Cloudflare Turnstile로 어뷰징 방지.
- **완전 서버리스** — 정적 프론트는 GitHub Pages, 백엔드는 Supabase(Edge Functions/DB/Realtime).
- **DEMO 모드 내장** — Supabase 미설정 시 로컬 시뮬레이션으로 곧바로 플레이 가능.

## 아키텍처

```
브라우저(GitHub Pages 정적 SPA)
  │  Realtime 구독 ───────────► Supabase Realtime ◄─ 모든 접속자 공유
  │  투표 POST ─► Edge Function /vote
  │                 ├─ Turnstile 토큰 검증
  │                 ├─ 레이트리밋(ip_hash 최근 투표 수)
  │                 └─ increment_vote() : languages +1, vote_log 기록
  │                       UPDATE → Realtime이 전 클라이언트에 자동 브로드캐스트
  └─ 델타 수신 → 픽셀 군대 증원·돌격 연출
```

보안: 클라이언트는 `languages` **읽기만** 가능합니다(RLS). 모든 쓰기는 service_role로
동작하는 Edge Function을 거치므로, anon 키로 표를 직접 조작할 수 없습니다.

## 기술 스택

| 영역      | 사용 기술                                            |
| --------- | ---------------------------------------------------- |
| 프론트    | Vite + TypeScript, HTML5 Canvas (의존성 거의 없음)   |
| 호스팅    | GitHub Pages + GitHub Actions                        |
| DB        | Supabase Postgres                                    |
| 실시간    | Supabase Realtime (Postgres Changes)                 |
| 서버 로직 | Supabase Edge Functions (Deno)                       |
| 봇 차단   | Cloudflare Turnstile                                 |

## 로컬 실행

```bash
npm install
npm run dev          # http://localhost:5173  (Supabase 미설정 시 DEMO 모드)
```

### LIVE 모드 (실제 Supabase 연결)

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성.
2. 환경변수 설정:
   ```bash
   cp .env.example .env
   # .env 에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 입력
   ```
3. 스키마 + 함수 배포 (Supabase CLI):
   ```bash
   npx supabase login
   npx supabase link --project-ref <YOUR-PROJECT-REF>
   npx supabase db push                 # 마이그레이션(테이블/RLS/시드/RPC) 적용
   npx supabase functions deploy vote   # 투표 Edge Function 배포
   ```
4. (선택) 봇 차단 — Turnstile 키 발급 후:
   ```bash
   # 프론트(.env): VITE_TURNSTILE_SITE_KEY=...
   npx supabase secrets set TURNSTILE_SECRET_KEY=...   # 서버 비밀키
   npx supabase secrets set VOTE_SALT=<아무 랜덤 문자열>  # IP 해시 솔트
   ```
5. `npm run dev` — 헤더 배지가 `● LIVE` 면 연결 성공. 탭 2개로 열어 한쪽에서 투표하면
   다른 탭이 실시간 갱신되는지 확인하세요.

### 로컬 Supabase (Docker 필요)

```bash
npx supabase start          # 로컬 Postgres+Realtime+Functions 기동
npx supabase functions serve vote
# .env 에 supabase start 가 출력한 로컬 URL/anon 키 입력
```

## 배포 (GitHub Pages)

1. 이 저장소를 GitHub의 `code-can` 이름으로 푸시.
2. **Settings → Pages → Source → GitHub Actions** 선택.
3. (LIVE 모드면) **Settings → Secrets and variables → Actions** 에 추가:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, (선택)`VITE_TURNSTILE_SITE_KEY`.
4. `main` 브랜치에 푸시 → Actions가 빌드 후 `https://<user>.github.io/code-can/` 에 배포.

> 저장소 이름을 바꾸거나 커스텀 도메인을 쓰면 `vite.config.ts` 의 `base` (또는 빌드
> 환경변수 `VITE_BASE`)를 맞춰주세요. Secrets 미설정이어도 DEMO 모드로 정상 배포됩니다.

## 프로젝트 구조

```
src/
  main.ts            진입점: 레이아웃 구성 + 백엔드 선택 + 전장 시작
  battle.ts          픽셀 전장 Canvas 렌더러
  store.ts           클라이언트 상태 허브 (이벤트 중복 제거 포함)
  languages.ts       언어 카탈로그(색/태그) — DB 시드의 원본
  backend/
    supabase.ts      LIVE 백엔드 (Postgres + Realtime + Edge Function)
    demo.ts          DEMO 백엔드 (인메모리 시뮬레이션)
  ui/                leaderboard / votePanel / liveFeed / turnstile
supabase/
  migrations/        0001 스키마·RLS·시드, 0002 increment_vote RPC
  functions/vote/    투표 Edge Function (Deno)
.github/workflows/   GitHub Pages 자동 배포
```

## 향후 과제

- 사용자 언어 직접 추가 + 모더레이션
- 시즌제 랭킹 리셋·명예의 전당
- (원작 감성) 선택적 후원/Boost 가중 투표
