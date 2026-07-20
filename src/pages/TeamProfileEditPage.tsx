import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SquareImageCropSheet } from '../features/media/SquareImageCropSheet';
import { useApp } from '../state/AppContext';
import { LeaderGate } from '../features/team/LeaderGate';
import { isLikelyImageFile } from '../utils/prepareProfileImageFile';
import { ensurePublishedImageUrl } from '../utils/mediaUpload';
import { clampTeamBio, normalizeTeamBio, TEAM_BIO_MAX_CHARS, TEAM_BIO_MAX_LINES } from '../utils/teamBio';
import { normalizeInstagramUsername } from '../utils/teamInstagram';
import { ProfileAvatar } from '../components/ProfileAvatar';
import './MyPage.css';
import './ProfileEditPage.css';

function readSaveError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    const message = err.message.trim();
    if (message) return message;
  }
  return '저장하지 못했어요.';
}

export function TeamProfileEditPage() {
  const { activeTeam, updateTeamProfile } = useApp();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bio, setBio] = useState(() => clampTeamBio(activeTeam?.bio ?? ''));
  const [genre, setGenre] = useState(activeTeam?.genre ?? '');
  const [instagram, setInstagram] = useState(activeTeam?.instagram ?? '');
  const [cover, setCover] = useState(activeTeam?.cover ?? '');
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!activeTeam) return null;

  const onCoverSelected = (file: File | undefined) => {
    if (!file) return;
    if (!isLikelyImageFile(file)) {
      setError('사진 파일만 선택할 수 있어요.');
      return;
    }
    setError('');
    window.setTimeout(() => setCropFile(file), 100);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const publishedCover = await ensurePublishedImageUrl(cover, 'teams', activeTeam.id);
      await updateTeamProfile(activeTeam.id, {
        cover: publishedCover,
        bio: normalizeTeamBio(bio) || activeTeam.bio,
        genre: genre.trim() || activeTeam.genre,
        instagram: normalizeInstagramUsername(instagram),
      });
    } catch (err) {
      setError(readSaveError(err));
      setSaving(false);
      return;
    }
    navigate('/my');
  };

  return (
    <LeaderGate>
    <div className="page profile-edit-page">
      <Link to="/my" className="settings-back">
        ← 우리 팀 피드
      </Link>
      <h1 className="page-title">프로필 수정</h1>
      <p className="page-sub">{activeTeam.name} 팀의 프로필 사진, 장르, 인스타그램, 소개를 바꿀 수 있어요.</p>

      <div className="profile-edit-cover">
        <ProfileAvatar src={cover} className="profile-edit-cover-img" />
        <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
          프로필 사진 변경
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="profile-edit-file"
          onChange={(e) => {
            void onCoverSelected(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <div className="field">
        <label>장르</label>
        <input
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          placeholder="예: 인디 / 록"
          maxLength={30}
        />
      </div>

      <div className="field">
        <label htmlFor="team-instagram">인스타그램</label>
        <input
          id="team-instagram"
          value={instagram}
          onChange={(e) => setInstagram(normalizeInstagramUsername(e.target.value))}
          placeholder="band_crew"
          maxLength={30}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <p className="profile-edit-hint">@ 없이 적어도 돼요. 피드에서 탭하면 인스타그램으로 이동해요.</p>
      </div>

      <div className="field">
        <div className="profile-edit-field-head">
          <label htmlFor="team-bio">팀 소개</label>
          <span className="profile-edit-counter">
            {bio.length}/{TEAM_BIO_MAX_CHARS}
          </span>
        </div>
        <textarea
          id="team-bio"
          rows={TEAM_BIO_MAX_LINES}
          value={bio}
          onChange={(e) => setBio(clampTeamBio(e.target.value))}
          placeholder="팀 소개, 연습 일정, 음악 스타일…"
          maxLength={TEAM_BIO_MAX_CHARS}
        />
        <p className="profile-edit-hint">최대 {TEAM_BIO_MAX_LINES}줄 · {TEAM_BIO_MAX_CHARS}자</p>
      </div>

      {error && <p className="profile-edit-error">{error}</p>}

      <button type="button" className="btn btn-primary profile-edit-save" disabled={saving} onClick={save}>
        {saving ? '저장 중…' : '저장'}
      </button>

      {cropFile ? (
        <SquareImageCropSheet
          file={cropFile}
          heading="프로필 사진 자르기"
          onConfirm={(dataUrl) => {
            setCover(dataUrl);
            setCropFile(null);
          }}
          onClose={() => setCropFile(null)}
        />
      ) : null}
    </div>
    </LeaderGate>
  );
}
