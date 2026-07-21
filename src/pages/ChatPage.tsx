import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { BandTeam, ChatMessage } from '../types';
import { useApp } from '../state/AppContext';
import { useAuth } from '../state/AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { findCurrentMember, getMemberAvatar } from '../mock/memberUtils';
import { getCrossTeamThreadId, isOwnChatMessage } from '../utils/chatUtils';
import { prepareMediaBlob, getVideoDuration, videoNeedsTrim, MAX_VIDEO_DURATION_SEC } from '../utils/fileMedia';
import { canvasToImageBlob } from '../utils/imageOutput';
import { ensurePublishedMedia } from '../utils/mediaUpload';
import { VideoTrimSheet } from '../features/media/VideoTrimSheet';
import { ChatShareCard } from '../features/chat/ChatShareCard';
import { ChatMessageBubble } from '../features/chat/ChatMessageBubble';
import { PostDetailSheet } from '../features/feed/PostDetailSheet';
import { SoundDetailSheet } from '../features/feed/SoundDetailSheet';
import { parseShareMessage, type SharedContent } from '../utils/contentShare';
import { ProfileAvatar } from '../components/ProfileAvatar';
import './MyPage.css';
import './ChatPage.css';

interface PendingVoice {
  blob: Blob;
  previewUrl: string;
}

interface PendingCapture {
  kind: 'image' | 'video';
  blob: Blob;
  previewUrl: string;
}

interface CaptureMode {
  kind: 'image' | 'video';
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function messageKind(message: ChatMessage) {
  return message.kind ?? (message.mediaUrl ? 'image' : 'text');
}

function IconPhoto() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M3 16l4.5-4.5 3.5 3.5 2.5-2.5L21 16" />
    </svg>
  );
}

function IconVideo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3v-4z" />
    </svg>
  );
}

function IconMic() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8h3l2-2h6l2 2h3v10H4V8z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8h6l2 2h8v9H4V8z" />
    </svg>
  );
}

function IconTeamChats() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9h7a2 2 0 0 1 2 2v4l2 2H8a2 2 0 0 1-2-2V9z" />
      <path d="M13 7h6a2 2 0 0 1 2 2v3l2 2h-6a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

type MediaPickerKind = 'image' | 'video';

function ChatBubbleContent({
  message,
  onOpenShare,
}: {
  message: ChatMessage;
  onOpenShare: (content: SharedContent) => void;
}) {
  const kind = messageKind(message);
  const shared = kind === 'text' ? parseShareMessage(message.text) : null;

  if (shared) {
    return (
      <div className="chat-bubble-share">
        <ChatShareCard content={shared} onOpen={onOpenShare} />
      </div>
    );
  }

  if (kind === 'image' && message.mediaUrl) {
    return (
      <div className="chat-bubble-media">
        <img src={message.mediaUrl} alt="" />
        {message.text && <p>{message.text}</p>}
      </div>
    );
  }

  if (kind === 'video' && message.mediaUrl) {
    return (
      <div className="chat-bubble-media">
        <video src={message.mediaUrl} controls playsInline preload="metadata" />
        {message.text && <p>{message.text}</p>}
      </div>
    );
  }

  if (kind === 'audio' && message.mediaUrl) {
    return (
      <div className="chat-bubble-media">
        <audio src={message.mediaUrl} controls preload="metadata" />
        {message.text ? <p>{message.text}</p> : <p className="chat-audio-label">음성 메시지</p>}
      </div>
    );
  }

  return <p>{message.text}</p>;
}

export function ChatPage() {
  return <ChatRoom />;
}

export function ExternalTeamChatPage() {
  const { teamId } = useParams();
  const { activeTeamId, getTeam } = useApp();
  const peerTeam = teamId ? getTeam(teamId) : undefined;

  if (!teamId || !peerTeam || teamId === activeTeamId) {
    return <Navigate to="/chat/teams" replace />;
  }

  return <ChatRoom peerTeamId={teamId} peerTeam={peerTeam} />;
}

interface ChatRoomProps {
  peerTeamId?: string;
  peerTeam?: BandTeam;
}

function ChatRoom({ peerTeamId, peerTeam }: ChatRoomProps) {
  const { session: authSession } = useAuth();
  const userId = authSession?.user.id;
  const {
    activeTeam,
    chatMessages,
    sendChatMessage,
    updateChatMessage,
    deleteChatMessage,
    user,
    posts,
    teamAudios,
    canManageTeam,
  } = useApp();
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [openSoundId, setOpenSoundId] = useState<string | null>(null);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [mediaPicker, setMediaPicker] = useState<MediaPickerKind | null>(null);
  const [recording, setRecording] = useState(false);
  const [pendingVoice, setPendingVoice] = useState<PendingVoice | null>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null);
  const [captureRecording, setCaptureRecording] = useState(false);
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(null);
  const [trimVideo, setTrimVideo] = useState<{ file: Blob; fileName?: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);
  const captureRecorderRef = useRef<MediaRecorder | null>(null);
  const captureChunksRef = useRef<Blob[]>([]);
  const captureTimerRef = useRef<number | null>(null);
  const trimAfterRef = useRef<'send' | 'preview'>('send');
  const pendingVoiceRef = useRef<PendingVoice | null>(null);
  const pendingCaptureRef = useRef<PendingCapture | null>(null);
  pendingVoiceRef.current = pendingVoice;
  pendingCaptureRef.current = pendingCapture;

  const threadId =
    peerTeamId && activeTeam ? getCrossTeamThreadId(activeTeam.id, peerTeamId) : null;

  const postMessage = (payload: Parameters<typeof sendChatMessage>[0]) => {
    sendChatMessage(payload, peerTeamId ? { peerTeamId } : undefined);
  };

  const messages = useMemo(() => {
    if (!activeTeam) return [];
    if (threadId) {
      return chatMessages
        .filter((m) => m.chatThreadId === threadId)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    }
    return chatMessages
      .filter((m) => m.teamId === activeTeam.id && !m.chatThreadId)
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  }, [chatMessages, activeTeam, threadId]);

  const myMember = activeTeam ? findCurrentMember(activeTeam, user) : undefined;
  const myNick = myMember?.nick ?? user.name;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    const video = cameraPreviewRef.current;
    const stream = cameraStreamRef.current;
    if (!captureMode || !video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {});
  }, [captureMode]);

  useEffect(
    () => () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      captureRecorderRef.current?.stop();
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (pendingVoiceRef.current) URL.revokeObjectURL(pendingVoiceRef.current.previewUrl);
      if (pendingCaptureRef.current) URL.revokeObjectURL(pendingCaptureRef.current.previewUrl);
    },
    [],
  );

  const discardPendingVoice = () => {
    if (pendingVoice) URL.revokeObjectURL(pendingVoice.previewUrl);
    setPendingVoice(null);
  };

  const discardPendingCapture = () => {
    if (pendingCapture) URL.revokeObjectURL(pendingCapture.previewUrl);
    setPendingCapture(null);
  };

  const stopRecordingStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  };

  const stopCameraStream = () => {
    if (captureTimerRef.current) {
      window.clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (captureRecorderRef.current && captureRecorderRef.current.state !== 'inactive') {
      captureRecorderRef.current.stop();
    }
    captureRecorderRef.current = null;
    captureChunksRef.current = [];
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCaptureRecording(false);
  };

  const closeCapture = () => {
    stopCameraStream();
    setCaptureMode(null);
  };

  const setPendingVideoCapture = (blob: Blob) => {
    void prepareMediaBlob(blob, 'video')
      .then((prepared) => {
        setPendingCapture({
          kind: 'video',
          blob: prepared,
          previewUrl: URL.createObjectURL(prepared),
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '영상을 처리하지 못했어요.');
      });
  };

  const openTrimSheet = (file: Blob, fileName: string | undefined, after: 'send' | 'preview') => {
    trimAfterRef.current = after;
    setAttachOpen(false);
    setMediaPicker(null);
    setTrimVideo({ file, fileName });
  };

  const handleTrimConfirm = (trimmed: Blob) => {
    const after = trimAfterRef.current;
    setTrimVideo(null);
    if (after === 'send') {
      void sendMediaBlob(trimmed, 'video');
    } else {
      setPendingVideoCapture(trimmed);
    }
  };

  const maybeTrimVideo = async (
    blob: Blob,
    fileName: string | undefined,
    after: 'send' | 'preview',
  ): Promise<boolean> => {
    const url = URL.createObjectURL(blob);
    try {
      const duration = await getVideoDuration(url);
      if (videoNeedsTrim(duration)) {
        openTrimSheet(blob, fileName, after);
        return true;
      }
    } finally {
      URL.revokeObjectURL(url);
    }
    return false;
  };

  const sendMediaBlob = async (blob: Blob, kind: 'image' | 'video') => {
    if (!activeTeam) return;
    setAttachOpen(false);
    setMediaPicker(null);
    setSendingMedia(true);
    setError('');
    try {
      const mediaUrl = await ensurePublishedMedia(blob, 'chat', activeTeam.id);
      postMessage({ kind, mediaUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : '보내지 못했어요. 다시 시도해주세요.');
    } finally {
      setSendingMedia(false);
    }
  };

  const sendMediaFile = async (file: File, kind: 'image' | 'video') => {
    if (kind === 'image') {
      if (!file.type.startsWith('image/')) {
        setError('사진 파일만 보낼 수 있어요.');
        return;
      }
    } else if (!file.type.startsWith('video/')) {
      setError('영상 파일만 보낼 수 있어요.');
      return;
    }
    await sendMediaBlob(file, kind);
  };

  const openCapture = async (kind: 'image' | 'video') => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('이 브라우저에서는 카메라를 지원하지 않아요.');
      return;
    }

    setAttachOpen(false);
    setMediaPicker(null);
    setError('');
    discardPendingCapture();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: kind === 'video',
      });
      cameraStreamRef.current = stream;
      setCaptureMode({ kind });
    } catch {
      setError('카메라 권한이 필요해요.');
      stopCameraStream();
    }
  };

  const takePhoto = () => {
    const video = cameraPreviewRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    void canvasToImageBlob(canvas, 0.9)
      .then((blob) => {
        if (!blob) return;
        closeCapture();
        void prepareMediaBlob(blob, 'image')
          .then((prepared) => {
            setPendingCapture({
              kind: 'image',
              blob: prepared,
              previewUrl: URL.createObjectURL(prepared),
            });
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : '사진을 처리하지 못했어요.');
          });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '사진을 처리하지 못했어요.');
      });
  };

  const startVideoCapture = () => {
    const stream = cameraStreamRef.current;
    if (!stream || captureRecording) return;

    captureChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    captureRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) captureChunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      setCaptureRecording(false);
      if (captureTimerRef.current) {
        window.clearTimeout(captureTimerRef.current);
        captureTimerRef.current = null;
      }
      const blob = new Blob(captureChunksRef.current, {
        type: recorder.mimeType || 'video/webm',
      });
      stopCameraStream();
      setCaptureMode(null);

      if (blob.size === 0) return;
      void maybeTrimVideo(blob, undefined, 'preview').then((needsTrim) => {
        if (!needsTrim) setPendingVideoCapture(blob);
      });
    };

    recorder.start();
    setCaptureRecording(true);
    captureTimerRef.current = window.setTimeout(() => {
      finishVideoCapture();
    }, MAX_VIDEO_DURATION_SEC * 1000);
  };

  const finishVideoCapture = () => {
    if (captureRecorderRef.current && captureRecorderRef.current.state !== 'inactive') {
      captureRecorderRef.current.stop();
    }
  };

  const sendPendingCapture = async () => {
    if (!pendingCapture) return;
    setSendingMedia(true);
    setError('');
    try {
      await sendMediaBlob(pendingCapture.blob, pendingCapture.kind);
      discardPendingCapture();
    } finally {
      setSendingMedia(false);
    }
  };

  const finishRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  const startVoiceRecord = async () => {
    if (recording || pendingVoice || captureMode) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('이 브라우저에서는 녹음을 지원하지 않아요.');
      return;
    }

    setAttachOpen(false);
    setError('');
    discardPendingVoice();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stopRecordingStream();

        if (blob.size === 0) return;
        void prepareMediaBlob(blob, 'audio')
          .then((prepared) => {
            setPendingVoice({
              blob: prepared,
              previewUrl: URL.createObjectURL(prepared),
            });
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : '녹음을 처리하지 못했어요.');
          });
      };

      recorder.start();
      setRecording(true);
    } catch {
      setError('마이크 권한이 필요해요.');
      stopRecordingStream();
      setRecording(false);
    }
  };

  const sendPendingVoice = async () => {
    if (!pendingVoice || !activeTeam) return;
    setSendingMedia(true);
    setError('');
    try {
      const mediaUrl = await ensurePublishedMedia(pendingVoice.blob, 'chat', activeTeam.id);
      postMessage({ kind: 'audio', mediaUrl });
      discardPendingVoice();
    } catch {
      setError('녹음을 보내지 못했어요.');
    } finally {
      setSendingMedia(false);
    }
  };

  const toggleAttach = () => {
    setAttachOpen((open) => {
      if (open) setMediaPicker(null);
      return !open;
    });
  };

  const handleMediaInput = (file: File | undefined, kind: MediaPickerKind) => {
    if (!file) return;
    if (kind === 'video') {
      void maybeTrimVideo(file, file.name, 'send').then((needsTrim) => {
        if (!needsTrim) void sendMediaFile(file, kind);
      });
      return;
    }
    void sendMediaFile(file, kind);
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    postMessage({ kind: 'text', text: trimmed });
    setText('');
  };

  const openSharedContent = (content: SharedContent) => {
    setError('');
    if (content.type === 'post') {
      if (!content.postId || !posts.some((post) => post.id === content.postId)) {
        setError('게시물을 불러올 수 없어요.');
        return;
      }
      setOpenPostId(content.postId);
      return;
    }
    if (!content.trackId || !teamAudios.some((track) => track.id === content.trackId)) {
      setError('사운드를 불러올 수 없어요.');
      return;
    }
    setOpenSoundId(content.trackId);
  };

  const handleEditMessage = async (messageId: string, text: string) => {
    setError('');
    try {
      await updateChatMessage(messageId, text);
    } catch (err) {
      setError(err instanceof Error ? err.message : '메시지를 수정하지 못했어요.');
      throw err;
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!(await confirm('이 메시지를 삭제할까요?'))) return;
    setError('');
    try {
      await deleteChatMessage(messageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '메시지를 삭제하지 못했어요.');
    }
  };

  const openPost = openPostId ? posts.find((post) => post.id === openPostId) : undefined;
  const openTrack = openSoundId ? teamAudios.find((track) => track.id === openSoundId) : undefined;

  if (!activeTeam) return null;

  const composeLocked =
    recording || !!pendingVoice || !!pendingCapture || !!captureMode || sendingMedia || !!trimVideo;

  return (
    <div className="page chat-page">
      <header className="chat-head">
        <div className="chat-head-main">
          {peerTeam ? (
            <Link to="/chat/teams" className="settings-back chat-head-back">
              ← 다른 팀 대화
            </Link>
          ) : null}
          <h1 className="page-title">{peerTeam?.name ?? activeTeam.name}</h1>
          <p className="page-sub">
            {peerTeam
              ? `${activeTeam.name} ↔ ${peerTeam.name} · 팀 간 대화`
              : `팀 멤버 ${activeTeam.members.length}명 · 우리끼리만 보여요`}
          </p>
        </div>
        {!peerTeam ? (
          <Link to="/chat/teams" className="chat-head-action" aria-label="다른 팀과 대화">
            <IconTeamChats />
          </Link>
        ) : null}
      </header>

      <div className="chat-list">
        {messages.length === 0 ? (
          <p className="chat-empty">아직 대화가 없어요. 첫 메시지를 남겨보세요!</p>
        ) : (
          messages.map((m) => {
            const mine = peerTeamId ? m.teamId === activeTeam.id : m.authorNick === myNick;
            const avatar =
              m.authorAvatar ??
              (peerTeam && m.teamId === peerTeam.id
                ? peerTeam.cover
                : getMemberAvatar(
                    activeTeam.members.find((member) => member.nick === m.authorNick) ?? {
                      id: m.id,
                      nick: m.authorNick,
                      position: 'other',
                    },
                  ));
            const isMedia = !m.deletedAt && messageKind(m) !== 'text';
            const canManage = isOwnChatMessage(m, userId, myNick, activeTeam.id, peerTeamId);

            return (
              <div key={m.id} className={`chat-row ${mine ? 'mine' : 'theirs'}`}>
                {!mine && <ProfileAvatar src={avatar} className="chat-avatar" />}
                <div className="chat-bubble-wrap">
                  {!mine && (
                    <span className="chat-author">
                      {peerTeam && m.teamId === peerTeam.id ? peerTeam.name : m.authorNick}
                    </span>
                  )}
                  <ChatMessageBubble
                    message={m}
                    mine={mine}
                    canManage={canManage}
                    isMedia={isMedia}
                    timestamp={<time>{formatTime(m.createdAt)}</time>}
                    onEdit={handleEditMessage}
                    onDelete={handleDeleteMessage}
                  >
                    <div className={isMedia ? 'chat-bubble-media' : undefined}>
                      <ChatBubbleContent message={m} onOpenShare={openSharedContent} />
                    </div>
                  </ChatMessageBubble>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {captureMode && (
        <div className="chat-capture-overlay" role="dialog" aria-modal="true" aria-label="카메라">
          <video ref={cameraPreviewRef} className="chat-capture-preview" autoPlay playsInline muted />
          {captureRecording && (
            <div className="chat-capture-rec-indicator">
              <span className="chat-rec-dot" />
              녹화 중
            </div>
          )}
          <div className="chat-capture-actions">
            <button type="button" className="btn" onClick={closeCapture} disabled={captureRecording}>
              취소
            </button>
            {captureMode.kind === 'image' ? (
              <button type="button" className="btn btn-primary chat-capture-main" onClick={takePhoto}>
                촬영
              </button>
            ) : captureRecording ? (
              <button type="button" className="btn btn-primary chat-capture-main" onClick={finishVideoCapture}>
                완료
              </button>
            ) : (
              <button type="button" className="btn btn-primary chat-capture-main" onClick={startVideoCapture}>
                녹화
              </button>
            )}
          </div>
        </div>
      )}

      <div className="chat-footer">
        {error && <p className="chat-error">{error}</p>}

        {recording && (
          <div className="chat-recording-bar">
            <span className="chat-rec-dot" />
            <span>녹음 중…</span>
            <button type="button" className="btn chat-rec-stop" onClick={finishRecording}>
              완료
            </button>
          </div>
        )}

        {pendingVoice && !recording && (
          <div className="chat-voice-preview">
            <span className="chat-voice-label">녹음 미리듣기</span>
            <audio src={pendingVoice.previewUrl} controls preload="metadata" />
            <div className="chat-voice-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={sendingMedia}
                onClick={() => void sendPendingVoice()}
              >
                전송
              </button>
              <button type="button" className="btn" disabled={sendingMedia} onClick={discardPendingVoice}>
                삭제
              </button>
            </div>
          </div>
        )}

        {pendingCapture && !captureMode && (
          <div className="chat-voice-preview">
            <span className="chat-voice-label">
              {pendingCapture.kind === 'image' ? '사진 미리보기' : '영상 미리보기'}
            </span>
            {pendingCapture.kind === 'image' ? (
              <img src={pendingCapture.previewUrl} alt="" className="chat-capture-thumb" />
            ) : (
              <video src={pendingCapture.previewUrl} controls playsInline className="chat-capture-thumb" />
            )}
            <div className="chat-voice-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={sendingMedia}
                onClick={() => void sendPendingCapture()}
              >
                전송
              </button>
              <button type="button" className="btn" disabled={sendingMedia} onClick={discardPendingCapture}>
                삭제
              </button>
            </div>
          </div>
        )}

        {sendingMedia && <p className="chat-status">보내는 중…</p>}

        {attachOpen && !composeLocked && (
          <>
            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/*"
              className="chat-file-input"
              onChange={(e) => {
                handleMediaInput(e.target.files?.[0], 'image');
                e.target.value = '';
              }}
            />
            <input
              ref={videoFileInputRef}
              type="file"
              accept="video/*"
              className="chat-file-input"
              onChange={(e) => {
                handleMediaInput(e.target.files?.[0], 'video');
                e.target.value = '';
              }}
            />

            {mediaPicker ? (
              <div className="chat-media-picker">
                <button type="button" className="chat-media-back" onClick={() => setMediaPicker(null)}>
                  ← {mediaPicker === 'image' ? '사진' : '영상'}
                </button>
                <div className="chat-media-options">
                  <button
                    type="button"
                    className="chat-attach-item"
                    onClick={() => void openCapture(mediaPicker)}
                  >
                    <span className="chat-attach-icon">
                      <IconCamera />
                    </span>
                    <span>지금 찍기</span>
                  </button>
                  <button
                    type="button"
                    className="chat-attach-item"
                    onClick={() => {
                      if (mediaPicker === 'image') imageFileInputRef.current?.click();
                      else videoFileInputRef.current?.click();
                    }}
                  >
                    <span className="chat-attach-icon">
                      <IconFolder />
                    </span>
                    <span>업로드</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="chat-attach-menu">
                <button type="button" className="chat-attach-item" onClick={() => setMediaPicker('image')}>
                  <span className="chat-attach-icon">
                    <IconPhoto />
                  </span>
                  <span>사진</span>
                </button>
                <button type="button" className="chat-attach-item" onClick={() => setMediaPicker('video')}>
                  <span className="chat-attach-icon">
                    <IconVideo />
                  </span>
                  <span>영상</span>
                </button>
                <button type="button" className="chat-attach-item" onClick={() => void startVoiceRecord()}>
                  <span className="chat-attach-icon">
                    <IconMic />
                  </span>
                  <span>녹음</span>
                </button>
              </div>
            )}
          </>
        )}

        <form
          className="chat-compose"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <button
            type="button"
            className={`chat-plus ${attachOpen ? 'open' : ''}`}
            aria-label="첨부 메뉴"
            disabled={composeLocked}
            onClick={toggleAttach}
          >
            +
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="메시지 입력…"
            maxLength={500}
            disabled={composeLocked}
          />
          <button type="submit" className="btn btn-primary" disabled={!text.trim() || composeLocked}>
            전송
          </button>
        </form>
      </div>

      {trimVideo && (
        <VideoTrimSheet
          file={trimVideo.file}
          fileName={trimVideo.fileName}
          onClose={() => setTrimVideo(null)}
          onConfirm={handleTrimConfirm}
        />
      )}

      {openPostId && openPost ? (
        <PostDetailSheet
          postId={openPostId}
          canDelete={canManageTeam(openPost.teamId)}
          onClose={() => setOpenPostId(null)}
        />
      ) : null}

      {openSoundId && openTrack ? (
        <SoundDetailSheet
          trackId={openSoundId}
          canDelete={canManageTeam(openTrack.teamId)}
          onClose={() => setOpenSoundId(null)}
        />
      ) : null}
    </div>
  );
}
