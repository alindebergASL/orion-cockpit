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
  const [weatherLocation, setWeatherLocation] = useState('');
  const [chatMode, setChatMode] = useState('openclaw');
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

        setWeatherLocation((settings.weather_location as string) || '');
        setChatMode((settings.chat_mode as string) || 'openclaw');
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
        api.updateSetting('chat_mode', chatMode),
        weatherLocation ? api.updateSetting('weather_location', weatherLocation) : Promise.resolve(),
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
        className="w-11/12 max-w-md rounded-xl border border-th-border-strong bg-th-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-th-border px-5 py-4">
          <h2 className="text-sm font-semibold text-th-text">Settings</h2>
          <button onClick={onClose} className="rounded p-1 text-th-text-secondary hover:text-th-text-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[32rem] overflow-y-auto p-5 space-y-6">
          {/* Theme */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-th-text-secondary">Appearance</h3>
            <div className="flex items-center justify-between rounded-lg border border-th-border px-4 py-3">
              <span className="text-sm text-th-text-secondary">Theme</span>
              <button
                onClick={toggleTheme}
                className="rounded-lg border border-th-border-strong px-3 py-1.5 text-xs text-th-text-secondary hover:bg-th-elevated"
              >
                {theme === 'dark' ? 'Dark' : 'Light'}
              </button>
            </div>
          </section>

          {/* Chat Brain */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-th-text-secondary">Chat Engine</h3>
            <div className="space-y-1.5">
              <label className="flex items-center gap-3 rounded-lg border border-th-border px-4 py-2.5 cursor-pointer hover:bg-th-elevated/50">
                <input
                  type="radio"
                  name="chatMode"
                  checked={chatMode === 'openclaw'}
                  onChange={() => setChatMode('openclaw')}
                  className="text-cyan-600 focus:ring-cyan-600"
                />
                <div>
                  <p className="text-sm text-th-text">OpenClaw (Recommended)</p>
                  <p className="text-[10px] text-th-text-muted">Direct agent with full tool access, memory, and personality</p>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-th-border px-4 py-2.5 cursor-pointer hover:bg-th-elevated/50">
                <input
                  type="radio"
                  name="chatMode"
                  checked={chatMode === 'llm'}
                  onChange={() => setChatMode('llm')}
                  className="text-cyan-600 focus:ring-cyan-600"
                />
                <div>
                  <p className="text-sm text-th-text">LLM (Fallback)</p>
                  <p className="text-[10px] text-th-text-muted">OpenRouter/Anthropic with limited tools. Faster but less capable.</p>
                </div>
              </label>
            </div>
          </section>

          {/* Weather Location */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-th-text-secondary">Weather</h3>
            <div className="rounded-lg border border-th-border px-4 py-3">
              <label className="mb-1.5 block text-[11px] text-th-text-secondary">Location</label>
              <input
                value={weatherLocation}
                onChange={(e) => setWeatherLocation(e.target.value)}
                placeholder="e.g. Redwood City, CA"
                className="w-full rounded-md border border-th-border-strong bg-th-input px-3 py-2 text-base md:text-sm text-th-text outline-none focus:border-cyan-600"
              />
              <p className="mt-1.5 text-[10px] text-th-text-muted">Leave blank for default (Redwood City, CA)</p>
            </div>
          </section>

          {/* Calendars */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-th-text-secondary">Calendars</h3>
              {loading && <RefreshCw className="h-3 w-3 animate-spin text-th-text-muted" />}
            </div>

            {!loading && calendars.length === 0 && (
              <p className="text-xs text-th-text-muted">No calendars found.</p>
            )}

            <div className="space-y-1.5">
              {calendars.map((cal) => (
                <label
                  key={cal.id}
                  className="flex items-center gap-3 rounded-lg border border-th-border px-4 py-2.5 cursor-pointer hover:bg-th-elevated/50"
                >
                  <input
                    type="checkbox"
                    checked={enabledCalendars.includes(cal.id)}
                    onChange={() => toggleCalendar(cal.id)}
                    className="rounded border-slate-600 text-cyan-600 focus:ring-cyan-600"
                  />
                  <Calendar className="h-3.5 w-3.5 text-th-text-secondary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-th-text truncate">{cal.name}</p>
                    {cal.id !== cal.name && (
                      <p className="text-[10px] text-th-text-muted truncate">{cal.id}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {calendars.length > 0 && (
              <p className="mt-2 text-[11px] text-th-text-muted">
                Only selected calendars will sync and appear in the calendar view.
              </p>
            )}
          </section>

          {/* Task Lists */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-th-text-secondary">Task Lists</h3>
              {loading && <RefreshCw className="h-3 w-3 animate-spin text-th-text-muted" />}
            </div>

            {!loading && taskLists.length === 0 && (
              <p className="text-xs text-th-text-muted">No task lists found.</p>
            )}

            <div className="space-y-1.5">
              {taskLists.map((list) => (
                <label
                  key={list.id || list.name}
                  className="flex items-center gap-3 rounded-lg border border-th-border px-4 py-2.5 cursor-pointer hover:bg-th-elevated/50"
                >
                  <input
                    type="checkbox"
                    checked={enabledTaskLists.includes(list.name)}
                    onChange={() => toggleTaskList(list.name)}
                    className="rounded border-slate-600 text-cyan-600 focus:ring-cyan-600"
                  />
                  <ListChecks className="h-3.5 w-3.5 text-th-text-secondary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-th-text truncate">{list.name}</p>
                  </div>
                </label>
              ))}
            </div>

            {taskLists.length > 0 && (
              <p className="mt-2 text-[11px] text-th-text-muted">
                Only selected task lists will sync and appear in the tasks view.
              </p>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-th-border px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-xs text-th-text-secondary hover:text-th-text"
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
