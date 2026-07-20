# Supabase (BandCrew)

## Step B — Apply database schema

### First time

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Go to **SQL Editor** → **New query**
3. Copy the entire contents of:
   ```
   supabase/migrations/20260719100000_initial_schema.sql
   ```
4. Click **Run**
5. Confirm in **Table Editor** that tables exist (see list below)

### If you see `relation "profiles" already exists`

The migration was run before (fully or partly). **No problem** — reset and re-apply:

1. **SQL Editor** → run **`supabase/migrations/20260719090000_reset_schema.sql`** (whole file)
2. Then run **`20260719100000_initial_schema.sql`** again

Optional: run **`supabase/check_schema.sql`** to see what is already in the database.

> Reset deletes BandCrew table data only. Fine while still in development.

| Table | Purpose |
|-------|---------|
| `profiles` | User profile (linked to Auth) |
| `teams` | Band teams |
| `team_members` | Membership, nick, position |
| `team_follows` | Team-to-team follows |
| `posts` / `post_likes` / `post_comments` | Feed |
| `team_audio_tracks` / `team_audio_likes` / `audio_comments` | Sound tab |
| `stories` / `highlights` / `highlight_items` | Stories |
| `schedule_events` | Calendar |
| `practice_sessions` / `practice_tracks` | Practice room |
| `chat_messages` | Team & cross-team chat |

## Schema notes

- All primary keys are **UUID** (not the mock string ids like `t-demo`).
- RLS is enabled; policies require **authenticated** users (`auth.uid()`).
- `handle_new_user` trigger creates a `profiles` row when someone signs up (Step C).
- Media URLs are stored as public Supabase Storage URLs in the `media` bucket (Step E).

## Troubleshooting

- **`relation "profiles" already exists`** — run `20260719090000_reset_schema.sql`, then `initial_schema.sql` again.
- **`type already exists`** — same reset script, then re-apply.
- **"permission denied for schema auth"** — run only in Supabase SQL Editor (not locally without service role).

## Step C — Auth (email login)

### Supabase Dashboard settings

1. **Authentication → Providers → Email** — enable Email provider
2. For development, you may disable **Confirm email** under Email settings (faster testing)
3. **Authentication → URL Configuration** — add site URL:
   - Dev: `http://localhost:5173`

### App behavior

- On launch, **login / signup** screen appears (when `.env` has Supabase keys)
- Session persists in the browser
- `profiles` row is created automatically on signup (DB trigger from Step B)
- Profile edits sync to Supabase `profiles` table
- **Settings → 로그아웃** ends the session

### Troubleshooting

- **Invalid login credentials** — check email/password or complete email confirmation
- **profiles row missing** — confirm Step B trigger `on_auth_user_created` exists
- **RLS error on profile update** — user must be logged in (`authenticated`)

## Next step

**D — Data sync**: Replace localStorage mock data with Supabase reads/writes (teams, posts, audio, …).

### D-1 (implemented)

- Login 후 **Supabase에서 데이터 로드** (팀, 피드, 사운드, 팔로우)
- **DB에 저장**: 팀 생성/가입, 게시물, 댓글, 좋아요, 사운드, 팔로우, 프로필/팀 설정

### D-2 (implemented)

- **DB 로드**: 스토리, 하이라이트, 일정, 연습실 세션, 채팅
- **DB 저장**: 스토리 업로드, 하이라이트 CRUD, 일정 추가, 연습 세션 생성, 채팅 메시지
- 연습실 **레이어 트랙** → Step G (`practice_tracks` + Storage `practice/`)

### Optional demo seed

`supabase/seed.sql` 실행 → `BAND-DEMO` 코드로 데모 팀 가입 가능

### Next

(로드맵 완료 — 필요 시 배포 · `supabase gen types` · 스토리/채팅 삭제 시 Storage 정리 확장)

## Step G — 연습실 트랙 동기화

### Apply migration

SQL Editor에서 실행:

```
supabase/migrations/20260719500000_practice_tracks.sql
```

- `practice_tracks` 테이블 (세션별 레이어 메타 + waveform peaks)
- Storage `practice/{teamId}/{sessionId}/` 경로 RLS 추가

### App behavior

- 로그인 후 연습실 입장 시 **DB에서 트랙 로드**
- 녹음/업로드 시 **Storage 업로드 + DB 저장** (400ms 디바운스)
- 트랙 삭제 시 **DB + Storage** 함께 삭제
- Supabase 미설정 시 기존 `localStorage`(`practiceStorage`) 사용

### 테스트

1. 마이그레이션 실행  
2. 연습실 → 새 세션 → 트랙 녹음  
3. Table Editor `practice_tracks` + Storage `media/practice/…` 확인  
4. 나갔다 다시 입장 / 새로고침 후 트랙 유지 확인  

## Step F — Realtime 채팅

### Apply migration

SQL Editor에서 실행:

```
supabase/migrations/20260719400000_chat_realtime.sql
```

`chat_messages` 테이블 INSERT를 Realtime으로 구독합니다.

### App behavior

- 로그인 후 **내 팀 · 팔로우 팀** 채팅방 메시지가 **새로고침 없이** 반영됩니다.
- 팀 채팅 + 크로스팀 DM 모두 지원
- 본인이 보낸 메시지는 Realtime·API 응답 중복을 자동으로 걸러냅니다.

### 테스트

1. 브라우저 두 개(또는 시크릿)에서 **다른 계정**으로 로그인  
2. 같은 팀에 가입하거나, 팀 간 DM 스레드 열기  
3. 한쪽에서 메시지 전송 → 다른 쪽 **새로고침 없이** 표시되는지 확인  

Dashboard → **Database → Publications** 에 `chat_messages`가 `supabase_realtime`에 포함되어 있어야 합니다.

## Step E — Storage (미디어 업로드)

### Apply storage migration

SQL Editor에서 실행:

```
supabase/migrations/20260719300000_storage_media.sql
```

- **`media`** public bucket (최대 50MB/파일)
- 경로: `posts|stories|audio|chat|teams/{teamId}/…`, `profiles/{userId}/…`
- 팀 미디어: 팀 멤버만 업로드 · 프로필: 본인만

### App behavior

Supabase 로그인 시 업로드 파일은 **data URL 대신 Storage URL**로 DB에 저장됩니다.

| 화면 | Storage 경로 |
|------|----------------|
| 피드 업로드 | `posts/{teamId}/` |
| 스토리 | `stories/{teamId}/` |
| 사운드 · 커버 | `audio/{teamId}/` |
| 연습실 레이어 | `practice/{teamId}/{sessionId}/` |
| 채팅 미디어 | `chat/{teamId}/` |
| 프로필/팀 사진 | `profiles/{userId}/`, `teams/{teamId}/` |

로컬 데모(Supabase 미설정)는 기존처럼 data URL을 사용합니다.

게시물·사운드 **삭제 시** Storage에 올린 파일도 함께 지웁니다(이미 삭제된 DB row는 Storage에만 남을 수 있음).

Dashboard → **Storage**에서 `media` 버킷과 업로드된 파일을 확인할 수 있습니다.

## Step H — 추가 마이그레이션 (연습실 · 세션)

SQL Editor에서 **순서대로** 실행:

```
20260719600000_practice_track_sync.sql    # 트랙 작성자 · 싱크 오프셋
20260719700000_practice_track_volume.sql  # 볼륨 (뮤트 대체)
20260719810000_practice_session_author.sql # 세션 작성자 · 삭제 권한
```

## Step I — 프로덕션 배포

### Vercel 환경 변수

| Variable | 설명 |
|----------|------|
| `VITE_SUPABASE_URL` | Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public key |
| `VITE_KAKAO_MAP_APP_KEY` | (선택) 일정 장소 검색 |

### Supabase Auth URL (배포 후 필수)

**Authentication → URL Configuration**

- **Site URL**: `https://YOUR-APP.vercel.app`
- **Redirect URLs**:  
  - `https://YOUR-APP.vercel.app/**`  
  - `http://localhost:5173/**`

이메일 확인 링크·OAuth 리다이렉트가 배포 URL로 돌아오려면 위 설정이 필요합니다.

### Realtime · Storage 확인

- **Database → Publications**: `chat_messages`가 Realtime에 포함
- **Storage**: `media` 버킷 public, RLS 정책 적용됨

### 배포 후 체크리스트

- [ ] 로그인 / 회원가입
- [ ] 팀 생성 · 초대 코드 가입
- [ ] 피드 업로드 (Storage `posts/`)
- [ ] 연습실 녹음 → 새로고침 후 트랙 유지
- [ ] 채팅 Realtime (탭 두 개)
- [ ] 팀 나가기 → TeamGate 표시
