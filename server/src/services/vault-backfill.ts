import { getDb } from '../db.js';
import { config } from '../config.js';
import {
  slugify,
  projectFolderName,
  ensureProjectFolder,
  writeProjectMd,
  writeProjectTasksMd,
  writeProjectUpdatesMd,
  writeProjectNoteMd,
  writeVaultIndex,
  type ProjectVaultData,
} from './vault.js';

export function backfillVault(): void {
  try {
    const projects = getDb()
      .prepare('SELECT id, user_id, title, description, status, target_date, tags, icon, color, slug, vault_path, created_at, updated_at FROM projects WHERE slug IS NULL')
      .all() as Record<string, unknown>[];

    if (projects.length === 0) {
      writeIndexFromAll();
      return;
    }

    console.log(`Vault: backfilling ${projects.length} project(s)…`);

    for (const p of projects) {
      const slug = slugify(p.title as string);
      const folder = projectFolderName(p.id as number, slug);

      getDb().prepare('UPDATE projects SET slug = ?, vault_path = ? WHERE id = ?')
        .run(slug, folder, p.id);

      const user = getDb().prepare('SELECT display_name FROM users WHERE id = ?')
        .get(p.user_id) as { display_name: string } | undefined;

      const tags = p.tags ? (p.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean) : [];

      ensureProjectFolder(config.vaultPath, folder);

      const vaultData: ProjectVaultData = {
        id: p.id as number,
        title: p.title as string,
        description: p.description as string,
        status: p.status as string,
        targetDate: (p.target_date as string) || null,
        tags,
        icon: (p.icon as string) || null,
        color: (p.color as string) || null,
        owner: user?.display_name || 'Unknown',
        createdAt: p.created_at as string,
        updatedAt: p.updated_at as string,
      };

      writeProjectMd(config.vaultPath, folder, vaultData);

      const tasks = getDb()
        .prepare('SELECT title, status, assignee FROM project_tasks WHERE project_id = ? ORDER BY sort_order ASC, id ASC')
        .all(p.id) as { title: string; status: string; assignee: string | null }[];
      writeProjectTasksMd(config.vaultPath, folder, tasks);

      const updates = getDb()
        .prepare('SELECT content, created_at FROM project_updates WHERE project_id = ? ORDER BY created_at DESC')
        .all(p.id) as { content: string; created_at: string }[];
      writeProjectUpdatesMd(config.vaultPath, folder, updates.map((u) => ({
        content: u.content, createdAt: u.created_at,
      })));

      const notes = getDb()
        .prepare('SELECT id, title, content, slug, created_at, updated_at FROM project_notes WHERE project_id = ?')
        .all(p.id) as { id: number; title: string; content: string; slug: string | null; created_at: string; updated_at: string }[];

      for (const n of notes) {
        const noteSlug = n.slug || slugify(n.title || 'untitled');
        if (!n.slug) {
          getDb().prepare('UPDATE project_notes SET slug = ?, vault_path = ? WHERE id = ?')
            .run(noteSlug, `${noteSlug}.md`, n.id);
        }
        writeProjectNoteMd(config.vaultPath, folder, noteSlug, {
          id: n.id,
          projectId: p.id as number,
          projectTitle: p.title as string,
          title: n.title,
          content: n.content,
          createdAt: n.created_at,
          updatedAt: n.updated_at,
        });
      }
    }

    console.log(`Vault: backfill complete.`);
    writeIndexFromAll();
  } catch (err) {
    console.error('Vault: backfill failed', err);
  }
}

function writeIndexFromAll(): void {
  try {
    const rows = getDb()
      .prepare("SELECT id, title, status, slug, vault_path FROM projects WHERE slug IS NOT NULL")
      .all() as { id: number; title: string; status: string; slug: string; vault_path: string }[];
    writeVaultIndex(config.vaultPath, rows.map((r) => ({
      id: r.id, title: r.title, status: r.status, slug: r.slug, vaultPath: r.vault_path,
    })));
  } catch (err) {
    console.error('Vault: failed to write _index.md', err);
  }
}
