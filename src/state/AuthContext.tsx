import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { AppUser } from '../types';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { DB_TABLES } from '../lib/databaseTables';
import { deleteReplacedStorageUrl } from '../services/storageService';
import { INSTAGRAM_COLUMN_MISSING_MESSAGE, isMissingInstagramColumnError } from '../utils/dbErrors';

interface DbProfile {
  display_name: string;
  avatar_url: string;
  bio: string;
  instagram?: string | null;
}

export interface AuthContextValue {
  session: Session | null;
  authUser: User | null;
  profile: AppUser | null;
  authLoading: boolean;
  authRequired: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message: string }>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ ok: boolean; message: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateRemoteProfile: (patch: {
    name?: string;
    avatar?: string;
    bio?: string;
    instagram?: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapProfile(userId: string, row: DbProfile | null, fallbackEmail?: string): AppUser {
  return {
    id: userId,
    name: row?.display_name?.trim() || fallbackEmail?.split('@')[0] || 'User',
    avatar: row?.avatar_url?.trim() ?? '',
    bio: row?.bio?.trim() || undefined,
    instagram: row?.instagram?.trim() || undefined,
  };
}

async function fetchDbProfile(userId: string): Promise<DbProfile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(DB_TABLES.profiles)
    .select('display_name, avatar_url, bio, instagram')
    .eq('id', userId)
    .maybeSingle();

  if (!error) return data as DbProfile | null;

  if (/instagram|column.*does not exist/i.test(error.message)) {
    const { data: fallback, error: fallbackError } = await supabase
      .from(DB_TABLES.profiles)
      .select('display_name, avatar_url, bio')
      .eq('id', userId)
      .maybeSingle();
    if (fallbackError) {
      console.warn('[BandCrew] profile fetch failed', fallbackError.message);
      return null;
    }
    return fallback as DbProfile | null;
  }

  console.warn('[BandCrew] profile fetch failed', error.message);
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);

  const loadProfile = useCallback(async (user: User) => {
    const row = await fetchDbProfile(user.id);
    setProfile(mapProfile(user.id, row, user.email));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const nextSession = data.session ?? null;
      setSession(nextSession);
      if (nextSession?.user) {
        void loadProfile(nextSession.user).finally(() => {
          if (mounted) setAuthLoading(false);
        });
      } else {
        setProfile(null);
        setAuthLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        void loadProfile(nextSession.user);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, message: 'Supabase가 설정되지 않았어요.' };

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: '로그인했어요.' };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, message: 'Supabase가 설정되지 않았어요.' };

    const trimmedName = displayName.trim();
    if (!trimmedName) return { ok: false, message: '이름을 입력해주세요.' };
    if (password.length < 6) return { ok: false, message: '비밀번호는 6자 이상이어야 해요.' };

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: trimmedName },
      },
    });

    if (error) return { ok: false, message: error.message };

    if (!data.session) {
      return {
        ok: true,
        message: '가입 완료! 이메일 확인 링크를 눌러 주세요. (확인 후 로그인)',
      };
    }

    localStorage.removeItem('band-crew-state-v1');
    return { ok: true, message: '가입하고 로그인했어요.' };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    await loadProfile(session.user);
  }, [loadProfile, session?.user]);

  const updateRemoteProfile = useCallback(
    async (patch: { name?: string; avatar?: string; bio?: string; instagram?: string }) => {
      if (!session?.user) throw new Error('로그인이 필요해요.');
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase가 설정되지 않았어요.');

      const updates: Partial<DbProfile> = {};
      if (patch.name !== undefined) updates.display_name = patch.name.trim();
      if (patch.avatar !== undefined) updates.avatar_url = patch.avatar;
      if (patch.bio !== undefined) updates.bio = patch.bio.trim();
      if (patch.instagram !== undefined) updates.instagram = patch.instagram;

      if (Object.keys(updates).length === 0) return;

      const userId = session.user.id;
      const { data: existing, error: readError } = await supabase
        .from(DB_TABLES.profiles)
        .select('id, avatar_url')
        .eq('id', userId)
        .maybeSingle();
      const previousAvatar = existing?.avatar_url ?? '';

      if (readError) throw new Error(readError.message);

      if (!existing) {
        const baseRow = {
          id: userId,
          display_name: updates.display_name ?? session.user.email?.split('@')[0] ?? 'User',
          avatar_url: updates.avatar_url ?? '',
          bio: updates.bio ?? '',
        };
        const withInstagram =
          updates.instagram !== undefined
            ? { ...baseRow, instagram: updates.instagram }
            : baseRow;
        const { error: insertError } = await supabase.from(DB_TABLES.profiles).insert(withInstagram);
        if (
          insertError &&
          updates.instagram !== undefined &&
          isMissingInstagramColumnError(insertError.message)
        ) {
          const { error: retryError } = await supabase.from(DB_TABLES.profiles).insert(baseRow);
          if (retryError) throw new Error(retryError.message);
          throw new Error(INSTAGRAM_COLUMN_MISSING_MESSAGE);
        } else if (insertError) {
          throw new Error(insertError.message);
        }
      } else {
        const { error } = await supabase.from(DB_TABLES.profiles).update(updates).eq('id', userId);
        if (
          error &&
          updates.instagram !== undefined &&
          isMissingInstagramColumnError(error.message)
        ) {
          const { instagram: _ignored, ...rest } = updates;
          if (Object.keys(rest).length > 0) {
            const { error: retryError } = await supabase.from(DB_TABLES.profiles).update(rest).eq('id', userId);
            if (retryError) throw new Error(retryError.message);
          }
          throw new Error(INSTAGRAM_COLUMN_MISSING_MESSAGE);
        } else if (error) {
          throw new Error(error.message);
        }
      }

      if (patch.avatar !== undefined) {
        await deleteReplacedStorageUrl(previousAvatar, patch.avatar);
      }

      await loadProfile(session.user);
    },
    [loadProfile, session?.user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      authUser: session?.user ?? null,
      profile,
      authLoading,
      authRequired: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      updateRemoteProfile,
    }),
    [
      session,
      profile,
      authLoading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      updateRemoteProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
