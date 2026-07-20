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

export function HomePage() {
  const { posts, teamAudios, followingIds, myTeamIds, activeTeamId, activeTeam, refreshAppData } = useApp();
  const location = useLocation();
  const [storyId, setStoryId] = useState<string | null>(null);
  const [pinnedFeedTeamIds, setPinnedFeedTeamIds] = useState<string[]>([]);
  const [openSoundId, setOpenSoundId] = useState<string | null>(null);
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

  const allItems = useMemo(
    () => buildHomeFeedItems(posts, teamAudios),
    [posts, teamAudios],
  );

  const feed = useMemo(() => {
    return rankHomeFeedItems(allItems, {
      followingIds,
      myTeamIds,
      activeTeamId,
      pinnedTeamIds: pinnedFeedTeamIds,
      seen: seenSnapshotRef.current,
      now: feedRankEpoch,
    });
  }, [
    allItems,
    followingIds,
    myTeamIds,
    activeTeamId,
    pinnedFeedTeamIds,
    feedRankEpoch,
  ]);

  const handleFeedItemSeen = useCallback((key: string) => {
    markFeedItemSeen(key);
  }, []);

  return (
    <div className="page">
      <header className="home-head">
        <h1 className="page-title">BandCrew</h1>
        <span className="home-team">{activeTeam?.name}</span>
      </header>

      <p className="page-sub">팔로우 · 추천 밴드 소식</p>

      <StoryRail onOpen={setStoryId} />

      <div className="home-feed-toolbar">
        <button type="button" className="btn home-feed-refresh" onClick={() => void refreshHomeContent()}>
          피드 새로고침
        </button>
      </div>

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
