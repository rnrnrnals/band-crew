import { useState } from 'react';
import { useAuth } from '../../state/AuthContext';
import './AuthGate.css';

export function AuthGate() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      setMsg('이메일과 비밀번호를 입력해주세요.');
      return;
    }

    if (mode === 'signup') {
      if (!passwordConfirm) {
        setMsg('비밀번호 확인을 입력해주세요.');
        return;
      }
      if (password !== passwordConfirm) {
        setMsg('비밀번호가 서로 다릅니다. 같은 비밀번호를 다시 입력해 주세요.');
        return;
      }
    }

    setBusy(true);
    setMsg('');

    const result =
      mode === 'login'
        ? await signIn(email, password)
        : await signUp(email, password, displayName);

    setBusy(false);
    setMsg(result.message);

    if (result.ok && mode === 'signup' && result.message.includes('이메일 확인')) {
      setMode('login');
    }
  };

  return (
    <div className="auth-gate page">
      <div className="gate-brand">BandCrew</div>
      <h1 className="page-title">{mode === 'login' ? '로그인' : '회원가입'}</h1>
      <p className="page-sub">
        팀 피드·업로드·채팅을 쓰려면 계정이 필요해요.
      </p>

      <div className="gate-tabs">
        <button
          type="button"
          className={mode === 'login' ? 'on' : ''}
          onClick={() => {
            setMode('login');
            setPasswordConfirm('');
            setMsg('');
          }}
        >
          로그인
        </button>
        <button
          type="button"
          className={mode === 'signup' ? 'on' : ''}
          onClick={() => {
            setMode('signup');
            setMsg('');
          }}
        >
          회원가입
        </button>
      </div>

      {mode === 'signup' ? (
        <div className="field">
          <label>이름</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="표시 이름"
            autoComplete="name"
          />
        </div>
      ) : null}

      <div className="field">
        <label>이메일</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </div>

      <div className="field">
        <label>비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'signup' ? '6자 이상' : '비밀번호'}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        />
      </div>

      {mode === 'signup' ? (
        <div className="field">
          <label>비밀번호 확인</label>
          <input
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder="비밀번호 다시 입력"
            autoComplete="new-password"
          />
        </div>
      ) : null}

      {msg ? <p className={`auth-gate-msg${msg.includes('완료') || msg.includes('로그인했') ? ' is-ok' : ''}`}>{msg}</p> : null}

      <button type="button" className="btn btn-primary gate-submit" disabled={busy} onClick={() => void submit()}>
        {busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입하기'}
      </button>
    </div>
  );
}
