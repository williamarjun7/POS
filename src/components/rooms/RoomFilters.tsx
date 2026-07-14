import { Search } from 'lucide-react';
import type { Room } from '../../types';

export interface FiltersState {
  search: string;
  status: string;
  roomType: string;
}

interface RoomFiltersProps {
  filters: FiltersState;
  onChange: (filters: FiltersState) => void;
  roomTypes?: { id: string; name: string }[];
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'partial_paid', label: 'Partial Paid' },
  { value: 'fully_paid', label: 'Fully Paid' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'maintenance', label: 'Maintenance' },
];

export function RoomFilters({ filters, onChange, roomTypes }: RoomFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search rooms..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="w-full rounded-lg border border-border bg-background pl-9 pr-4 py-2 text-sm outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <select
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value })}
        className="w-full sm:w-auto rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {roomTypes && roomTypes.length > 0 && (
        <select
          value={filters.roomType}
          onChange={(e) => onChange({ ...filters, roomType: e.target.value })}
          className="w-full sm:w-auto rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">All Types</option>
          {roomTypes.map((rt) => (
            <option key={rt.id} value={rt.id}>{rt.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export function applyFilters(rooms: Room[], filters: FiltersState): Room[] {
  return rooms.filter((room) => {
    if (filters.search && !room.room_number?.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.status !== 'all' && room.status !== filters.status) {
      return false;
    }
    if (filters.roomType !== 'all' && room.room_type_id !== filters.roomType) {
      return false;
    }
    return true;
  });
}
