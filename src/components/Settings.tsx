import { useCallback, useEffect, useState } from 'react';
import { X, Calendar, ListChecks, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { showToast } from './Toast';

interface Props {
  onClose: () => void;
}

interface ListInfo {
  id: string;
  name: string;
}

export function SettingsModal({ onClose }: Props) {
  const { theme, toggle: toggleTheme } = useTheme();
  const [calendars, setCalendars] = useState<ListInfo[]>([]);
  const [enabledCalendars, setEnabledCalendars] = useState<string[]>([]);
  const [taskLists, setTaskLists] = useState<ListInfo[]>([]);
  const [enabledTaskLists, setEnabledTaskLists] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [cals, lists, settings] = await Promise.all([
          api.getAvailableCalendars().catch(() => []),
          api.getAvailableTaskLists().catch(() => []),
          api.getSettings(),
        ]);

        setCalendars(cals);
        setTaskLists(lists);

        const enabledCals = settings.enabled_calendars as string[] | undefined;
        setEnabledCalendars(enabledCals && enabledCals.length > 0 ? enabledCals : cals.map((c) => c.id));

        const enabledLists = settings.enabled_task_lists as string[] | undefined;
        setEnabledTaskLists(enabledLists && enabledLists.length > 0 ? enabledLists : lists.map((l) => l.name));
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const toggleCalendar = useCallback((id: string) => {
    setEnabledCalendars((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const toggleTaskList = useCallback((name: string) => {
    setEnabledTaskLists((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await Promise.all([
        api.updateSetting('enabled_calendars', enabledCalendars),
        api.updateSetting('enabled_task_lists', enabledTaskLists),
      ]);
      showToast('Settings saved', 'success');
      // Trigger re-sync with new preferences
      api.syncCalendar().catch(() => {});
      api.syncTasks().catch(() => {});
    } catch {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }, [enabledCalendars, enabledTaskLists]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-11/12 max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Settings</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[32rem] overflow-y-auto p-5 space-y-6">
          {/* Theme */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Appearance</h3>
            <div className="flex items-center justify-between rounded-lg border border-slate-800 px-4 py-3">
              <span className="text-sm text-slate-300">Theme</span>
              <button
                onClick={toggleTheme}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                {theme === 'dark' ? 'Dark' : 'Light'}
              </button>
            </div>
          </section>

          {/* Calendars */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Calendars</h3>
              {loading && <RefreshCw className="h-3 w-3 animate-spin text-slate-600" />}
            </div>

            {!loading && calendars.length === 0 && (
              <p className="text-xs text-slate-600">No calendars found.</p>
            )}

            <div className="space-y-1.5">
              {calendars.map((cal) => (
                <label
                  key={cal.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-800 px-4 py-2.5 cursor-pointer hover:bg-slate-800/50"
                >
                  <input
                    type="checkbox"
                    checked={enabledCalendars.includes(cal.id)}
                    onChange={() => toggleCalendar(cal.id)}
                    className="rounded border-slate-600 text-cyan-600 focus:ring-cyan-600"
                  />
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{cal.name}</p>
                    {cal.id !== cal.name && (
                      <p className="text-[10px] text-slate-600 truncate">{cal.id}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {calendars.length > 0 && (
              <p className="mt-2 text-[11px] text-slate-600">
                Only selected calendars will sync and appear in the calendar view.
              </p>
            )}
          </section>

          {/* Task Lists */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Task Lists</h3>
              {loading && <RefreshCw className="h-3 w-3 animate-spin text-slate-600" />}
            </div>

            {!loading && taskLists.length === 0 && (
              <p className="text-xs text-slate-600">No task lists found.</p>
            )}

            <div className="space-y-1.5">
              {taskLists.map((list) => (
                <label
                  key={list.id || list.name}
                  className="flex items-center gap-3 rounded-lg border border-slate-800 px-4 py-2.5 cursor-pointer hover:bg-slate-800/50"
                >
                  <input
                    type="checkbox"
                    checked={enabledTaskLists.includes(list.name)}
                    onChange={() => toggleTaskList(list.name)}
                    className="rounded border-slate-600 text-cyan-600 focus:ring-cyan-600"
                  />
                  <ListChecks className="h-3.5 w-3.5 text-slate-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{list.name}</p>
                  </div>
                </label>
              ))}
            </div>

            {taskLists.length > 0 && (
              <p className="mt-2 text-[11px] text-slate-600">
                Only selected task lists will sync and appear in the tasks view.
              </p>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-xs text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-cyan-600 px-4 py-2 text-xs text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
