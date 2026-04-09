export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface CanvasEvent {
  action: 'beginRendering' | 'surfaceUpdate' | 'dataModelUpdate' | 'deleteSurface';
  surfaceId?: string;
  html?: string;
  data?: Record<string, unknown>;
}

export interface CanvasSurface {
  id: string;
  html: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  calendar: string;
  location?: string;
  description?: string;
  allDay?: boolean;
}

export interface Task {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  description?: string;
}

export type TabId = 'chat' | 'calendar' | 'tasks' | 'notes';
