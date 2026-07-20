import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BandTeam, Post } from '../../types';
import { useApp } from '../../state/AppContext';
import { FollowListSheet } from './FollowListSheet';
import { HighlightEditorSheet } from './HighlightEditorSheet';
import { HighlightRail } from './HighlightRail';
import { HighlightViewer } from './HighlightViewer';
import { MemberListSheet } from './MemberListSheet';
import { PostDetailSheet } from './PostDetailSheet';
import { StoryViewer } from './StoryViewer';
import { TeamAudioPanel, type MixedFeedItem } from './TeamAudioPanel';
import { SoundDetailSheet } from './SoundDetailSheet';
import './TeamFeedView.css';

type ListKind = 'followers' | 'following' | 'members';
type FeedTab = 'all' | 'media' | 'audio';
type EditorMode =
  | { kind: 'create' }
  | { kind: 'edit'; highlightId: string }
  | { kind: 'append'; highlightId: string }
  | null;

interface TeamFeedViewProps {
  team: BandTeam;
  variant: 'own' | 'other';
}

export function TeamFeedView({ team, variant }: TeamFeedViewProps) {
  const {
    posts,
    teamAudios,
    stories,
    highlights,
    followingIds,
    toggleFollow,
    getTeamFollowers,
    getTeamFollowing,
    addTeamAudio,
  } = useApp();
  const [openList, setOpenList] = useState<ListKind | null>(null);
  const [feedTab, setFeedTab] = useState<FeedTab>('all');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(null);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [viewHighlightId, setViewHighlightId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(null);

  const teamStories = useMemo(
    () =>
      stories
        .filter((s) => s.teamId === team.id)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [stories, team.id],
  );
  const firstStory = teamStories[0];
  const hasStories = teamStories.length > 0;

  const teamPosts = useMemo(
    () =>
      posts
        .filter((p) => p.teamId === team.id)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [posts, team.id],
  );

  const teamAudioTracks = useMemo(
    () =>
      teamAudios
        .filter((a) => a.teamId === team.id)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [teamAudios, team.id],
  );

  const mediaPosts = useMemo(
    () => teamPosts.filter((p) => p.mediaType === 'image' || p.mediaType === 'video'),
    [teamPosts],
  );

  const allFeedItems = useMemo<MixedFeedItem[]>(() => {
    const items: MixedFeedItem[] = [
      ...teamPosts.map((post) => ({
        kind: 'post' as const,
        id: post.id,
        createdAt: post.createdAt,
        post,
      })),
      ...teamAudioTracks.map((track) => ({
        kind: 'audio' as const,
        id: track.id,
        createdAt: track.createdAt,
        track,
      })),
    ];
    return items.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [teamPosts, teamAudioTracks]);

  const renderPostGrid = (items: Post[]) => {
    if (items.length === 0) return null;
    return (
      <div className="tf-grid">
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            className="tf-grid-cell"
            onClick={() => setSelectedPostId(p.id)}
            aria-label="게시물 보기"
          >
            {p.mediaType === 'video' && p.mediaUrl ? (
              <div className="tf-grid-video">
                <video src={p.mediaUrl} muted playsInline preload="metadata" />
                <span className="tf-grid-badge">▶</span>
              </div>
            ) : p.mediaType === 'image' && p.mediaUrl ? (
              <img src={p.mediaUrl} alt="" />
            ) : (
              <div className="tf-grid-text">
                <p>{p.caption}</p>
              </div>
            )}
          </button>
        ))}
      </div>
    );
  };

  const followers = getTeamFollowers(team.id);
  const following = getTeamFollowing(team.id);
  const isFollowing = followingIds.includes(team.id);

  const listTeams = openList === 'followers' ? followers : following;
  const listTitle = openList === 'followers' ? '팔로워' : '팔로잉';
  const showFollowSheet = openList === 'followers' || openList === 'following';
  const viewingHighlight = viewHighlightId
    ? highlights.find((h) => h.id === viewHighlightId)
    : undefined;
  const editingHighlight =
    editorMode && editorMode.kind !== 'create'
      ? highlights.find((h) => h.id === editorMode.highlightId)
      : undefined;

  return (
    <div className="page team-feed">
      <header className="tf-top">
        {variant === 'other' ? (
          <Link to="/" className="tf-back">
            ←
          </Link>
        ) : null}
        <h1 className="tf-username">{team.name}</h1>
        {variant === 'own' ? (
          <Link to="/my/settings" className="tf-settings" aria-label="팀 설정">
            ⚙
          </Link>
        ) : (
          <span className="tf-settings-spacer" />
        )}
      </header>

      <section className="tf-profile">
        {variant === 'own' ? (
          hasStories && firstStory ? (
            <div className="tf-avatar-mine-wrap">
              <button
                type="button"
                className="tf-avatar-wrap has-story"
                onClick={() => setStoryId(firstStory.id)}
                aria-label={`${team.name} 스토리 보기`}
              >
                <img src={team.cover} alt="" className="tf-avatar" />
                {teamStories.length > 1 && (
                  <span className="tf-story-count">{teamStories.length}</span>
                )}
              </button>
              <Link to="/story/upload" className="tf-story-add-plus" aria-label="스토리 추가">+</Link>
            </div>
          ) : (
            <Link to="/story/upload" className="tf-avatar-mine-wrap tf-avatar-upload-link" aria-label="스토리 올리기">
              <div className="tf-avatar-wrap">
                <img src={team.cover} alt="" className="tf-avatar" />
              </div>
              <span className="tf-story-add-plus">+</span>
            </Link>
          )
        ) : hasStories && firstStory ? (
          <button
            type="button"
            className="tf-avatar-wrap has-story"
            onClick={() => setStoryId(firstStory.id)}
            aria-label={`${team.name} 스토리 보기`}
          >
            <img src={team.cover} alt="" className="tf-avatar" />
          </button>
        ) : (
          <div className="tf-avatar-wrap">
            <img src={team.cover} alt="" className="tf-avatar" />
          </div>
        )}
        <div className="tf-stats">
          <div className="tf-stat">
            <strong>{teamPosts.length + teamAudioTracks.length}</strong>
            <span>전체</span>
          </div>
          <button type="button" className="tf-stat tf-stat-btn" onClick={() => setOpenList('followers')}>
            <strong>{followers.length}</strong>
            <span>팔로워</span>
          </button>
          <button type="button" className="tf-stat tf-stat-btn" onClick={() => setOpenList('following')}>
            <strong>{following.length}</strong>
            <span>팔로잉</span>
          </button>
        </div>
      </section>

      <div className="tf-meta">
        <p className="tf-genre">{team.genre}</p>
        <p className="tf-bio">{team.bio}</p>
      </div>

      <div className="tf-actions">
        {variant === 'own' ? (
          <>
            <Link to="/my/team-profile" className="btn tf-settings-btn">
              프로필 수정
            </Link>
            <Link to="/upload" className="btn btn-primary tf-upload-btn">
              새 게시물
            </Link>
          </>
        ) : (
          <>
            <button type="button" className="btn tf-members-btn" onClick={() => setOpenList('members')}>
              멤버 · {team.members.length}명
            </button>
            <button
              type="button"
              className={`btn tf-follow-btn ${isFollowing ? '' : 'btn-amber'}`}
              onClick={() => toggleFollow(team.id)}
            >
              {isFollowing ? '팔로잉' : '팔로우'}
            </button>
          </>
        )}
      </div>

      <HighlightRail
        teamId={team.id}
        canEdit={variant === 'own'}
        onOpen={setViewHighlightId}
        onCreate={() => setEditorMode({ kind: 'create' })}
        onAppend={(highlightId) => setEditorMode({ kind: 'append', highlightId })}
      />

      <div className="tf-tabs">
        <button
          type="button"
          className={`tf-tab${feedTab === 'all' ? ' active' : ''}`}
          onClick={() => setFeedTab('all')}
        >
          ▦ 전체
        </button>
        <button
          type="button"
          className={`tf-tab${feedTab === 'media' ? ' active' : ''}`}
          onClick={() => setFeedTab('media')}
        >
          ◫ 미디어
        </button>
        <button
          type="button"
          className={`tf-tab${feedTab === 'audio' ? ' active' : ''}`}
          onClick={() => setFeedTab('audio')}
        >
          〰 사운드
        </button>
      </div>

      {feedTab === 'all' && (
        <>
          {allFeedItems.length > 0 ? (
            <TeamAudioPanel
              tracks={teamAudioTracks}
              canUpload={false}
              onTrackOpen={setSelectedSoundId}
              mixedFeed={{
                items: allFeedItems,
                onPostOpen: setSelectedPostId,
              }}
            />
          ) : (
            <div className="tf-empty card">
              <p>아직 올린 콘텐츠가 없어요.</p>
              {variant === 'own' && (
                <Link to="/upload" className="btn btn-primary">
                  첫 게시물 올리기
                </Link>
              )}
            </div>
          )}
        </>
      )}

      {feedTab === 'media' && (
        <>
          {mediaPosts.length > 0 ? (
            renderPostGrid(mediaPosts)
          ) : (
            <div className="tf-empty card">
              <p>사진이나 영상 게시물이 없어요.</p>
              {variant === 'own' && (
                <Link to="/upload" className="btn btn-primary">
                  미디어 올리기
                </Link>
              )}
            </div>
          )}
        </>
      )}

      {feedTab === 'audio' && (
        <TeamAudioPanel
          tracks={teamAudioTracks}
          canUpload={variant === 'own'}
          onTrackOpen={setSelectedSoundId}
          onUpload={(input) =>
            addTeamAudio({
              teamId: team.id,
              title: input.title,
              audioUrl: input.audioUrl,
              durationSec: input.durationSec,
              caption: input.caption,
              body: input.body,
              coverImage: input.coverImage,
            })
          }
        />
      )}

      {showFollowSheet && (
        <FollowListSheet title={listTitle} teams={listTeams} onClose={() => setOpenList(null)} />
      )}
      {openList === 'members' && (
        <MemberListSheet team={team} onClose={() => setOpenList(null)} />
      )}
      {selectedPostId && (
        <PostDetailSheet
          postId={selectedPostId}
          canDelete={variant === 'own'}
          onClose={() => setSelectedPostId(null)}
        />
      )}
      {selectedSoundId && (
        <SoundDetailSheet
          trackId={selectedSoundId}
          canDelete={variant === 'own'}
          onClose={() => setSelectedSoundId(null)}
        />
      )}
      {storyId && (
        <StoryViewer storyId={storyId} scopeTeamId={team.id} onClose={() => setStoryId(null)} />
      )}
      {viewingHighlight && (
        <HighlightViewer
          highlight={viewingHighlight}
          team={team}
          canEdit={variant === 'own'}
          onClose={() => setViewHighlightId(null)}
          onEdit={() => {
            setViewHighlightId(null);
            setEditorMode({ kind: 'edit', highlightId: viewingHighlight.id });
          }}
          onAppend={() => {
            setViewHighlightId(null);
            setEditorMode({ kind: 'append', highlightId: viewingHighlight.id });
          }}
        />
      )}
      {editorMode && (
        <HighlightEditorSheet
          teamId={team.id}
          highlight={editorMode.kind === 'create' ? undefined : editingHighlight}
          mode={editorMode.kind}
          onClose={() => setEditorMode(null)}
        />
      )}
    </div>
  );
}
