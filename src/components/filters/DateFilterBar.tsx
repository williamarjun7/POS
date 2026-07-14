import { useCallback, useRef, useState, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

export type DateFilterPreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'this_year' | 'custom' | 'custom_range';

export interface DateRange {
  startDate: string;
  endDate: string;
  label: string;
  isToday: boolean;
}

export interface DateFilterState {
  preset: DateFilterPreset;
  customDate?: string;
  customStartDate?: string;
  customEndDate?: string;
}

export function kathmanduDateString(date?: Date): string {
  const d = date ?? new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
}

export function getDateRange(filter: DateFilterState): DateRange {
  const now = new Date();
  const today = kathmanduDateString(now);
  const todayDate = new Date(today + 'T00:00:00');

  switch (filter.preset) {
    case 'today':
      return { startDate: today, endDate: today, label: 'Today', isToday: true };
    case 'yesterday': {
      const y = new Date(todayDate.getTime() - 86400000);
      const ys = kathmanduDateString(y);
      return { startDate: ys, endDate: ys, label: 'Yesterday', isToday: false };
    }
    case 'this_week': {
      const dow = todayDate.getDay();
      const start = new Date(todayDate.getTime() - dow * 86400000);
      return {
        startDate: kathmanduDateString(start),
        endDate: today,
        label: 'This Week',
        isToday: false,
      };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startDate: kathmanduDateString(start),
        endDate: today,
        label: 'This Month',
        isToday: false,
      };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return {
        startDate: kathmanduDateString(start),
        endDate: today,
        label: 'This Year',
        isToday: false,
      };
    }
    case 'custom':
      return {
        startDate: filter.customDate ?? today,
        endDate: filter.customDate ?? today,
        label: filter.customDate ?? 'Custom',
        isToday: (filter.customDate ?? today) === today,
      };
    case 'custom_range':
      return {
        startDate: filter.customStartDate ?? today,
        endDate: filter.customEndDate ?? today,
        label: `${filter.customStartDate ?? ''} — ${filter.customEndDate ?? ''}`,
        isToday: (filter.customStartDate ?? '') === today && (filter.customEndDate ?? '') === today,
      };
    default:
      return { startDate: today, endDate: today, label: 'Today', isToday: true };
  }
}

interface DateFilterBarProps {
  filter: DateFilterState;
  dateRange: DateRange;
  onChange: (filter: DateFilterState) => void;
  openCustomKey?: number;
}

const PRESETS: { value: DateFilterPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_year', label: 'This Year' },
];

export default function DateFilterBar({ filter, dateRange, onChange, openCustomKey }: DateFilterBarProps) {
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    if (openCustomKey && openCustomKey > 0) {
      setShowCustom(true);
    }
  }, [openCustomKey]);
  const [customDate, setCustomDate] = useState(filter.customDate ?? kathmanduDateString());
  const [customStart, setCustomStart] = useState(filter.customStartDate ?? '');
  const [customEnd, setCustomEnd] = useState(filter.customEndDate ?? '');
  const [isRange, setIsRange] = useState(filter.preset === 'custom_range');
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showCustom) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowCustom(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCustom]);

  const handlePreset = useCallback((preset: DateFilterPreset) => {
    onChange({ preset });
    setShowCustom(false);
  }, [onChange]);

  const handleTodayNow = useCallback(() => {
    onChange({ preset: 'today' });
    setShowCustom(false);
  }, [onChange]);

  const handleCustomSubmit = useCallback(() => {
    if (isRange && customStart && customEnd) {
      if (customStart <= customEnd) {
        onChange({ preset: 'custom_range', customStartDate: customStart, customEndDate: customEnd });
        setShowCustom(false);
      }
    } else if (!isRange && customDate) {
      onChange({ preset: 'custom', customDate: customDate });
      setShowCustom(false);
    }
  }, [isRange, customDate, customStart, customEnd, onChange]);

  useEffect(() => {
    if (filter.preset === 'custom' && filter.customDate) {
      setCustomDate(filter.customDate);
      setIsRange(false);
    } else if (filter.preset === 'custom_range') {
      if (filter.customStartDate) setCustomStart(filter.customStartDate);
      if (filter.customEndDate) setCustomEnd(filter.customEndDate);
      setIsRange(true);
    }
  }, [filter]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => handlePreset(p.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
              filter.preset === p.value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setShowCustom(!showCustom)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer inline-flex items-center gap-1 ${
              filter.preset === 'custom' || filter.preset === 'custom_range'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            Custom
            <ChevronDown className="h-3 w-3" />
          </button>

          {showCustom && (
            <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl border bg-popover p-4 shadow-lg">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsRange(false)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                      !isRange ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    Single Day
                  </button>
                  <button
                    onClick={() => setIsRange(true)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                      isRange ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    Date Range
                  </button>
                </div>

                {isRange ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Start Date</label>
                      <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">End Date</label>
                      <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Date</label>
                    <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={handleCustomSubmit}
                    disabled={isRange ? !customStart || !customEnd : !customDate}
                    className="flex-1 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    Apply
                  </button>
                  {dateRange.isToday && filter.preset !== 'today' && (
                    <button onClick={handleTodayNow}
                      className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-accent transition-all cursor-pointer">
                      Now
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
        <Calendar className="h-3.5 w-3.5" />
        <span className="font-medium">{dateRange.label}</span>
      </div>
    </div>
  );
}
