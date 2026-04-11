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
  id: string | number;
  title: string;
  start: string;
  end: string;
  calendar: string;
  location?: string;
  description?: string;
  allDay?: boolean;
}

export interface Task {
  id: string | number;
  title: string;
  status: 'open' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  description?: string;
  listName?: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  updatedAt: string;
}

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
}

export interface Conversation {
  id: number;
  title: string;
  tab: string;
  createdAt: string;
  updatedAt: string;
}

export type TabId = 'home' | 'chat' | 'calendar' | 'tasks' | 'notes';
