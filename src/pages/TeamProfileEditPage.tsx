import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SquareImageCropSheet } from '../features/media/SquareImageCropSheet';
import { useApp } from '../state/AppContext';
import { ensurePublishedImageUrl } from '../utils/mediaUpload';
import './MyPage.css';
import './ProfileEditPage.css';

export function TeamProfileEditPage() {
  const { activeTeam, updateTeamProfile } = useApp();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bio, setBio] = useState(activeTeam?.bio ?? '');
  const [genre, setGenre] = useState(activeTeam?.genre ?? '');
  const [cover, setCover] = useState(activeTeam?.cover ?? '');
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!activeTeam) return null;

  const onCoverSelected = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
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
      updateTeamProfile(activeTeam.id, {
        cover: publishedCover,
        bio: bio.trim() || activeTeam.bio,
        genre: genre.trim() || activeTeam.genre,
      });
      navigate('/my');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했어요.');
      setSaving(false);
    }
  };

  return (
    <div className="page profile-edit-page">
      <Link to="/my" className="settings-back">
        ← 우리 팀 피드
      </Link>
      <h1 className="page-title">프로필 수정</h1>
      <p className="page-sub">{activeTeam.name} 팀의 프로필 사진, 장르, 소개를 바꿀 수 있어요.</p>

      <div className="profile-edit-cover">
        <img src={cover} alt="" />
        <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
          프로필 사진 변경
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
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
        <label>팀 소개</label>
        <textarea
          rows={5}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="팀 소개, 연습 일정, 음악 스타일…"
          maxLength={200}
        />
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
  );
}
