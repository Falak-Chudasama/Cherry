import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { playScroll } from '../../lib/sound';

export interface HierarchyBreadcrumbProps {
  year?: number;
  month?: number;
  monthName?: string;
  seasonId?: string;
  quarterId?: string;
  quarterNum?: number;
  isSurplus?: boolean;
  periodDateRange?: string; // e.g. "Nov 22–28"
  currentDayNum?: number; // e.g. 1
  totalDays?: number; // 7 (or 1..3 for surplus)
  activeLevel?: 'verse' | 'season' | 'quarter' | 'day';
  className?: string;
}

export const HierarchyBreadcrumb: React.FC<HierarchyBreadcrumbProps> = ({
  year = 2026,
  month = 11,
  monthName = 'November',
  seasonId,
  quarterId,
  quarterNum = 4,
  isSurplus = false,
  periodDateRange,
  currentDayNum,
  totalDays = 7,
  activeLevel = 'day',
  className = '',
}) => {
  const actualSeasonId = seasonId || `${year}-${String(month).padStart(2, '0')}`;
  const actualQuarterId = quarterId || `${actualSeasonId}-${isSurplus ? 'SURPLUS' : `Q${quarterNum}`}`;

  const periodLabel = isSurplus
    ? `Surplus Period${periodDateRange ? ` (${periodDateRange})` : ''}`
    : `Quarter ${quarterNum}${periodDateRange ? ` (${periodDateRange})` : ''}`;

  return (
    <nav
      aria-label="Hierarchy Breadcrumb"
      className={`flex items-center flex-wrap gap-1.5 text-xs text-stone-500 dark:text-stone-400 font-sans mb-3 select-none ${className}`}
    >
      {/* 1. Verse (Year) */}
      {activeLevel === 'verse' ? (
        <span className="font-bold text-stone-900 dark:text-white">
          {year} Verse
        </span>
      ) : (
        <Link
          to={`/season?year=${year}&view=verse`}
          onClick={() => playScroll()}
          className="hover:text-cherry-flesh dark:hover:text-cherry-blush transition-colors hover:underline"
        >
          {year} Verse
        </Link>
      )}

      <ChevronRight className="h-3 w-3 text-stone-400 dark:text-stone-600 shrink-0" aria-hidden="true" />

      {/* 2. Season (Month) */}
      {activeLevel === 'season' ? (
        <span className="font-bold text-stone-900 dark:text-white">
          {monthName} Season
        </span>
      ) : (
        <Link
          to={`/season?year=${year}&month=${month}&view=season`}
          onClick={() => playScroll()}
          className="hover:text-cherry-flesh dark:hover:text-cherry-blush transition-colors hover:underline"
        >
          {monthName} Season
        </Link>
      )}

      <ChevronRight className="h-3 w-3 text-stone-400 dark:text-stone-600 shrink-0" aria-hidden="true" />

      {/* 3. Quarter / Surplus Period */}
      {activeLevel === 'quarter' ? (
        <span className="font-bold text-stone-900 dark:text-white">
          {periodLabel}
        </span>
      ) : (
        <Link
          to={`/quarter?period_id=${actualQuarterId}`}
          onClick={() => playScroll()}
          className="hover:text-cherry-flesh dark:hover:text-cherry-blush transition-colors hover:underline"
        >
          {periodLabel}
        </Link>
      )}

      {/* 4. Day Level (if activeLevel === 'day' or currentDayNum is given) */}
      {activeLevel === 'day' && currentDayNum !== undefined && (
        <>
          <ChevronRight className="h-3 w-3 text-stone-400 dark:text-stone-600 shrink-0" aria-hidden="true" />
          <span className="font-bold text-cherry-flesh dark:text-cherry-blush">
            Day {currentDayNum} of {totalDays}
          </span>
        </>
      )}
    </nav>
  );
};
