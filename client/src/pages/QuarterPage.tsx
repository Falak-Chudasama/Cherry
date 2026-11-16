import React, { useState, useEffect } from "react";
import { Key, ShieldCheck, Plus, CheckCircle2, Target, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { playEnter, playNotification, playFailed, playScroll } from "../lib/sound";
import { useToast } from "../components/ui/ToastProvider";
import { useEcosystem } from "../context/EcosystemContext";
import { PageShell } from "../components/layout/PageShell";
import { QuarterPlan } from "../types";

const JP_PRESETS = [
  { label: "Healthy Snack", points: 5 },
  { label: "Processed Snack", points: 15 },
  { label: "Fast Food", points: 25 },
  { label: "Sugary Beverage", points: 15 },
  { label: "Dessert", points: 20 },
];

export const QuarterPage: React.FC = () => {
  const { activeQuarterId, todayStr, refreshEcosystem } = useEcosystem();
  const { push } = useToast();

  const [accountability, setAccountability] = useState<any>(null);
  const [junkPointsData, setJunkPointsData] = useState<any>(null);
  const [plan, setPlan] = useState<QuarterPlan | null>(null);
  const [planning, setPlanning] = useState(false);

  // Junk point form state
  const [foodItem, setFoodItem] = useState("");
  const [points, setPoints] = useState(10);

  useEffect(() => {
    if (activeQuarterId) {
      loadQuarterData();
    }
  }, [activeQuarterId, todayStr]);

  const loadQuarterData = async () => {
    if (!activeQuarterId) return;
    try {
      const acc = await api.getQuarterAccountability(activeQuarterId);
      setAccountability(acc);

      const jp = await api.getDayJunkPoints(todayStr);
      setJunkPointsData(jp);

      const p = await api.getActivePlan(activeQuarterId);
      setPlan(p);
    } catch (err) {
      console.debug("Failed to load quarter data", err);
    }
  };

  const handleAddJunkPoint = async (item: string, pts: number) => {
    if (!item.trim() || !activeQuarterId) return;

    playEnter();
    try {
      const res = await api.addJunkPoint({
        date_str: todayStr,
        quarter_id: activeQuarterId,
        food_item: item.trim(),
        base_score: Number(pts),
        portion_factor: 1.0,
      });
      setFoodItem("");
      if (res.quarter_key_spent) {
        push("error", "Junk Point limit breached (>50 JP)! 1 Quarter Key deducted.");
      } else {
        push("info", `Logged ${item} (+${res.points} JP).`);
      }
      playNotification();
      loadQuarterData();
      refreshEcosystem();
    } catch {
      playFailed();
      push("error", "Failed to add junk points.");
    }
  };

  const handleAutoPlan = async () => {
    setPlanning(true);
    playEnter();
    try {
      // Send chat request to plan the quarter
      const res = await api.sendMessage(`Plan the quarter ${activeQuarterId} based on active goals.`);
      if (res.reply.card_type === "quarter_plan_proposal" && res.reply.card_data) {
        // Approve the proposal immediately into active quarter plan
        await api.approveQuarterPlan(res.reply.card_data.plan_id, "Auto-approved via Quarter page");
        playNotification();
        push("success", `Quarter Plan ${activeQuarterId} synthesized and activated.`);
        await loadQuarterData();
        await refreshEcosystem();
      }
    } catch {
      playFailed();
      push("error", "Failed to generate quarter plan.");
    } finally {
      setPlanning(false);
    }
  };

  const totalJp = junkPointsData?.total_junk_points ?? 0;
  const jpPct = Math.min(100, Math.round((totalJp / 50) * 100));
  const remainingKeys = accountability?.remaining_keys ?? 3;

  // 7 days in Quarter III (Days 15 through 21)
  const quarterDays = [15, 16, 17, 18, 19, 20, 21];
  const currentDayNum = parseInt(todayStr.split("-")[2], 10) || 16;

  return (
    <PageShell
      title="Quarter Accountability"
      description={`${activeQuarterId || "Active Quarter"} • Fixed 7-day sprint`}
      icon={<ShieldCheck className="h-4 w-4" />}
      action={
        <div className="flex items-center gap-1.5">
          {[1, 2, 3].map((keyIdx) => (
            <div
              key={keyIdx}
              className={`flex h-8 w-8 items-center justify-center rounded-xl glass-card transition ${
                keyIdx <= remainingKeys
                  ? "text-cherry-flesh border-cherry-500/30 bg-cherry-500/10"
                  : "opacity-25 text-stone-400"
              }`}
              title={keyIdx <= remainingKeys ? `Key #${keyIdx} Active` : `Key #${keyIdx} Deducted`}
            >
              <Key className="h-4 w-4" />
            </div>
          ))}
          <span className="ml-1 text-xs font-mono font-bold text-stone-700 dark:text-stone-300">
            {remainingKeys}/3 Keys
          </span>
        </div>
      }
    >
      <div className="space-y-6">
        {/* 7-Day Sprint Timeline */}
        <div className="glass-panel rounded-2xl p-5 shadow-soft space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
              7-Day Sprint Timeline
            </span>
            <span className="text-2xs text-stone-400 font-mono">
              Day {quarterDays.indexOf(currentDayNum) + 1} of 7
            </span>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {quarterDays.map((d) => {
              const isToday = d === currentDayNum;
              const isPast = d < currentDayNum;
              return (
                <div
                  key={d}
                  className={`p-2.5 rounded-xl text-center border transition ${
                    isToday
                      ? "bg-cherry-500/15 border-cherry-500/40 text-cherry-flesh font-bold"
                      : isPast
                      ? "bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5 text-stone-400"
                      : "glass-card text-stone-600 dark:text-stone-300"
                  }`}
                >
                  <span className="text-2xs block uppercase text-stone-400 font-mono">Day</span>
                  <span className="text-sm font-bold font-mono">{d}</span>
                  {isToday && (
                    <span className="mt-1 block text-2xs uppercase font-extrabold text-cherry-flesh">
                      Today
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Junk Points & Diet Section */}
          <div className="glass-panel rounded-2xl p-5 shadow-soft space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 block">
                  Diet Tracker (Junk Points)
                </span>
                <span className="text-2xs text-stone-400">Deducts 1 Key if limit is exceeded</span>
              </div>
              <span
                className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full ${
                  totalJp > 50
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 font-extrabold"
                    : "text-stone-800 dark:text-stone-200"
                }`}
              >
                {totalJp} / 50 JP
              </span>
            </div>

            {/* Progress Meter */}
            <div className="space-y-1">
              <div className="h-2 w-full rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    totalJp > 50 ? "bg-rose-500" : totalJp > 35 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${jpPct}%` }}
                />
              </div>
              <div className="flex justify-between text-2xs text-stone-400 font-mono">
                <span>0 JP</span>
                <span>50 JP Threshold</span>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="space-y-1.5 pt-1">
              <span className="text-2xs font-semibold text-stone-400 block uppercase">Quick Presets</span>
              <div className="flex flex-wrap gap-1.5">
                {JP_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      playScroll();
                      handleAddJunkPoint(p.label, p.points);
                    }}
                    className="btn-interactive text-2xs px-2.5 py-1 rounded-full glass-card border border-stone-200/80 dark:border-white/10 text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white"
                  >
                    <span>{p.label}</span>
                    <span className="text-stone-400 font-mono ml-1">+{p.points}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddJunkPoint(foodItem, points);
              }}
              className="flex gap-2 pt-2 border-t border-black/5 dark:border-white/10"
            >
              <input
                type="text"
                placeholder="Custom food/drink item..."
                value={foodItem}
                onChange={(e) => setFoodItem(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl glass-card text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none"
              />
              <input
                type="number"
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className="w-16 px-2 py-1.5 rounded-xl glass-card text-xs text-stone-800 dark:text-stone-200 font-mono focus:outline-none"
                title="Points"
              />
              <button
                type="submit"
                disabled={!foodItem.trim()}
                className="btn-glass-primary !py-1.5 !px-3 text-xs font-bold"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>

          {/* Goals & Key Accountability Ledger */}
          <div className="glass-panel rounded-2xl p-5 shadow-soft space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 block">
                  Quarter Goals
                </span>
                <span className="text-2xs text-stone-400">Committed sprint backlog</span>
              </div>
              <button
                onClick={handleAutoPlan}
                disabled={planning}
                className="btn-glass-primary !py-1 !px-2.5 text-2xs font-bold"
              >
                <Sparkles className="h-3 w-3" />
                <span>{planning ? "Planning..." : "AI Plan"}</span>
              </button>
            </div>

            {plan && plan.goals && plan.goals.length > 0 ? (
              <div className="space-y-2">
                {plan.goals.map((g, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl glass-card flex items-start gap-2 text-xs">
                    <Target className="h-3.5 w-3.5 text-cherry-flesh mt-0.5 shrink-0" />
                    <div>
                      <h4 className="font-semibold text-stone-800 dark:text-stone-200">{g.title}</h4>
                      {g.description && <p className="text-2xs text-stone-400 mt-0.5">{g.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center space-y-2 glass-card rounded-xl p-3">
                <p className="text-xs text-stone-400">No quarter goals committed yet.</p>
                <button
                  onClick={handleAutoPlan}
                  disabled={planning}
                  className="btn-glass-primary text-xs font-semibold"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>{planning ? "Synthesizing Plan..." : "Plan Quarter 3 with AI"}</span>
                </button>
              </div>
            )}

            {/* Spent Keys Ledger */}
            <div className="pt-2 border-t border-black/5 dark:border-white/10 space-y-2">
              <span className="text-2xs font-bold uppercase tracking-wider text-stone-400 block">
                Quarter Key Ledger ({remainingKeys}/3 Remaining)
              </span>
              {accountability?.violations && accountability.violations.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {accountability.violations.map((v: any, idx: number) => (
                    <div key={idx} className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs">
                      <div className="flex justify-between font-bold text-rose-700 dark:text-rose-300">
                        <span>{v.violation_type || "Violation"}</span>
                        <span className="font-mono">-1 QK</span>
                      </div>
                      <p className="text-stone-600 dark:text-stone-400 text-2xs mt-0.5">{v.description || v.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2 rounded-xl glass-card text-xs text-stone-600 dark:text-stone-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Clean Ledger. 0 Quarter Keys spent this week.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
};
