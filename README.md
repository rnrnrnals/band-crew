# BandCrew

밴드팀 소셜 + 온라인 연습실 (React + Vite + Supabase)

## 기능

- **홈**: 팔로우 팀 스토리 · 피드 · 사운드
- **연습실**: 레이어드 합주 (녹음/녹화, 볼륨, 싱크 조절, 클라우드 저장)
- **업로드**: 팀 피드 · 스토리 · 사운드
- **채팅**: 팀 · 크로스팀 DM (Realtime)
- **일정**: 연습 · 공연
- **마이**: 팀 설정 · 멤버 · 초대 · 팀 나가기

Supabase 환경 변수가 없으면 **로컬 데모 모드**(`localStorage`)로 동작합니다.

## 로컬 개발

```bash
cd band-crew
npm install
cp .env.example .env   # Windows: copy .env.example .env
```

`.env`에 Supabase 키 입력:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
# 선택: 일정 장소 검색
VITE_KAKAO_MAP_APP_KEY=
```

DB 마이그레이션은 [`supabase/README.md`](supabase/README.md) 순서대로 SQL Editor에서 실행하세요.

```bash
npm run dev
```

브라우저: `http://localhost:5173`

### 첫 사용 (Supabase)

1. 회원가입 / 로그인
2. 팀 만들기 또는 초대 코드 **`BAND-DEMO`** (seed.sql 실행 시)
3. 연습실 마이크·카메라 권한 허용 (**HTTPS** 또는 localhost)

## 배포 (Vercel 권장)

### 1. GitHub에 올리기

```bash
git init
git add .
git commit -m "Prepare BandCrew for deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USER/band-crew.git
git push -u origin main
```

### 2. Vercel 연결

1. [vercel.com](https://vercel.com) → **Add New Project** → GitHub repo 선택
2. Framework: **Vite** (자동 감지)
3. **Environment Variables** 추가:

| Name | Value |
|------|--------|
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key |
| `VITE_KAKAO_MAP_APP_KEY` | (선택) 카카오 JavaScript 키 |

4. **Deploy**

`vercel.json`에 SPA 라우팅(`react-router`) rewrite가 포함되어 있습니다.

### 3. Supabase Auth URL 설정 (필수)

배포 URL을 받은 뒤 Supabase Dashboard:

**Authentication → URL Configuration**

| 항목 | 값 |
|------|-----|
| Site URL | `https://your-app.vercel.app` |
| Redirect URLs | `https://your-app.vercel.app/**` , `http://localhost:5173/**` |

### 4. Netlify (대안)

`netlify.toml` / `public/_redirects` 포함. Build command `npm run build`, publish `dist`, 동일 env 변수 설정.

### CLI로 바로 배포

```bash
npm run build
npx vercel --prod
```

처음 실행 시 로그인 · 프로젝트 연결 후 env 변수를 Vercel 대시보드에 등록하세요.

## DB 마이그레이션 순서

`supabase/migrations/` (신규 DB):

1. `20260719100000_initial_schema.sql`
2. `20260719200000_team_audio_likes.sql`
3. `20260719300000_storage_media.sql`
4. `20260719400000_chat_realtime.sql`
5. `20260719500000_practice_tracks.sql`
6. `20260719600000_practice_track_sync.sql`
7. `20260719700000_practice_track_volume.sql`
8. `20260719810000_practice_session_author.sql`

(선택) `supabase/seed.sql` — 데모 팀 `BAND-DEMO`

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 → `dist/` |
| `npm run preview` | 빌드 결과 로컬 미리보기 |
| `npm run lint` | oxlint |

## 연습실 · Storage

- 트랙/세션 삭제 시 Supabase Storage 파일도 함께 삭제
- 연습 트랙 경로: `media/practice/{teamId}/{sessionId}/`
- 자세한 RLS·마이그레이션: [`supabase/README.md`](supabase/README.md)
