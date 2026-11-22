import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';
import { useEcosystem } from '../context/EcosystemContext';
import { api } from '../lib/api';
import { playScroll, playEnter } from '../lib/sound';
import { HierarchyBreadcrumb } from '../components/layout/HierarchyBreadcrumb';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const SeasonPage: React.FC = () => {
  const { activeQuarterId, workspaceRevision } = useEcosystem();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // URL synced state
  const viewParam = searchParams.get('view') === 'verse' ? 'verse' : 'season';
  const yearParam = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : 2026;
  const monthParam = searchParams.get('month') ? parseInt(searchParams.get('month')!, 10) : 11;

  const [viewMode, setViewMode] = useState<'season' | 'verse'>(viewParam);
  const [selectedYear, setSelectedYear] = useState<number>(yearParam);
  const [selectedMonth, setSelectedMonth] = useState<number>(monthParam);

  // Sync state with URL params
  useEffect(() => {
    if (searchParams.get('view')) {
      setViewMode(searchParams.get('view') === 'verse' ? 'verse' : 'season');
    }
    if (searchParams.get('year')) {
      setSelectedYear(parseInt(searchParams.get('year')!, 10));
    }
    if (searchParams.get('month')) {
      setSelectedMonth(parseInt(searchParams.get('month')!, 10));
    }
  }, [searchParams]);

  const monthName = MONTH_NAMES[selectedMonth - 1];
  const seasonId = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

  // Summary data states from backend
  const [seasonSummary, setSeasonSummary] = useState<any | null>(null);
  const [verseSummary, setVerseSummary] = useState<any | null>(null);

  // Fetch summaries deterministically
  useEffect(() => {
    let isMounted = true;

    if (viewMode === 'season') {
      api
        .getSeasonSummary(seasonId)
        .then((data) => {
          if (isMounted) setSeasonSummary(data);
        })
        .catch(() => {
          if (isMounted) setSeasonSummary(null);
        });
    } else {
      api
        .getVerseSummary(selectedYear)
        .then((data) => {
          if (isMounted) setVerseSummary(data);
        })
        .catch(() => {
          if (isMounted) setVerseSummary(null);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [viewMode, seasonId, selectedYear, workspaceRevision]);

  const handleToggleView = (mode: 'season' | 'verse') => {
    playScroll();
    setViewMode(mode);
    setSearchParams({
      year: String(selectedYear),
      month: String(selectedMonth),
      view: mode,
    });
  };

  const handlePrev = () => {
    playScroll();
    if (viewMode === 'season') {
      if (selectedMonth === 1) {
        setSelectedMonth(12);
        setSelectedYear((y) => y - 1);
        setSearchParams({ year: String(selectedYear - 1), month: '12', view: 'season' });
      } else {
        setSelectedMonth((m) => m - 1);
        setSearchParams({ year: String(selectedYear), month: String(selectedMonth - 1), view: 'season' });
      }
    } else {
      setSelectedYear((y) => y - 1);
      setSearchParams({ year: String(selectedYear - 1), view: 'verse' });
    }
  };

  const handleNext = () => {
    playScroll();
    if (viewMode === 'season') {
      if (selectedMonth === 12) {
        setSelectedMonth(1);
        setSelectedYear((y) => y + 1);
        setSearchParams({ year: String(selectedYear + 1), month: '1', view: 'season' });
      } else {
        setSelectedMonth((m) => m + 1);
        setSearchParams({ year: String(selectedYear), month: String(selectedMonth + 1), view: 'season' });
      }
    } else {
      setSelectedYear((y) => y + 1);
      setSearchParams({ year: String(selectedYear + 1), view: 'verse' });
    }
  };

  const handleDrillIntoQuarter = (periodId: string) => {
    playEnter();
    navigate(`/quarter?period_id=${periodId}`);
  };

  const handleDrillIntoMonth = (mNum: number) => {
    playEnter();
    setSelectedMonth(mNum);
    setViewMode('season');
    setSearchParams({ year: String(selectedYear), month: String(mNum), view: 'season' });
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-24 sm:pb-20 space-y-6 animate-fade-in">
      {/* Top Breadcrumb */}
      <HierarchyBreadcrumb
        year={selectedYear}
        month={selectedMonth}
        monthName={monthName}
        seasonId={seasonId}
        activeLevel={viewMode === 'verse' ? 'verse' : 'season'}
      />

      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/5 dark:border-white/10 pb-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
            {viewMode === 'verse' ? `${selectedYear} Verse Overview` : `${monthName} ${selectedYear} Season`}
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            Hierarchy: <strong className="text-stone-800 dark:text-stone-200">Day → Quarter (7 Days) → Season (Month) → Verse (Year)</strong>
          </p>
        </div>

        {/* View Toggle + Prev/Next Controls */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          {/* Segmented [ Season (Month) | Verse (Year) ] */}
          <div className="flex items-center p-1 rounded-2xl glass-card border border-black/5 dark:border-white/10">
            <button
              type="button"
              onClick={() => handleToggleView('season')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                viewMode === 'season'
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-2xs font-bold'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              Season (Month)
            </button>
            <button
              type="button"
              onClick={() => handleToggleView('verse')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                viewMode === 'verse'
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-2xs font-bold'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              Verse (Year)
            </button>
          </div>

          {/* Switcher Buttons */}
          <div className="flex items-center p-1 rounded-2xl glass-card border border-black/5 dark:border-white/10">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 rounded-xl hover:bg-stone-200/50 dark:hover:bg-stone-800 transition text-stone-600 dark:text-stone-300"
              title="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2.5 font-semibold text-xs text-stone-800 dark:text-stone-200">
              {viewMode === 'season' ? `${monthName.slice(0, 3)} ${selectedYear}` : `${selectedYear}`}
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 rounded-xl hover:bg-stone-200/50 dark:hover:bg-stone-800 transition text-stone-600 dark:text-stone-300"
              title="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODE 1: SEASON VIEW (4 Quarters + Surplus Period) */}
      {viewMode === 'season' && (
        <div className="space-y-6">
          {/* Season Totals Banner */}
          {seasonSummary?.totals && (
            <div className="glass-panel rounded-2xl p-4 border border-black/5 dark:border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs shadow-soft">
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-800 dark:text-stone-200">
                  Season Total Progress:
                </span>
                <span className="font-mono font-bold text-cherry-600 dark:text-cherry-300">
                  {seasonSummary.totals.tasks_done} / {seasonSummary.totals.tasks_total} Tasks Done
                </span>
              </div>

              <div className="flex items-center gap-4 flex-wrap text-stone-600 dark:text-stone-400 font-mono">
                <span>JP: {seasonSummary.totals.jp_total}</span>
                <span>Violations: {seasonSummary.totals.violations_count}</span>
                <span>Focus: {Math.round((seasonSummary.totals.focus_minutes || 0) / 60)}h</span>
              </div>
            </div>
          )}

          {/* Quarters & Surplus Period Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(seasonSummary?.periods || []).map((period: any) => {
              const isPeriodSurplus = period.period_type === 'SURPLUS';
              const isPeriodActive = activeQuarterId === period.period_id;

              return (
                <div
                  key={period.period_id}
                  onClick={() => handleDrillIntoQuarter(period.period_id)}
                  className={`glass-card rounded-3xl p-5 border transition-all cursor-pointer space-y-4 hover:scale-[1.01] hover:shadow-md ${
                    isPeriodActive
                      ? 'border-cherry-500/50 ring-1 ring-cherry-500/30'
                      : isPeriodSurplus
                      ? 'border-amber-500/30 hover:border-amber-500/50'
                      : 'border-black/5 dark:border-white/10 hover:border-cherry-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">
                          {period.name}
                        </h3>
                        {isPeriodActive && (
                          <span className="px-2 py-0.5 rounded-full text-micro font-mono font-bold bg-cherry-500/15 text-cherry-600 dark:text-cherry-300">
                            Active Now
                          </span>
                        )}
                        {isPeriodSurplus && (
                          <span className="px-2 py-0.5 rounded-full text-micro font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            Surplus
                          </span>
                        )}
                      </div>
                      <p className="text-2xs font-mono text-stone-500 mt-0.5">
                        {period.start_date} to {period.end_date}
                      </p>
                    </div>

                    <ArrowRight className="h-4 w-4 text-stone-400 hover:text-cherry-flesh transition" />
                  </div>

                  {/* Period Real Summary Metrics */}
                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-black/5 dark:border-white/5 text-center">
                    <div className="p-2 rounded-xl bg-stone-100/60 dark:bg-stone-900/60">
                      <span className="block text-micro text-stone-400 uppercase font-sans">Tasks</span>
                      <span className="font-mono text-xs font-bold text-stone-900 dark:text-white">
                        {period.tasks_done}/{period.tasks_total}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-stone-100/60 dark:bg-stone-900/60">
                      <span className="block text-micro text-stone-400 uppercase font-sans">JP</span>
                      <span className={`font-mono text-xs font-bold ${period.jp_total > 50 ? 'text-rose-600' : 'text-stone-900 dark:text-white'}`}>
                        {period.jp_total}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-stone-100/60 dark:bg-stone-900/60">
                      <span className="block text-micro text-stone-400 uppercase font-sans">Violations</span>
                      <span className={`font-mono text-xs font-bold ${period.violations_count > 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {period.violations_count}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-stone-100/60 dark:bg-stone-900/60">
                      <span className="block text-micro text-stone-400 uppercase font-sans">Focus</span>
                      <span className="font-mono text-xs font-bold text-stone-900 dark:text-white">
                        {Math.round((period.focus_minutes || 0) / 60)}h
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* If 28-day February with no Surplus period, render neutral card */}
            {daysInMonth === 28 && (
              <div className="glass-card rounded-3xl p-5 border border-dashed border-stone-300 dark:border-stone-800 text-center flex flex-col items-center justify-center space-y-2 opacity-60">
                <span className="text-xs font-bold text-stone-500">No Surplus Period</span>
                <p className="text-2xs text-stone-400">
                  February has exactly 28 days (4 fixed 7-day Quarters with zero surplus days).
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODE 2: VERSE VIEW (12 Months 3x4 Grid) */}
      {viewMode === 'verse' && (
        <div className="space-y-6">
          {/* Verse Totals Banner */}
          {verseSummary?.totals && (
            <div className="glass-panel rounded-2xl p-4 border border-black/5 dark:border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs shadow-soft">
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-800 dark:text-stone-200">
                  {selectedYear} Verse Totals:
                </span>
                <span className="font-mono font-bold text-cherry-600 dark:text-cherry-300">
                  {verseSummary.totals.tasks_done} / {verseSummary.totals.tasks_total} Tasks Done
                </span>
              </div>

              <div className="flex items-center gap-4 flex-wrap text-stone-600 dark:text-stone-400 font-mono">
                <span>Violations: {verseSummary.totals.violations_count}</span>
                <span>Focus: {Math.round((verseSummary.totals.focus_minutes || 0) / 60)}h</span>
              </div>
            </div>
          )}

          {/* 3x4 Grid of 12 Seasons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(verseSummary?.months || []).map((m: any) => {
              const isCurrentMonth = selectedYear === 2026 && m.month === 11;

              return (
                <div
                  key={m.month}
                  onClick={() => handleDrillIntoMonth(m.month)}
                  className={`glass-card rounded-2xl p-4 border transition-all cursor-pointer space-y-3 hover:border-cherry-500/40 hover:scale-[1.01] ${
                    isCurrentMonth ? 'border-cherry-500/50 ring-1 ring-cherry-500/20' : 'border-black/5 dark:border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-stone-900 dark:text-stone-100">
                        {m.month_name}
                      </h4>
                      <span className="text-micro font-mono text-stone-400">
                        Season {m.season_id}
                      </span>
                    </div>

                    {isCurrentMonth && (
                      <span className="px-2 py-0.5 rounded-full text-micro font-mono font-bold bg-cherry-500/15 text-cherry-600 dark:text-cherry-300">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center text-micro pt-1 border-t border-black/5 dark:border-white/5">
                    <div className="p-1.5 rounded-lg bg-stone-100/60 dark:bg-stone-900/60">
                      <span className="block text-stone-400">Tasks</span>
                      <span className="font-mono font-bold text-stone-800 dark:text-stone-200">
                        {m.tasks_done}/{m.tasks_total}
                      </span>
                    </div>

                    <div className="p-1.5 rounded-lg bg-stone-100/60 dark:bg-stone-900/60">
                      <span className="block text-stone-400">Violations</span>
                      <span className="font-mono font-bold text-stone-800 dark:text-stone-200">
                        {m.violations_count}
                      </span>
                    </div>

                    <div className="p-1.5 rounded-lg bg-stone-100/60 dark:bg-stone-900/60">
                      <span className="block text-stone-400">Focus</span>
                      <span className="font-mono font-bold text-stone-800 dark:text-stone-200">
                        {Math.round((m.focus_minutes || 0) / 60)}h
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
};
