import {
  X,
  CalendarDays,
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import type { Insight } from '../types';
import { trackActivity } from '../lib/activity';

interface Props {
  insights: Insight[];
  onClose: () => void;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: number) => void;
  onActOn: (id: number) => void;
  onNavigate: (tab: string) => void;
}

const typeIcons: Record<string, React.FC<{ className?: string }>> = {
  calendar_conflict: CalendarDays,
  overdue_task: AlertTriangle,
  suggestion: Lightbulb,
  pattern: TrendingUp,
  briefing: Lightbulb,
};

const typeColors: Record<string, string> = {
  calendar_conflict: 'text-amber-400',
  overdue_task: 'text-red-400',
  suggestion: 'text-cyan-400',
  pattern: 'text-emerald-400',
  briefing: 'text-cyan-400',
};

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationPanel({
  insights,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
  onActOn,
  onNavigate,
}: Props) {
  const handleAct = (insight: Insight) => {
    onActOn(insight.id);
    trackActivity('insight_acted_on', { insightId: insight.id, title: insight.title });
    if (insight.actionData && typeof insight.actionData === 'object' && 'tab' in insight.actionData) {
      onNavigate(insight.actionData.tab as string);
    }
  };

  const handleDismiss = (insight: Insight) => {
    onDismiss(insight.id);
    trackActivity('insight_dismissed', { insightId: insight.id, title: insight.title });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30" onClick={onClose}>
      <div
        className="mt-12 mr-2 w-80 max-h-[80vh] rounded-xl border border-th-border-strong bg-th-surface shadow-2xl overflow-hidden md:mt-4 md:mr-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-th-border px-4 py-3">
          <h3 className="text-sm font-semibold text-th-text">Notifications</h3>
          <div className="flex items-center gap-2">
            {insights.some((i) => !i.read) && (
              <button
                onClick={onMarkAllRead}
                className="text-[11px] text-cyan-400 hover:text-cyan-300"
              >
                Mark all read
              </button>
            )}
            <button onClick={onClose} className="rounded p-1 text-th-text-secondary hover:text-th-text">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Insights list */}
        <div className="overflow-y-auto max-h-[calc(80vh-48px)]">
          {insights.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-th-text-muted">
              No notifications yet. OpenClaw is thinking...
            </div>
          ) : (
            insights.map((insight) => {
              const Icon = typeIcons[insight.type] || Lightbulb;
              const iconColor = typeColors[insight.type] || 'text-cyan-400';

              return (
                <div
                  key={insight.id}
                  className={`border-b border-th-border px-4 py-3 ${!insight.read ? 'bg-cyan-600/5' : ''}`}
                  onClick={() => { if (!insight.read) onMarkRead(insight.id); }}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconColor}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${!insight.read ? 'font-medium text-th-text' : 'text-th-text-secondary'}`}>
                          {insight.title}
                        </p>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDismiss(insight); }}
                          className="shrink-0 rounded p-0.5 text-th-text-muted hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="mt-0.5 text-xs text-th-text-muted leading-relaxed">{insight.body}</p>
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className="text-[10px] text-th-text-muted">{timeAgo(insight.createdAt)}</span>
                        {insight.actionType && !insight.actedOn && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAct(insight); }}
                            className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Take action
                          </button>
                        )}
                        {insight.priority === 'high' && (
                          <span className="text-[10px] font-medium text-red-400">High priority</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
