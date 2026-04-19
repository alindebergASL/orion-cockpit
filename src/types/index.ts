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
  externalId?: string | null;
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

export interface SearchResult {
  type: 'event' | 'task' | 'note' | 'journal' | 'chat' | 'insight';
  id: number | string;
  title: string;
  snippet: string;
  date?: string;
  meta?: Record<string, unknown>;
}

export interface Insight {
  id: number;
  type: string;
  title: string;
  body: string;
  actionType?: string | null;
  actionData?: Record<string, unknown> | null;
  priority: string;
  read: boolean;
  actedOn: boolean;
  createdAt: string;
  expiresAt?: string | null;
}

export interface Conversation {
  id: number;
  title: string;
  tab: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: number;
  title: string;
  description: string;
  status: 'active' | 'paused' | 'completed';
  targetDate?: string | null;
  tags: string[];
  icon?: string | null;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
  completedTaskCount: number;
}

export interface ProjectDigest {
  health: 'on_track' | 'at_risk' | 'needs_attention';
  summary: string;
  nextAction: string;
  blockers: string[];
}

export interface ProjectTask {
  id: number;
  title: string;
  status: 'open' | 'completed';
  assignee?: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ProjectUpdate {
  id: number;
  content: string;
  createdAt: string;
}

export interface Template {
  id: number;
  name: string;
  type: 'daily' | 'weekly' | 'meeting' | 'project' | 'custom';
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends Project {
  tasks: ProjectTask[];
  updates: ProjectUpdate[];
}

export type TabId = 'today' | 'chat' | 'calendar' | 'tasks' | 'notes' | 'projects';
