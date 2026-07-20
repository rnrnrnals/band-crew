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

  if (error) {
    console.warn('[BandCrew] profile fetch failed', error.message);
    return null;
  }

  return data as DbProfile | null;
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
      if (!session?.user) return;
      const supabase = getSupabase();
      if (!supabase) return;

      const updates: Partial<DbProfile> = {};
      if (patch.name !== undefined) updates.display_name = patch.name.trim();
      if (patch.avatar !== undefined) updates.avatar_url = patch.avatar;
      if (patch.bio !== undefined) updates.bio = patch.bio.trim();
      if (patch.instagram !== undefined) updates.instagram = patch.instagram;

      if (Object.keys(updates).length === 0) return;

      const { error } = await supabase
        .from(DB_TABLES.profiles)
        .update(updates)
        .eq('id', session.user.id);

      if (error) {
        console.warn('[BandCrew] profile update failed', error.message);
        return;
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
