import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { WorkspaceProject, AspectRatioProfile, RankingCategory } from '../types';
import { getReferenceById } from '../../ai/visualReferences';

const DATA_ROOT = path.resolve(process.cwd(), '.clippah_data');
const WORKSPACES_DIR = path.join(DATA_ROOT, 'workspaces');
const DB_FILE = path.join(DATA_ROOT, 'workspaces.json');

function ensureStorageDirs() {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
}

function readDb(): Record<string, WorkspaceProject> {
  ensureStorageDirs();
  if (!fs.existsSync(DB_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) as Record<string, WorkspaceProject>;
  } catch {
    return {};
  }
}

function writeDb(data: Record<string, WorkspaceProject>) {
  ensureStorageDirs();
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function getWorkspaceDir(uuid: string): string {
  ensureStorageDirs();
  const safeId = uuid.replace(/[^a-zA-Z0-9:-]/g, '');
  const dir = path.join(WORKSPACES_DIR, safeId);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'keyframes'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'clips'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'output'), { recursive: true });
  return dir;
}

export function createWorkspace(params: {
  ownerId: string;
  title?: string;
  category?: RankingCategory;
  instruction?: string;
  aspectRatio?: AspectRatioProfile;
  referenceId?: string;
}): WorkspaceProject {
  const db = readDb();
  const uuid = crypto.randomUUID();
  const now = new Date().toISOString();
  const ref = getReferenceById(params.referenceId);
  const aspectRatio = params.aspectRatio ?? ref.attributes.aspectRatio ?? '9:16';

  const project: WorkspaceProject = {
    uuid,
    ownerId: params.ownerId,
    title: params.title?.trim() || 'Untitled Ranking Compilation',
    viralTitleCandidates: [],
    description: 'Automated AI clipping and countdown project.',
    category: params.category || 'Funniest Animal Moments',
    instruction:
      params.instruction?.trim() ||
      'Find the funniest 10 moments in this video, rank them from #10 to #1, choose a viral title, add ranking numbers and captions, and render a finished vertical video.',
    createdAt: now,
    updatedAt: now,
    scenes: [],
    keyframes: [],
    clips: [],
    overlayConfig: {
      referenceId: ref.id,
      aspectRatio,
      titlePlacement: ref.attributes.titlePlacement,
      rankingBadgePlacement: ref.attributes.rankingBadgePlacement,
      captionPlacement: ref.attributes.captionPlacement,
      accentColor: '#f97316',
      fontFamily: 'Outfit',
      backgroundTreatment: ref.attributes.backgroundTreatment,
      showRankingNumber: true,
      showCaptions: true,
      includeMusicBed: true,
    },
    referenceImageUrls: [ref.imageUrl],
    exportMetadata: {
      renderStatus: 'idle',
      progressPct: 0,
      exportProfile: aspectRatio,
    },
  };

  getWorkspaceDir(uuid);
  db[uuid] = project;
  writeDb(db);
  return project;
}

export function getWorkspace(uuid: string): WorkspaceProject | null {
  const db = readDb();
  return db[uuid] ?? null;
}

export function listWorkspaces(ownerId?: string): WorkspaceProject[] {
  const db = readDb();
  const all = Object.values(db);
  const filtered = ownerId ? all.filter((w) => w.ownerId === ownerId || w.ownerId === 'studio-public') : all;
  return filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function updateWorkspace(
  uuid: string,
  updater: Partial<WorkspaceProject> | ((prev: WorkspaceProject) => WorkspaceProject)
): WorkspaceProject | null {
  const db = readDb();
  const existing = db[uuid];
  if (!existing) return null;

  const next: WorkspaceProject =
    typeof updater === 'function'
      ? updater(existing)
      : {
          ...existing,
          ...updater,
          uuid: existing.uuid,
          ownerId: existing.ownerId,
          updatedAt: new Date().toISOString(),
        };

  next.updatedAt = new Date().toISOString();
  db[uuid] = next;
  writeDb(db);
  return next;
}

export function deleteWorkspace(uuid: string): boolean {
  const db = readDb();
  if (!db[uuid]) return false;
  delete db[uuid];
  writeDb(db);
  const dir = path.join(WORKSPACES_DIR, uuid.replace(/[^a-zA-Z0-9:-]/g, ''));
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return true;
}

export function listWorkspaceFiles(uuid: string): { name: string; relativePath: string; sizeBytes: number }[] {
  const dir = getWorkspaceDir(uuid);
  const results: { name: string; relativePath: string; sizeBytes: number }[] = [];

  function walk(current: string, prefix: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        const st = fs.statSync(full);
        results.push({ name: entry.name, relativePath: rel, sizeBytes: st.size });
      }
    }
  }

  walk(dir, '');
  return results;
}
