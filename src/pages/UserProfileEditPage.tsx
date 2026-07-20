import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SquareImageCropSheet } from '../features/media/SquareImageCropSheet';
import { useApp } from '../state/AppContext';
import { isLikelyImageFile } from '../utils/prepareProfileImageFile';
import { ensurePublishedImageUrl } from '../utils/mediaUpload';
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

export function UserProfileEditPage() {
  const { user, activeTeam, updateUserProfile } = useApp();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState(user.avatar);
  const [bio, setBio] = useState(user.bio ?? '');
  const [instagram, setInstagram] = useState(user.instagram ?? '');
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const onAvatarSelected = (file: File | undefined) => {
    if (!file) return;
    if (!isLikelyImageFile(file)) {
      setError('사진 파일만 선택할 수 있어요.');
      return;
    }
    setError('');
    // File picker close can trigger a ghost click that instantly dismisses the crop sheet.
    window.setTimeout(() => setCropFile(file), 100);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('이름을 입력해주세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const publishedAvatar = await ensurePublishedImageUrl(avatar, 'profiles', user.id);
      await updateUserProfile({
        name: trimmed,
        avatar: publishedAvatar,
        bio,
        instagram: normalizeInstagramUsername(instagram),
      });
    } catch (err) {
      setError(readSaveError(err));
      setSaving(false);
      return;
    }
    navigate('/my/settings');
  };

  return (
    <div className="page profile-edit-page">
      <Link to="/my/settings" className="settings-back">
        ← 팀 설정
      </Link>
      <h1 className="page-title">내 프로필</h1>
      <p className="page-sub">
        {activeTeam ? `${activeTeam.name}에서 보이는 내 이름, 사진, 소개예요.` : '내 이름, 프로필 사진, 자기소개를 수정해요.'}
      </p>

      <div className="profile-edit-avatar">
        <ProfileAvatar src={avatar} className="profile-edit-avatar-img" />
        <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
          프로필 사진 변경
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="profile-edit-file"
          onChange={(e) => {
            void onAvatarSelected(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <div className="field">
        <label>이름</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="활동 이름"
          maxLength={20}
        />
      </div>

      <div className="field">
        <label htmlFor="user-instagram">인스타그램</label>
        <input
          id="user-instagram"
          value={instagram}
          onChange={(e) => setInstagram(normalizeInstagramUsername(e.target.value))}
          placeholder="my_band_id"
          maxLength={30}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <p className="profile-edit-hint">@ 없이 적어도 돼요. 프로필에서 탭하면 인스타그램으로 이동해요.</p>
      </div>

      <div className="field">
        <label>자기소개</label>
        <textarea
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="포지션, 좋아하는 장르, 연습 가능 시간…"
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
            setAvatar(dataUrl);
            setCropFile(null);
          }}
          onClose={() => setCropFile(null)}
        />
      ) : null}
    </div>
  );
}
