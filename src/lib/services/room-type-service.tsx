/**
 * RoomTypeService
 * ───────────────
 * DB-backed CRUD for room types (categories like Single, Double, Suite).
 *
 * Table: public.room_types
 * RLS: authenticated users can SELECT, INSERT, UPDATE, DELETE
 */

import { useState, useEffect, useCallback } from 'react';
import { insforge } from '@/lib/services/auth-service';
import type { RoomTypeRow } from '@/lib/db/types';

/* ─── Frontend RoomType type (camelCase) ───────────────────── */

export interface RoomType {
  id: string;
  name: string;
  description: string;
  pricePerNight: number;
  capacity: number;
  amenities: string[];
}

/* ─── Mapper helpers ────────────────────────────────────────── */

function rowToRoomType(row: RoomTypeRow): RoomType {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    pricePerNight: Number(row.price_per_night),
    capacity: row.capacity,
    amenities: row.amenities ?? [],
  };
}

export interface NewRoomTypeData {
  name: string;
  description?: string;
  pricePerNight: number;
  capacity: number;
  amenities: string[];
}

/* ─── DB operations ─────────────────────────────────────────── */

async function fetchRoomTypesFromDb(): Promise<RoomType[]> {
  const { data, error } = await insforge.database
    .from('room_types')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row: unknown) => rowToRoomType(row as RoomTypeRow));
}

async function createRoomTypeInDb(data: NewRoomTypeData): Promise<RoomType> {
  const { data: inserted, error } = await insforge.database
    .from('room_types')
    .insert([
      {
        name: data.name,
        description: data.description ?? '',
        price_per_night: data.pricePerNight,
        capacity: data.capacity,
        amenities: data.amenities,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return rowToRoomType(inserted as RoomTypeRow);
}

/* ─── React Hook ────────────────────────────────────────────── */

export interface UseRoomTypesReturn {
  /** All room types (from DB), sorted by name */
  roomTypes: RoomType[];
  /** True while loading from DB */
  isLoading: boolean;
  /** Error message if load failed */
  loadError: string | null;
  /** Add a new room type (saves to DB, updates local list) */
  addRoomType: (data: NewRoomTypeData) => Promise<void>;
  /** Update an existing room type */
  updateRoomType: (id: string, data: Partial<NewRoomTypeData>) => Promise<void>;
  /** Delete a room type */
  deleteRoomType: (id: string) => Promise<void>;
  /** Refetch from DB */
  refresh: () => Promise<void>;
}

export function useRoomTypes(): UseRoomTypesReturn {
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchRoomTypesFromDb();
      setRoomTypes(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load room types';
      setLoadError(msg);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const data = await fetchRoomTypesFromDb();
        if (!cancelled) setRoomTypes(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load room types');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const addRoomType = useCallback(async (data: NewRoomTypeData) => {
    const created = await createRoomTypeInDb(data);
    setRoomTypes(prev => [...prev, created]);
  }, []);

  const updateRoomType = useCallback(async (id: string, data: Partial<NewRoomTypeData>) => {
    const payload: Record<string, unknown> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.description !== undefined) payload.description = data.description;
    if (data.pricePerNight !== undefined) payload.price_per_night = data.pricePerNight;
    if (data.capacity !== undefined) payload.capacity = data.capacity;
    if (data.amenities !== undefined) payload.amenities = data.amenities;

    const { error } = await insforge.database
      .from('room_types')
      .update(payload)
      .eq('id', id);

    if (error) throw error;

    // Refresh local state
    setRoomTypes(prev => prev.map(rt =>
      rt.id === id ? { ...rt, ...data } : rt
    ));
  }, []);

  const deleteRoomType = useCallback(async (id: string) => {
    const { error } = await insforge.database
      .from('room_types')
      .delete()
      .eq('id', id);

    if (error) throw error;

    setRoomTypes(prev => prev.filter(rt => rt.id !== id));
  }, []);

  return { roomTypes, isLoading, loadError, addRoomType, updateRoomType, deleteRoomType, refresh };
}
