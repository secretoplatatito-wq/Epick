import type {
  AspectRatioProfile,
  FeedbackSubmission,
  ProviderDefinition,
  VisualOverlayConfig,
  VisualReferenceItem,
  WorkspaceProject,
} from '../../backend/types';

export interface SessionInfo {
  authenticated: boolean;
  mcpEndpoint: string;
  mcpToken: string;
  protocolVersion: string;
}

export interface SamplePresetItem {
  id: string;
  label: string;
  category: string;
}

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('x-clippah-studio', '1');
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    const errObj = data as { message?: string; error?: string };
    throw new Error(errObj.message || errObj.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function fetchSessionInfo(): Promise<SessionInfo> {
  return apiFetch<SessionInfo>('/api/auth/session/');
}

export function fetchProviders(): Promise<{ providers: ProviderDefinition[] }> {
  return apiFetch<{ providers: ProviderDefinition[] }>('/api/providers/');
}

export function fetchReferences(): Promise<{ references: VisualReferenceItem[] }> {
  return apiFetch<{ references: VisualReferenceItem[] }>('/api/references/');
}

export function fetchSamples(): Promise<{ samples: SamplePresetItem[] }> {
  return apiFetch<{ samples: SamplePresetItem[] }>('/api/samples/');
}

export function fetchWorkspaces(): Promise<{ workspaces: Array<WorkspaceProject & { links?: Record<string, string> }> }> {
  return apiFetch('/api/workspace/');
}

export function createWorkspaceApi(params: {
  title?: string;
  category?: string;
  instruction?: string;
  aspectRatio?: AspectRatioProfile;
  referenceId?: string;
}): Promise<{ workspace: WorkspaceProject; links: { workspace: string; preview: string; download: string } }> {
  return apiFetch('/api/workspace/create/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function updateWorkspaceApi(
  uuid: string,
  patch: Partial<WorkspaceProject>
): Promise<{ workspace: WorkspaceProject; links: { workspace: string; preview: string; download: string } }> {
  return apiFetch(`/api/workspace/${encodeURIComponent(uuid)}/`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteWorkspaceApi(uuid: string): Promise<{ deleted: boolean }> {
  return apiFetch(`/api/workspace/${encodeURIComponent(uuid)}/`, {
    method: 'DELETE',
  });
}

export function attachSampleVideoApi(uuid: string, presetId: string): Promise<{ workspace: WorkspaceProject }> {
  return apiFetch('/api/video/sample/', {
    method: 'POST',
    body: JSON.stringify({ uuid, presetId }),
  });
}

export function uploadVideoFileApi(uuid: string, file: File): Promise<{ workspace: WorkspaceProject }> {
  const form = new FormData();
  form.append('uuid', uuid);
  form.append('video', file);
  return apiFetch('/api/video/upload/', {
    method: 'POST',
    body: form,
  });
}

export function analyzeVideoApi(params: {
  uuid: string;
  targetClipCount?: number;
  category?: string;
  instruction?: string;
}): Promise<{ workspace: WorkspaceProject; links: { workspace: string; preview: string; download: string } }> {
  return apiFetch('/api/video/analyze/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function editClipApi(
  uuid: string,
  clipId: string,
  updates: Record<string, unknown>
): Promise<{ workspace: WorkspaceProject }> {
  return apiFetch('/api/video/clips/', {
    method: 'POST',
    body: JSON.stringify({ uuid, clipId, updates }),
  });
}

export function sortClipsApi(uuid: string, order: 'countdown' | 'top-first'): Promise<{ workspace: WorkspaceProject }> {
  return apiFetch('/api/video/ranking/', {
    method: 'POST',
    body: JSON.stringify({ uuid, order }),
  });
}

export function regenerateTitleApi(uuid: string): Promise<{ title: string; candidates: string[]; workspace: WorkspaceProject }> {
  return apiFetch('/api/ai/title/', {
    method: 'POST',
    body: JSON.stringify({ uuid }),
  });
}

export function renderVideoApi(params: {
  uuid: string;
  aspectRatio?: AspectRatioProfile;
  referenceId?: string;
}): Promise<{ workspace: WorkspaceProject; links: { workspace: string; preview: string; download: string } }> {
  return apiFetch('/api/video/render/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function analyzeImageApi(params: {
  base64Data: string;
  mimeType: string;
  prompt?: string;
}): Promise<{
  analysis: string;
  suggestedOverlay: Partial<VisualOverlayConfig>;
  modelUsed: string;
  fallbackNotice?: string;
}> {
  return apiFetch('/api/ai/visual-analysis/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function generateImageApi(params: {
  prompt: string;
  aspectRatio: string;
}): Promise<{ imageDataUrl: string; modelUsed: string; fallbackNotice?: string }> {
  return apiFetch('/api/ai/generate-image/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function animateImageApi(params: {
  base64Data: string;
  mimeType: string;
  prompt: string;
  aspectRatio: '16:9' | '9:16';
}): Promise<{ videoDataUrl: string; modelUsed: string; fallbackNotice?: string }> {
  return apiFetch('/api/ai/animate-image/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function searchTrendsApi(query: string): Promise<{
  summary: string;
  sources: Array<{ title: string; uri: string }>;
  model: string;
}> {
  return apiFetch('/api/ai/search-trends/', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export function deepStrategyApi(params: {
  prompt: string;
  category: string;
  clipsContext: string;
}): Promise<{ strategy: string; modelUsed: string; fallbackNotice?: string }> {
  return apiFetch('/api/ai/deep-strategy/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function callMcpRpcApi(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return apiFetch('/api/mcp/', {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });
}

export function fetchFeedbackList(): Promise<{ submissions: FeedbackSubmission[] }> {
  return apiFetch('/api/review-feedback/');
}

export function submitFeedbackApi(payload: {
  rating: number;
  category: FeedbackSubmission['category'];
  comment: string;
  issueDescription?: string;
  projectUuid?: string;
  website?: string;
}): Promise<{ success: boolean; message: string; submission: FeedbackSubmission }> {
  return apiFetch('/api/review-feedback/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
