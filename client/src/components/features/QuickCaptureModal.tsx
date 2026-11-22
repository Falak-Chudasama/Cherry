import React, { useState } from 'react';
import { X, CheckSquare, Utensils, AlertTriangle, ArrowRight } from 'lucide-react';
import { useEcosystem, type QuickCaptureTab } from '../../context/EcosystemContext';
import { useToast } from '../ui/ToastProvider';
import { api } from '../../lib/api';
import { playEnter, playFailed, playScroll } from '../../lib/sound';

export const QuickCaptureModal: React.FC = () => {
  const {
    isQuickCaptureOpen,
    quickCaptureTab,
    closeQuickCapture,
    openTaskDrawer,
    activeQuarterId,
    activePeriodType,
    todayStr,
    junkPoints,
    bumpWorkspaceRevision,
  } = useEcosystem();

  const { push: toast } = useToast();
  const [activeTab, setActiveTab] = useState<QuickCaptureTab>(quickCaptureTab);

  // Sync internal activeTab with context whenever quickCaptureTab changes
  React.useEffect(() => {
    setActiveTab(quickCaptureTab);
  }, [quickCaptureTab]);

  // Form states
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<string>('P2');
  const [foodItem, setFoodItem] = useState('');
  const [jpValue, setJpValue] = useState<string>('5');
  const [ruleId, setRuleId] = useState('rule-no-games');
  const [violationEvidence, setViolationEvidence] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isQuickCaptureOpen) return null;

  const remainingJp = Math.max(0, 50 - junkPoints);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setIsSubmitting(true);
    try {
      await api.createTask({
        title: taskTitle.trim(),
        period_id: activeQuarterId,
        quarter_id: activeQuarterId,
        period_type: activePeriodType,
        tier: 'Must Do',
        category: 'MUST',
        priority: taskPriority || undefined,
        status: 'Not started',
        target_date: todayStr,
      });
      playEnter();
      toast('success', `Created task: "${taskTitle.trim()}"`);
      bumpWorkspaceRevision();
      setTaskTitle('');
      closeQuickCapture();
    } catch (err: any) {
      playFailed();
      toast('error', err.message || 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenFullTaskDrawer = () => {
    const title = taskTitle.trim();
    closeQuickCapture();
    openTaskDrawer({
      title,
      priority: taskPriority,
      period_id: activeQuarterId,
      period_type: activePeriodType,
      mode: 'create',
    });
  };

  const handleLogDiet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodItem.trim()) return;
    const numJp = parseFloat(jpValue);
    if (isNaN(numJp) || numJp <= 0) {
      toast('error', 'Please enter a valid JP value greater than 0');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.addJunkPoint({
        food_item: foodItem.trim(),
        jp_value: numJp,
        date_str: todayStr,
        period_id: activeQuarterId,
      });
      playEnter();
      toast('success', `Logged ${foodItem.trim()} (+${numJp} JP)`);
      bumpWorkspaceRevision();
      setFoodItem('');
      closeQuickCapture();
    } catch (err: any) {
      playFailed();
      toast('error', err.message || 'Failed to log diet');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordViolation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const ruleNames: Record<string, string> = {
        'rule-no-games': 'No video games on focus days',
        'rule-50-jp': 'Exceeded 50 Junk Points limit',
        'rule-routines': 'Skipped all routine tasks',
      };
      await api.recordViolation({
        rule_id: ruleId,
        rule_name: ruleNames[ruleId] || ruleId,
        evidence: violationEvidence.trim() || 'Logged via Quick Capture',
        date_str: todayStr,
        period_id: activeQuarterId,
      });
      playEnter();
      toast('success', 'Recorded rule violation');
      bumpWorkspaceRevision();
      setViolationEvidence('');
      closeQuickCapture();
    } catch (err: any) {
      playFailed();
      toast('error', err.message || 'Failed to record violation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in"
      onClick={closeQuickCapture}
    >
      <div
        className="w-full max-w-md rounded-3xl glass-panel p-6 shadow-lift border border-white/20 dark:border-white/10 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Tabs */}
        <div className="flex items-center justify-between pb-4 border-b border-black/5 dark:border-white/10">
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-stone-100 dark:bg-stone-900 border border-stone-200/50 dark:border-stone-800">
            <button
              type="button"
              onClick={() => {
                playScroll();
                setActiveTab('task');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'task'
                  ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-2xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span>Task</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playScroll();
                setActiveTab('diet');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'diet'
                  ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-2xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              <Utensils className="h-3.5 w-3.5" />
              <span>Diet / JP</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playScroll();
                setActiveTab('violation');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'violation'
                  ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-2xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Violation</span>
            </button>
          </div>

          <button
            type="button"
            onClick={closeQuickCapture}
            className="rounded-full p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab 1: Task Quick Capture */}
        {activeTab === 'task' && (
          <form onSubmit={handleCreateTask} className="mt-4 space-y-4">
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-stone-400 mb-1">
                Task Title
              </label>
              <input
                type="text"
                autoFocus
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="What needs to get done?"
                className="w-full px-3.5 py-2.5 rounded-2xl glass-card text-sm font-medium focus-ring placeholder-stone-400 dark:placeholder-stone-600"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-stone-400 mb-1">
                  Priority
                </label>
                <div className="flex items-center gap-1">
                  {['P1', 'P2', 'P3'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTaskPriority(p)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold font-mono transition ${
                        taskPriority === p
                          ? 'bg-cherry-flesh text-white shadow-xs'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-right">
                <span className="block text-2xs font-bold uppercase tracking-wider text-stone-400 mb-1">
                  Target Period
                </span>
                <span className="inline-block px-2.5 py-1 rounded-xl text-xs font-mono font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                  {activeQuarterId}
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between gap-2 border-t border-black/5 dark:border-white/10">
              <button
                type="button"
                onClick={handleOpenFullTaskDrawer}
                className="flex items-center gap-1 text-xs font-semibold text-cherry-600 dark:text-cherry-300 hover:underline"
              >
                <span>More options → Open Drawer</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeQuickCapture}
                  className="px-3.5 py-2 rounded-2xl text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!taskTitle.trim() || isSubmitting}
                  className="px-4 py-2 rounded-2xl text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-xs hover:opacity-90 disabled:opacity-40 transition"
                >
                  {isSubmitting ? 'Adding...' : 'Add Task'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Tab 2: Diet / Junk Points Quick Capture */}
        {activeTab === 'diet' && (
          <form onSubmit={handleLogDiet} className="mt-4 space-y-4">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 text-xs">
              <span className="font-medium text-amber-800 dark:text-amber-300">
                Period Budget: 50 JP
              </span>
              <span className="font-bold font-mono text-amber-900 dark:text-amber-200">
                {remainingJp} JP Remaining
              </span>
            </div>

            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-stone-400 mb-1">
                Food Item
              </label>
              <input
                type="text"
                autoFocus
                value={foodItem}
                onChange={(e) => setFoodItem(e.target.value)}
                placeholder="e.g. Samosa, Soda, Biscuit"
                className="w-full px-3.5 py-2.5 rounded-2xl glass-card text-sm font-medium focus-ring placeholder-stone-400 dark:placeholder-stone-600"
              />
            </div>

            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-stone-400 mb-1">
                Junk Points Value (Numeric)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={jpValue}
                  onChange={(e) => setJpValue(e.target.value)}
                  className="w-24 px-3.5 py-2.5 rounded-2xl glass-card text-sm font-mono font-bold focus-ring text-stone-900 dark:text-stone-100"
                />
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  Enter exact agreed JP cost for this food item.
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-black/5 dark:border-white/10">
              <button
                type="button"
                onClick={closeQuickCapture}
                className="px-3.5 py-2 rounded-2xl text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!foodItem.trim() || isSubmitting}
                className="px-4 py-2 rounded-2xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs disabled:opacity-40 transition"
              >
                {isSubmitting ? 'Logging...' : 'Log Food (+JP)'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Personal Rule Violation Quick Capture */}
        {activeTab === 'violation' && (
          <form onSubmit={handleRecordViolation} className="mt-4 space-y-4">
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-stone-400 mb-1">
                Personal Rule Violated
              </label>
              <select
                value={ruleId}
                onChange={(e) => setRuleId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl glass-card text-xs font-medium focus-ring text-stone-900 dark:text-stone-100"
              >
                <option value="rule-no-games">No video games on focus days</option>
                <option value="rule-50-jp">Exceeded 50 Junk Points limit</option>
                <option value="rule-routines">Skipped all routine tasks</option>
                <option value="custom">Other personal rule infraction</option>
              </select>
            </div>

            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-stone-400 mb-1">
                Evidence / Note (Optional)
              </label>
              <textarea
                rows={2}
                value={violationEvidence}
                onChange={(e) => setViolationEvidence(e.target.value)}
                placeholder="What happened? Brief honest reflection..."
                className="w-full px-3.5 py-2.5 rounded-2xl glass-card text-xs font-medium focus-ring placeholder-stone-400 dark:placeholder-stone-600"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-black/5 dark:border-white/10">
              <button
                type="button"
                onClick={closeQuickCapture}
                className="px-3.5 py-2 rounded-2xl text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-2xl text-xs font-bold bg-cherry-flesh hover:bg-cherry-700 text-white shadow-xs disabled:opacity-40 transition"
              >
                {isSubmitting ? 'Recording...' : 'Record Violation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
