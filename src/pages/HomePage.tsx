import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useApp } from '../state/AppContext';
import { subscribeHomeRefresh } from '../utils/homeRefresh';

import type { HomeFeedItem } from '../utils/homeFeedRanking';
import {
  buildHomeFeedItems,
  rankHomeFeedItems,
} from '../utils/homeFeedRanking';
import { feedSeenKey, loadFeedSeen, markFeedItemSeen } from '../utils/feedSeenStorage';

import { StoryRail } from '../features/feed/StoryRail';

import { StoryViewer } from '../features/feed/StoryViewer';

import { FeedCard } from '../features/feed/FeedCard';

import { AudioFeedCard } from '../features/feed/AudioFeedCard';

import { FeedSeenMarker } from '../features/feed/FeedSeenMarker';

import { SoundDetailSheet } from '../features/feed/SoundDetailSheet';
import { TeamSearchSheet } from '../features/feed/TeamSearchSheet';

export function HomePage() {
  const { posts, teamAudios, followingIds, myTeamIds, activeTeamId, activeTeam, refreshAppData } = useApp();
  const location = useLocation();
  const [storyId, setStoryId] = useState<string | null>(null);
  const [pinnedFeedTeamIds, setPinnedFeedTeamIds] = useState<string[]>([]);
  const [openSoundId, setOpenSoundId] = useState<string | null>(null);
  const [teamSearchOpen, setTeamSearchOpen] = useState(false);
  const [feedRankEpoch, setFeedRankEpoch] = useState(() => Date.now());
  const seenSnapshotRef = useRef(loadFeedSeen());
  const prevPathRef = useRef(location.pathname);

  const pinTeamInFeed = useCallback((teamId: string) => {
    setPinnedFeedTeamIds((prev) => (prev.includes(teamId) ? prev : [...prev, teamId]));
  }, []);

  const refreshFeedOrder = useCallback(() => {
    seenSnapshotRef.current = loadFeedSeen();
    setFeedRankEpoch(Date.now());
  }, []);

  const refreshHomeContent = useCallback(async () => {
    await refreshAppData();
    refreshFeedOrder();
  }, [refreshAppData, refreshFeedOrder]);

  useEffect(() => {
    return subscribeHomeRefresh(refreshHomeContent);
  }, [refreshHomeContent]);

  useEffect(() => {
    if (location.pathname === '/' && prevPathRef.current !== '/') {
      void refreshHomeContent();
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname, refreshHomeContent]);

  const postsRef = useRef(posts);
  const teamAudiosRef = useRef(teamAudios);
  postsRef.current = posts;
  teamAudiosRef.current = teamAudios;

  const feedItemKeys = useMemo(
    () =>
      [
        ...posts.map((p) => `post:${p.id}`),
        ...teamAudios.map((a) => `audio:${a.id}`),
      ].join('\0'),
    [posts, teamAudios],
  );

  const [feedOrder, setFeedOrder] = useState<string[]>([]);

  useEffect(() => {
    const items = buildHomeFeedItems(postsRef.current, teamAudiosRef.current);
    const ranked = rankHomeFeedItems(items, {
      followingIds,
      myTeamIds,
      activeTeamId,
      pinnedTeamIds: pinnedFeedTeamIds,
      seen: seenSnapshotRef.current,
      now: feedRankEpoch,
    });
    setFeedOrder(ranked.map((item) => `${item.kind}:${item.id}`));
  }, [
    feedItemKeys,
    followingIds,
    myTeamIds,
    activeTeamId,
    pinnedFeedTeamIds,
    feedRankEpoch,
  ]);

  const feed = useMemo(() => {
    const byKey = new Map<string, HomeFeedItem>();
    for (const item of buildHomeFeedItems(posts, teamAudios)) {
      byKey.set(`${item.kind}:${item.id}`, item);
    }

    const ordered: HomeFeedItem[] = [];
    const placed = new Set<string>();
    for (const key of feedOrder) {
      const item = byKey.get(key);
      if (!item) continue;
      ordered.push(item);
      placed.add(key);
    }
    for (const item of byKey.values()) {
      const key = `${item.kind}:${item.id}`;
      if (!placed.has(key)) ordered.push(item);
    }
    return ordered;
  }, [feedOrder, posts, teamAudios]);

  const handleFeedItemSeen = useCallback((key: string) => {
    markFeedItemSeen(key);
  }, []);

  return (
    <div className="page">
      <header className="home-head">
        <h1 className="page-title">BandCrew</h1>
        <button
          type="button"
          className="home-head-search"
          aria-label="팀 검색"
          onClick={() => setTeamSearchOpen(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16.5 16.5L21 21" />
          </svg>
        </button>
        <span className="home-team">{activeTeam?.name}</span>
      </header>

      <p className="page-sub">팔로우 · 추천 밴드 소식</p>

      <StoryRail onOpen={setStoryId} />

      {feed.map((item) => (
        <HomeFeedRow
          key={`${item.kind}:${item.id}`}
          item={item}
          onPinTeam={pinTeamInFeed}
          onOpenSound={setOpenSoundId}
          onSeen={handleFeedItemSeen}
        />
      ))}

      {feed.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-faint)' }}>
          아직 피드가 비어 있어요. 다른 팀을 팔로우하거나 업로드해보세요.
        </div>
      )}

      {storyId && <StoryViewer storyId={storyId} onClose={() => setStoryId(null)} />}

      {openSoundId && (
        <SoundDetailSheet trackId={openSoundId} onClose={() => setOpenSoundId(null)} />
      )}

      {teamSearchOpen ? <TeamSearchSheet onClose={() => setTeamSearchOpen(false)} /> : null}
    </div>
  );
}

function HomeFeedRow({
  item,
  onPinTeam,
  onOpenSound,
  onSeen,
}: {
  item: HomeFeedItem;
  onPinTeam: (teamId: string) => void;
  onOpenSound: (trackId: string) => void;
  onSeen: (key: string) => void;
}) {
  const seenKey = feedSeenKey(item.kind, item.id);

  return (
    <div className="home-feed-row">
      {item.kind === 'post' ? (
        <FeedCard post={item.post} onUnfollowFromFeed={onPinTeam} />
      ) : (
        <AudioFeedCard
          track={item.track}
          onOpen={() => onOpenSound(item.track.id)}
          onUnfollowFromFeed={onPinTeam}
        />
      )}
      <FeedSeenMarker itemKey={seenKey} onSeen={onSeen} />
    </div>
  );
}
