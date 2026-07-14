/**
 * UserProfileService
 * ──────────────────
 * DB-backed CRUD for user profiles.
 *
 * Table: public.user_profiles
 * RLS: authenticated users can SELECT, admin users can INSERT/UPDATE/DELETE
 */

import { useState, useEffect, useCallback } from 'react';
import { insforge } from '@/lib/services/auth-service';
import type { UserProfileRow } from '@/lib/db/types';
import type { UserRole } from '@/types';

/* ─── Frontend Profile type (camelCase) ────────────────────── */

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string;
  active: boolean;
  lastLogin: string;
  createdAt: string;
}

/* ─── Mapper helper ────────────────────────────────────────── */

function rowToUserProfile(row: UserProfileRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: (row.role as UserRole) ?? 'waiter',
    phone: row.phone ?? '',
    active: row.active ?? true,
    lastLogin: row.last_login ?? '',
    createdAt: row.created_at,
  };
}

export interface NewUserProfileData {
  name: string;
  email: string;
  role?: UserRole;
  phone?: string;
  active?: boolean;
}

export interface UpdateUserProfileData {
  name?: string;
  email?: string;
  role?: UserRole;
  phone?: string;
  active?: boolean;
}

/* ─── DB operations ─────────────────────────────────────────── */

async function fetchUserProfilesFromDb(): Promise<UserProfile[]> {
  const { data, error } = await insforge.database
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: unknown) => rowToUserProfile(row as UserProfileRow));
}

async function createUserProfileInDb(data: NewUserProfileData): Promise<UserProfile> {
  const { data: inserted, error } = await insforge.database
    .from('user_profiles')
    .insert([
      {
        name: data.name,
        email: data.email,
        role: data.role ?? 'waiter',
        phone: data.phone ?? null,
        active: data.active ?? true,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return rowToUserProfile(inserted as UserProfileRow);
}

async function updateUserProfileInDb(id: string, data: UpdateUserProfileData): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.email !== undefined) payload.email = data.email;
  if (data.role !== undefined) payload.role = data.role;
  if (data.phone !== undefined) payload.phone = data.phone;
  if (data.active !== undefined) payload.active = data.active;

  const { error } = await insforge.database
    .from('user_profiles')
    .update(payload)
    .eq('id', id);

  if (error) throw error;
}

async function updateUserProfileByEmailInDb(email: string, data: UpdateUserProfileData): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.phone !== undefined) payload.phone = data.phone;
  if (data.active !== undefined) payload.active = data.active;

  const { error } = await insforge.database
    .from('user_profiles')
    .update(payload)
    .eq('email', email);

  if (error) throw error;
}

async function deleteUserProfileFromDb(id: string): Promise<void> {
  const { error } = await insforge.database
    .from('user_profiles')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/* ─── React Hook ────────────────────────────────────────────── */

export interface UseUserProfilesReturn {
  /** All user profiles (from DB) */
  profiles: UserProfile[];
  /** True while loading from DB */
  isLoading: boolean;
  /** Error message if load failed */
  loadError: string | null;
  /** Add a new user profile */
  addProfile: (data: NewUserProfileData) => Promise<UserProfile>;
  /** Update an existing profile by id */
  updateProfile: (id: string, data: UpdateUserProfileData) => Promise<void>;
  /** Update an existing profile by email */
  updateProfileByEmail: (email: string, data: UpdateUserProfileData) => Promise<void>;
  /** Delete a profile */
  deleteProfile: (id: string) => Promise<void>;
  /** Toggle active status */
  toggleActive: (id: string) => Promise<void>;
  /** Refetch from DB */
  refresh: () => Promise<void>;
}

export function useUserProfiles(): UseUserProfilesReturn {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchUserProfilesFromDb();
      setProfiles(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load user profiles';
      setLoadError(msg);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const data = await fetchUserProfilesFromDb();
        if (!cancelled) setProfiles(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load user profiles');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const addProfile = useCallback(async (data: NewUserProfileData): Promise<UserProfile> => {
    const created = await createUserProfileInDb(data);
    setProfiles(prev => [created, ...prev]);
    return created;
  }, []);

  const updateProfile = useCallback(async (id: string, data: UpdateUserProfileData) => {
    await updateUserProfileInDb(id, data);
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  }, []);

  const updateProfileByEmail = useCallback(async (email: string, data: UpdateUserProfileData) => {
    await updateUserProfileByEmailInDb(email, data);
    setProfiles(prev => prev.map(p => p.email === email ? { ...p, ...data } : p));
  }, []);

  const deleteProfile = useCallback(async (id: string) => {
    await deleteUserProfileFromDb(id);
    setProfiles(prev => prev.filter(p => p.id !== id));
  }, []);

  const toggleActive = useCallback(async (id: string) => {
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;
    const newActive = !profile.active;

    // Optimistic update
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, active: newActive } : p));

    try {
      await updateUserProfileInDb(id, { active: newActive });
    } catch {
      // Revert on failure
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, active: !newActive } : p));
      throw new Error('Failed to update user status');
    }
  }, [profiles]);

  return { profiles, isLoading, loadError, addProfile, updateProfile, updateProfileByEmail, deleteProfile, toggleActive, refresh };
}
