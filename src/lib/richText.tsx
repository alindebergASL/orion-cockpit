import React from 'react';

/**
 * Parse text for #tags, @mentions, >dates, and [[backlinks]].
 * Renders them as styled, clickable spans.
 */
export function renderRichText(
  text: string,
  onTagClick?: (tag: string) => void,
  onMentionClick?: (mention: string) => void,
  onBacklinkClick?: (title: string) => void,
): React.ReactNode {
  // Match #tags, @mentions, >dates, and [[backlinks]]
  const pattern = /(\[\[[^\]]+\]\])|(#\w[\w-]*)|(@\w[\w-]*)|(>\d{4}-\d{2}-\d{2})|(>today)|(>tomorrow)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const full = match[0];

    if (full.startsWith('[[') && full.endsWith(']]')) {
      const title = full.slice(2, -2);
      parts.push(
        <button
          key={`${match.index}-link`}
          onClick={(e) => { e.stopPropagation(); onBacklinkClick?.(title); }}
          className="inline text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer"
        >
          {title}
        </button>
      );
    } else if (full.startsWith('#')) {
      const tag = full.slice(1);
      parts.push(
        <button
          key={`${match.index}-tag`}
          onClick={(e) => { e.stopPropagation(); onTagClick?.(tag); }}
          className="inline text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer"
        >
          {full}
        </button>
      );
    } else if (full.startsWith('@')) {
      const mention = full.slice(1);
      parts.push(
        <button
          key={`${match.index}-mention`}
          onClick={(e) => { e.stopPropagation(); onMentionClick?.(mention); }}
          className="inline text-purple-400 hover:text-purple-300 hover:underline cursor-pointer"
        >
          {full}
        </button>
      );
    } else if (full.startsWith('>')) {
      const dateStr = full.slice(1);
      let label = dateStr;
      if (dateStr === 'today') label = 'today';
      else if (dateStr === 'tomorrow') label = 'tomorrow';
      else {
        try {
          label = new Date(dateStr + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
        } catch { /* use raw */ }
      }
      parts.push(
        <span
          key={`${match.index}-date`}
          className="inline-flex items-center gap-0.5 rounded bg-amber-600/15 px-1.5 py-0.5 text-amber-400 text-[11px] font-medium"
        >
          {`→ ${label}`}
        </span>
      );
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
