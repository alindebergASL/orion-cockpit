import { mkdirSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { randomBytes } from 'crypto';

const MANAGED_WARNING = '<!-- This file is managed by Cockpit. Manual edits may be overwritten. -->';

// ── Slug helpers ──────────────────────────────────────────

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

export function projectFolderName(id: number, slug: string): string {
  return `${id}-${slug}`;
}

function assertSafeSegment(segment: string): void {
  if (segment.includes('..') || segment.includes('/') || segment.includes('\\')) {
    throw new Error(`Unsafe path segment: ${segment}`);
  }
}

// ── Atomic write ──────────────────────────────────────────

function atomicWrite(filePath: string, content: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${basename(filePath)}.${randomBytes(4).toString('hex')}.tmp`);
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, filePath);
}

// ── YAML frontmatter ──────────────────────────────────────

function yamlValue(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return `[${v.map((item) => yamlValue(item)).join(', ')}]`;
  }
  const s = String(v);
  if (/[:#\[\]{}&*!|>'"%@`,\n]/.test(s) || s.trim() !== s || s === '') {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

function buildFrontmatter(fields: [string, unknown][]): string {
  const lines = fields.map(([key, val]) => `${key}: ${yamlValue(val)}`);
  return `---\n${lines.join('\n')}\n---`;
}

// ── Project folder ────────────────────────────────────────

export function ensureProjectFolder(vaultPath: string, folderName: string): void {
  assertSafeSegment(folderName);
  mkdirSync(join(vaultPath, 'Projects', folderName, 'notes'), { recursive: true });
}

// ── project.md ────────────────────────────────────────────

export interface ProjectVaultData {
  id: number;
  title: string;
  description: string;
  status: string;
  targetDate: string | null;
  tags: string[];
  icon: string | null;
  color: string | null;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export function writeProjectMd(vaultPath: string, folderName: string, p: ProjectVaultData): void {
  assertSafeSegment(folderName);
  const fm = buildFrontmatter([
    ['type', 'project'],
    ['cockpit_id', p.id],
    ['title', p.title],
    ['status', p.status],
    ['target_date', p.targetDate],
    ['tags', p.tags],
    ['icon', p.icon],
    ['color', p.color],
    ['owner', p.owner],
    ['created', p.createdAt],
    ['updated', p.updatedAt],
  ]);

  const body = [
    fm,
    '',
    MANAGED_WARNING,
    `# ${p.title}`,
    '',
    '## Description',
    p.description || '',
    '',
    '## Current next action',
    'TBD',
    '',
    '## Links',
    '',
  ].join('\n');

  atomicWrite(join(vaultPath, 'Projects', folderName, 'project.md'), body);
}

// ── tasks.md ──────────────────────────────────────────────

export interface TaskVaultData {
  title: string;
  status: string;
  assignee: string | null;
}

export function writeProjectTasksMd(
  vaultPath: string,
  folderName: string,
  tasks: TaskVaultData[],
): void {
  assertSafeSegment(folderName);
  const lines = [
    '---',
    'type: project_tasks',
    '---',
    '',
    MANAGED_WARNING,
    '# Tasks',
    '',
  ];

  for (const t of tasks) {
    const check = t.status === 'completed' ? 'x' : ' ';
    const assignee = t.assignee ? ` @${t.assignee}` : '';
    lines.push(`- [${check}] ${t.title}${assignee}`);
  }

  if (tasks.length === 0) lines.push('_No tasks yet._');
  lines.push('');

  atomicWrite(join(vaultPath, 'Projects', folderName, 'tasks.md'), lines.join('\n'));
}

// ── updates.md ────────────────────────────────────────────

export interface UpdateVaultData {
  content: string;
  createdAt: string;
}

export function writeProjectUpdatesMd(
  vaultPath: string,
  folderName: string,
  updates: UpdateVaultData[],
): void {
  assertSafeSegment(folderName);
  const lines = [
    '---',
    'type: project_updates',
    '---',
    '',
    MANAGED_WARNING,
    '# Progress Updates',
    '',
  ];

  for (const u of updates) {
    const date = u.createdAt.slice(0, 10);
    lines.push(`### ${date}`);
    lines.push(u.content);
    lines.push('');
  }

  if (updates.length === 0) lines.push('_No updates yet._');
  lines.push('');

  atomicWrite(join(vaultPath, 'Projects', folderName, 'updates.md'), lines.join('\n'));
}

// ── project notes ─────────────────────────────────────────

export interface NoteVaultData {
  id: number;
  projectId: number;
  projectTitle: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export function writeProjectNoteMd(
  vaultPath: string,
  folderName: string,
  noteSlug: string,
  note: NoteVaultData,
): void {
  assertSafeSegment(folderName);
  assertSafeSegment(noteSlug);

  const fm = buildFrontmatter([
    ['type', 'project_note'],
    ['cockpit_id', note.id],
    ['project_id', note.projectId],
    ['project', `[[${note.projectTitle}]]`],
    ['title', note.title],
    ['created', note.createdAt],
    ['updated', note.updatedAt],
  ]);

  const body = [fm, '', MANAGED_WARNING, `# ${note.title || 'Untitled'}`, '', note.content, ''].join('\n');

  atomicWrite(join(vaultPath, 'Projects', folderName, 'notes', `${noteSlug}.md`), body);
}

// ── Archive (soft delete) ─────────────────────────────────

export function archivePath(vaultPath: string, relativePath: string): void {
  const src = join(vaultPath, relativePath);
  if (!existsSync(src)) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = basename(relativePath);
  const trashDir = join(vaultPath, '.trash');
  mkdirSync(trashDir, { recursive: true });
  renameSync(src, join(trashDir, `${timestamp}-${name}`));
}

// ── Root _index.md ────────────────────────────────────────

export interface ProjectIndexEntry {
  id: number;
  title: string;
  status: string;
  slug: string;
  vaultPath: string;
}

export function writeVaultIndex(vaultPath: string, projects: ProjectIndexEntry[]): void {
  const grouped: Record<string, ProjectIndexEntry[]> = {
    active: [],
    paused: [],
    completed: [],
  };
  for (const p of projects) {
    const bucket = grouped[p.status] || grouped['active'];
    bucket.push(p);
  }

  const lines = [MANAGED_WARNING, '', '# Orion Cockpit Vault', ''];

  const sections: [string, string][] = [
    ['Active Projects', 'active'],
    ['Paused Projects', 'paused'],
    ['Completed Projects', 'completed'],
  ];

  for (const [heading, key] of sections) {
    const items = grouped[key];
    if (items.length === 0) continue;
    lines.push(`## ${heading}`);
    for (const p of items) {
      lines.push(`- [[Projects/${p.vaultPath}/project|${p.title}]]`);
    }
    lines.push('');
  }

  atomicWrite(join(vaultPath, '_index.md'), lines.join('\n'));
}

// ── Backfill helper ───────────────────────────────────────

export { slugify as slugifyTitle };
