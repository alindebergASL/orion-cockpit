import { useRef, useEffect } from 'react';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import type { CanvasSurface } from '../../types';

interface Props {
  surfaces: CanvasSurface[];
  visible: boolean;
  onClose: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

export function CanvasPanel({ surfaces, visible, onClose, expanded, onToggleExpand }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activeSurface = surfaces[surfaces.length - 1];

  useEffect(() => {
    if (!iframeRef.current || !activeSurface?.html) return;
    iframeRef.current.srcdoc = wrapHtml(activeSurface.html);
  }, [activeSurface?.html]);

  if (!visible || surfaces.length === 0) return null;

  return (
    <div
      className={`flex flex-col border-l border-slate-800 bg-slate-900 transition-all ${
        expanded ? 'w-2/3' : 'w-2/5'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <span className="text-xs font-medium text-slate-400">Canvas</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleExpand}
            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* iframe */}
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts allow-same-origin"
        className="flex-1 bg-white"
        title="OpenClaw Canvas"
      />
    </div>
  );
}

function wrapHtml(html: string): string {
  // If the content already has <html> or <body>, use as-is
  if (/<html/i.test(html)) return html;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>${html}</body>
</html>`;
}
