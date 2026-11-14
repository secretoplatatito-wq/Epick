import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Play,
  Download,
  Copy,
  Check,
  Sparkles,
  Film,
  ArrowUpDown,
  Sliders,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type {
  AspectRatioProfile,
  VisualReferenceItem,
  WorkspaceProject,
} from '../../backend/types';
import {
  analyzeVideoApi,
  attachSampleVideoApi,
  editClipApi,
  fetchSamples,
  regenerateTitleApi,
  renderVideoApi,
  sortClipsApi,
  updateWorkspaceApi,
  uploadVideoFileApi,
  type SamplePresetItem,
} from '../lib/api';

const CATEGORIES = [
  'Funniest Animal Moments',
  'Most Unexpected Moments',
  'Craziest Sports Moments',
  'Most Satisfying Videos',
  'Funniest Fails',
  'Most Unbelievable Coincidences',
  'Top 10 Incredible Animal Reactions',
];

const ACCENT_PRESETS = [
  { name: 'Amber', hex: '#f97316', hover: '#ea580c' },
  { name: 'Cyan', hex: '#06b6d4', hover: '#0891b2' },
  { name: 'Emerald', hex: '#10b981', hover: '#059669' },
  { name: 'Crimson', hex: '#ef4444', hover: '#dc2626' },
  { name: 'Indigo', hex: '#6366f1', hover: '#4f46e5' },
];

interface StudioWorkspaceProps {
  workspace: WorkspaceProject | null;
  references: VisualReferenceItem[];
  accentColor: string;
  onChangeAccent: (hex: string, hover: string) => void;
  onWorkspaceUpdated: (ws: WorkspaceProject) => void;
  onOpenHistory: () => void;
}

export const StudioWorkspace: React.FC<StudioWorkspaceProps> = ({
  workspace,
  references,
  accentColor,
  onChangeAccent,
  onWorkspaceUpdated,
  onOpenHistory,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [samples, setSamples] = useState<SamplePresetItem[]>([]);
  const [selectedSample, setSelectedSample] = useState<string>('funny-animals-compilation');
  const [clipCount, setClipCount] = useState<number>(6);
  const [sortOrder, setSortOrder] = useState<'countdown' | 'top-first'>('countdown');
  const [playerMode, setPlayerMode] = useState<'rendered' | 'source'>('source');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [titleDraft, setTitleDraft] = useState<string>(workspace?.title || '');
  const [instructionDraft, setInstructionDraft] = useState<string>(workspace?.instruction || '');
  const [categoryDraft, setCategoryDraft] = useState<string>(workspace?.category || CATEGORIES[0]);

  useEffect(() => {
    fetchSamples()
      .then((res) => {
        setSamples(res.samples);
        if (res.samples[0]) setSelectedSample(res.samples[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (workspace) {
      setTitleDraft(workspace.title);
      setInstructionDraft(workspace.instruction);
      setCategoryDraft(workspace.category);
      if (workspace.exportMetadata.renderStatus === 'completed') {
        setPlayerMode('rendered');
      } else {
        setPlayerMode('source');
      }
    }
  }, [workspace?.uuid, workspace?.title, workspace?.exportMetadata.renderStatus]);

  if (!workspace) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-16 text-center text-slate-400">
        Initializing CLIPPAH workspace...
      </div>
    );
  }

  const hasSource = Boolean(workspace.sourceVideoUrl);
  const isRendered =
    workspace.exportMetadata.renderStatus === 'completed' &&
    Boolean(workspace.exportMetadata.renderedFilePath);

  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const workspaceUrl = `${baseOrigin}/api/workspace/${encodeURIComponent(workspace.uuid)}/`;
  const previewUrl = `${baseOrigin}/api/workspace/${encodeURIComponent(workspace.uuid)}/preview/`;
  const downloadUrl = `${baseOrigin}/api/workspace/${encodeURIComponent(workspace.uuid)}/download/`;

  async function handleCopy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      // Ignore clipboard failure
    }
  }

  async function handleLoadSample() {
    if (!workspace) return;
    setErrorMsg(null);
    setBusyAction('Generating sample compilation MP4...');
    try {
      const res = await attachSampleVideoApi(workspace.uuid, selectedSample);
      onWorkspaceUpdated(res.workspace);
      setPlayerMode('source');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load sample video.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !workspace) return;
    setErrorMsg(null);
    setBusyAction(`Uploading ${file.name}...`);
    try {
      const res = await uploadVideoFileApi(workspace.uuid, file);
      onWorkspaceUpdated(res.workspace);
      setPlayerMode('source');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Video upload failed.');
    } finally {
      setBusyAction(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRunAnalysis() {
    if (!workspace) return;
    setErrorMsg(null);
    setBusyAction('Inspecting video, detecting scenes, extracting keyframes, and ranking moments...');
    try {
      const res = await analyzeVideoApi({
        uuid: workspace.uuid,
        targetClipCount: clipCount,
        category: categoryDraft,
        instruction: instructionDraft,
      });
      onWorkspaceUpdated(res.workspace);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Video analysis failed.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRenderVideo() {
    if (!workspace) return;
    setErrorMsg(null);
    setBusyAction(`Rendering ${workspace.overlayConfig.aspectRatio} MP4 compilation via FFmpeg...`);
    try {
      const res = await renderVideoApi({
        uuid: workspace.uuid,
        aspectRatio: workspace.overlayConfig.aspectRatio,
        referenceId: workspace.overlayConfig.referenceId,
      });
      onWorkspaceUpdated(res.workspace);
      setPlayerMode('rendered');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Video render failed.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveTitle(nextTitle: string) {
    if (!workspace) return;
    setTitleDraft(nextTitle);
    try {
      const res = await updateWorkspaceApi(workspace.uuid, { title: nextTitle });
      onWorkspaceUpdated(res.workspace);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save title.');
    }
  }

  async function handleRegenerateTitles() {
    if (!workspace) return;
    setBusyAction('Generating viral title candidates...');
    setErrorMsg(null);
    try {
      const res = await regenerateTitleApi(workspace.uuid);
      onWorkspaceUpdated(res.workspace);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Title generation failed.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleSort() {
    if (!workspace) return;
    const nextOrder = sortOrder === 'countdown' ? 'top-first' : 'countdown';
    setSortOrder(nextOrder);
    try {
      const res = await sortClipsApi(workspace.uuid, nextOrder);
      onWorkspaceUpdated(res.workspace);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sorting failed.');
    }
  }

  async function handleClipPatch(clipId: string, updates: Record<string, unknown>) {
    if (!workspace) return;
    try {
      const res = await editClipApi(workspace.uuid, clipId, updates);
      onWorkspaceUpdated(res.workspace);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update clip.');
    }
  }

  async function handleRemoveClip(clipId: string) {
    if (!workspace) return;
    const remaining = workspace.clips.filter((c) => c.id !== clipId);
    try {
      const res = await updateWorkspaceApi(workspace.uuid, { clips: remaining });
      onWorkspaceUpdated(res.workspace);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to remove clip.');
    }
  }

  async function handleOverlayPatch(patch: Partial<WorkspaceProject['overlayConfig']>) {
    if (!workspace) return;
    try {
      const res = await updateWorkspaceApi(workspace.uuid, {
        overlayConfig: { ...workspace.overlayConfig, ...patch },
      });
      onWorkspaceUpdated(res.workspace);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save overlay config.');
    }
  }

  async function handleSelectReference(ref: VisualReferenceItem) {
    await handleOverlayPatch({
      referenceId: ref.id,
      titlePlacement: ref.attributes.titlePlacement,
      rankingBadgePlacement: ref.attributes.rankingBadgePlacement,
      captionPlacement: ref.attributes.captionPlacement,
      backgroundTreatment: ref.attributes.backgroundTreatment,
      aspectRatio: ref.attributes.aspectRatio,
    });
  }

  const videoSrc =
    playerMode === 'rendered' && isRendered
      ? `/api/workspace/${encodeURIComponent(workspace.uuid)}/preview/?t=${encodeURIComponent(
          workspace.exportMetadata.renderedAt || workspace.updatedAt
        )}`
      : workspace.sourceVideoUrl || '';

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-8">
      {/* Studio Workspace Context Header */}
      <div className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Workspace</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-300 tabular-nums">{workspace.uuid}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOpenHistory}
              className="text-slate-300 underline decoration-white/20 underline-offset-4 hover:text-white cursor-pointer"
            >
              Switch Workspace
            </button>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {workspace.title}
          </h1>
        </div>

        {/* Studio Accent Color Customizer */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-400">Studio Accent</span>
          <div className="flex items-center gap-1.5" role="group" aria-label="Studio accent colors">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                aria-label={`Set studio accent to ${preset.name}`}
                onClick={() => {
                  onChangeAccent(preset.hex, preset.hover);
                  handleOverlayPatch({ accentColor: preset.hex });
                }}
                style={{ backgroundColor: preset.hex }}
                className={`h-6 w-6 rounded-full transition-transform cursor-pointer ${
                  accentColor === preset.hex ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0B0D12] scale-110' : 'opacity-75 hover:opacity-100'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Busy or Error Banner */}
      {busyAction && (
        <div
          role="status"
          className="mb-6 flex items-center gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-3 text-sm text-white"
        >
          <RefreshCw className="h-4 w-4 animate-spin shrink-0 text-[var(--accent)]" />
          <span>{busyAction}</span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {errorMsg}
        </div>
      )}

      {/* Main 12-Column Responsive Studio Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN (7 cols): Video Import, Player, Reference Styling, Render & Links */}
        <div className="space-y-6 lg:col-span-7">
          {/* 1. Video Import & AI Directive */}
          <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-white">
                01. Video Import & Autonomous Directive
              </h2>
              {workspace.videoMetadata && (
                <span className="font-mono text-xs text-slate-400 tabular-nums">
                  {workspace.videoMetadata.width}x{workspace.videoMetadata.height} · {workspace.videoMetadata.fps}fps ·{' '}
                  {workspace.videoMetadata.durationSec}s
                </span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="studio-category" className="block text-xs font-medium text-slate-400">
                  Ranking Category
                </label>
                <select
                  id="studio-category"
                  value={categoryDraft}
                  onChange={(e) => setCategoryDraft(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3 text-sm text-white focus:border-[var(--accent)] focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="studio-clip-count" className="block text-xs font-medium text-slate-400">
                  Target Ranked Clips
                </label>
                <select
                  id="studio-clip-count"
                  value={clipCount}
                  onChange={(e) => setClipCount(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3 font-mono text-sm text-white focus:border-[var(--accent)] focus:outline-none"
                >
                  {[4, 5, 6, 8, 10].map((n) => (
                    <option key={n} value={n}>
                      Top {n} (#{n} to #1)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <label htmlFor="studio-instruction" className="block text-xs font-medium text-slate-400">
                AI Director Prompt
              </label>
              <input
                id="studio-instruction"
                type="text"
                value={instructionDraft}
                onChange={(e) => setInstructionDraft(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3 text-sm text-white placeholder:text-slate-500 focus:border-[var(--accent)] focus:outline-none"
              />
            </div>

            {/* Source Video Controls */}
            <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={Boolean(busyAction)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#0B0D12] px-4 text-xs font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Upload className="h-4 w-4" />
                Upload Video File
              </button>

              <div className="flex flex-1 items-center gap-2">
                <select
                  aria-label="Choose sample compilation preset"
                  value={selectedSample}
                  onChange={(e) => setSelectedSample(e.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0B0D12] px-3 text-xs text-slate-200 focus:border-[var(--accent)] focus:outline-none"
                >
                  {samples.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  disabled={Boolean(busyAction)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/15 bg-[#1C2232] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#252D42] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Film className="h-3.5 w-3.5" />
                  Load Sample
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-400">
                {workspace.providerUsed
                  ? `Analysis provider: ${workspace.providerUsed}`
                  : 'Ready to inspect via FFmpeg + Gemini'}
              </span>
              <button
                type="button"
                onClick={handleRunAnalysis}
                disabled={!hasSource || Boolean(busyAction)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Sparkles className="h-4 w-4" />
                Analyze & Rank Moments
              </button>
            </div>
          </div>

          {/* 2. HTML5 Video Preview Player */}
          <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-white">
                02. Video Preview Player
              </h2>
              <div className="flex items-center gap-1 rounded-lg bg-[#0B0D12] p-1">
                <button
                  type="button"
                  onClick={() => setPlayerMode('source')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    playerMode === 'source' ? 'bg-[#1C2232] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Source Footage
                </button>
                <button
                  type="button"
                  onClick={() => setPlayerMode('rendered')}
                  disabled={!isRendered}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 ${
                    playerMode === 'rendered' ? 'bg-[var(--accent)] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Rendered Output
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-black">
              {videoSrc ? (
                <video
                  key={videoSrc}
                  src={videoSrc}
                  controls
                  playsInline
                  className="mx-auto max-h-[420px] w-full bg-black object-contain"
                />
              ) : (
                <div className="flex h-64 flex-col items-center justify-center px-6 text-center">
                  <Film className="h-8 w-8 text-slate-600" />
                  <p className="mt-3 text-sm font-medium text-slate-300">
                    No video loaded in this workspace
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Upload an MP4/WebM file or click Load Sample above to begin autonomous clipping.
                  </p>
                </div>
              )}
            </div>

            {/* Verified Workspace / Preview / Download Links */}
            {isRendered && (
              <div className="mt-4 space-y-2.5 border-t border-white/10 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-emerald-400">
                    Render Ready · {workspace.exportMetadata.exportProfile} ·{' '}
                    <span className="font-mono tabular-nums">
                      {Math.round((workspace.exportMetadata.renderedBytes || 0) / 1024)} KB
                    </span>
                  </span>
                  <a
                    href={downloadUrl}
                    download
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 whitespace-nowrap shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download MP4
                  </a>
                </div>

                {[
                  { key: 'ws', label: 'WORKSPACE', url: workspaceUrl },
                  { key: 'prev', label: 'PREVIEW', url: previewUrl },
                  { key: 'dl', label: 'DOWNLOAD', url: downloadUrl },
                ].map((link) => (
                  <div
                    key={link.key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0B0D12] px-3 py-2 text-xs"
                  >
                    <span className="font-mono font-semibold text-slate-400 shrink-0">{link.label}</span>
                    <span className="truncate font-mono text-slate-200">{link.url}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(link.key, link.url)}
                      aria-label={`Copy ${link.label} URL`}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-white/10 cursor-pointer shrink-0"
                    >
                      {copiedKey === link.key ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedKey === link.key ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Visual Reference Templates & Export Profile */}
          <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-white">
                03. Visual Reference & Export Settings
              </h2>
              <div className="flex items-center gap-1 rounded-lg bg-[#0B0D12] p-1">
                {(['9:16', '16:9', '1:1'] as AspectRatioProfile[]).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => handleOverlayPatch({ aspectRatio: ratio })}
                    className={`rounded-md px-3 py-1 font-mono text-xs font-medium transition-colors cursor-pointer ${
                      workspace.overlayConfig.aspectRatio === ratio
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {references.map((ref) => {
                const selected = workspace.overlayConfig.referenceId === ref.id;
                return (
                  <button
                    key={ref.id}
                    type="button"
                    onClick={() => handleSelectReference(ref)}
                    className={`group overflow-hidden rounded-lg border text-left transition-colors cursor-pointer ${
                      selected ? 'border-[var(--accent)] bg-[#1C2232]' : 'border-white/10 bg-[#0B0D12] hover:border-white/25'
                    }`}
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-[#0B0D12]">
                      <img
                        src={ref.imageUrl}
                        alt={ref.category}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    </div>
                    <div className="p-2">
                      <p className="truncate text-xs font-semibold text-white">{ref.category}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                        {ref.attributes.aspectRatio} · {ref.attributes.titlePlacement}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={workspace.overlayConfig.showRankingNumber}
                    onChange={(e) => handleOverlayPatch({ showRankingNumber: e.target.checked })}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Ranking Badges
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={workspace.overlayConfig.showCaptions}
                    onChange={(e) => handleOverlayPatch({ showCaptions: e.target.checked })}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Captions
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={workspace.overlayConfig.includeMusicBed}
                    onChange={(e) => handleOverlayPatch({ includeMusicBed: e.target.checked })}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Ambient Music Bed
                </label>
              </div>

              <button
                type="button"
                onClick={handleRenderVideo}
                disabled={!workspace.clips.length || Boolean(busyAction)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Play className="h-4 w-4" />
                Render Final Video
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): Title Editor, Clip Timeline & Ranking Editor */}
        <div className="space-y-6 lg:col-span-5">
          {/* Viral Title Editor */}
          <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-white">
                04. Viral Title Editor
              </h2>
              <button
                type="button"
                onClick={handleRegenerateTitles}
                disabled={Boolean(busyAction)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0B0D12] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-white/25 cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </button>
            </div>

            <input
              type="text"
              aria-label="Compilation viral title"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                if (titleDraft !== workspace.title) handleSaveTitle(titleDraft);
              }}
              className="mt-3 h-10 w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3 text-sm font-semibold text-white focus:border-[var(--accent)] focus:outline-none"
            />

            {workspace.viralTitleCandidates.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[11px] font-medium text-slate-400">AI Title Candidates</p>
                {workspace.viralTitleCandidates.map((cand, idx) => (
                  <button
                    key={`${cand}-${idx}`}
                    type="button"
                    onClick={() => handleSaveTitle(cand)}
                    className={`block w-full truncate rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                      workspace.title === cand
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-white'
                        : 'border-white/10 bg-[#0B0D12] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {cand}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Ranking & Clip Timeline Editor */}
          <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-white">
                  05. Clip Timeline & Ranking ({workspace.clips.length})
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {workspace.clips.length > 0
                    ? `Sequence: ${sortOrder === 'countdown' ? `#${workspace.clips.length} to #1` : `#1 to #${workspace.clips.length}`}`
                    : 'Awaiting video analysis'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleSort}
                disabled={!workspace.clips.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0B0D12] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-white/25 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                Flip Order
              </button>
            </div>

            {workspace.clips.length === 0 ? (
              <div className="mt-4 rounded-lg border border-white/5 bg-[#0B0D12] p-8 text-center">
                <Sliders className="mx-auto h-7 w-7 text-slate-600" />
                <p className="mt-2 text-sm font-medium text-slate-300">No ranked clips yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  Load a video and click Analyze & Rank Moments to detect scenes and generate your countdown.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3 max-h-[640px] overflow-y-auto pr-1">
                {workspace.clips.map((clip) => (
                  <div
                    key={clip.id}
                    className="rounded-lg border border-white/10 bg-[#0B0D12] p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-8 w-10 items-center justify-center rounded-md bg-[var(--accent)] font-mono text-sm font-bold text-white tabular-nums shrink-0">
                          #{clip.rank}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-white">{clip.description}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-400 tabular-nums">
                            {clip.startFormatted}–{clip.endFormatted} ({clip.durationSec}s) · Score {clip.score}/10
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove clip #${clip.rank}`}
                        onClick={() => handleRemoveClip(clip.id)}
                        className="rounded p-1.5 text-slate-500 hover:bg-white/10 hover:text-red-400 cursor-pointer shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-12 gap-2">
                      {clip.keyframeUrl ? (
                        <img
                          src={clip.keyframeUrl}
                          alt={`Keyframe for #${clip.rank}`}
                          referrerPolicy="no-referrer"
                          className="col-span-4 h-16 w-full rounded object-cover border border-white/10"
                        />
                      ) : (
                        <div className="col-span-4 flex h-16 items-center justify-center rounded border border-white/10 bg-[#131722] font-mono text-[11px] text-slate-500">
                          Frame
                        </div>
                      )}

                      <div className="col-span-8 space-y-1.5">
                        <input
                          type="text"
                          aria-label={`Caption for clip #${clip.rank}`}
                          defaultValue={clip.caption}
                          onBlur={(e) => {
                            if (e.target.value !== clip.caption) {
                              handleClipPatch(clip.id, { caption: e.target.value });
                            }
                          }}
                          placeholder="Overlay caption..."
                          className="h-8 w-full rounded border border-white/10 bg-[#131722] px-2.5 text-xs text-white focus:border-[var(--accent)] focus:outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-slate-500">Start</label>
                          <input
                            type="number"
                            step="0.5"
                            aria-label={`Start seconds for clip #${clip.rank}`}
                            defaultValue={clip.startSec}
                            onBlur={(e) =>
                              handleClipPatch(clip.id, { startSec: Number(e.target.value) })
                            }
                            className="h-7 w-16 rounded border border-white/10 bg-[#131722] px-1.5 font-mono text-xs text-white tabular-nums"
                          />
                          <label className="text-[11px] text-slate-500">End</label>
                          <input
                            type="number"
                            step="0.5"
                            aria-label={`End seconds for clip #${clip.rank}`}
                            defaultValue={clip.endSec}
                            onBlur={(e) =>
                              handleClipPatch(clip.id, { endSec: Number(e.target.value) })
                            }
                            className="h-7 w-16 rounded border border-white/10 bg-[#131722] px-1.5 font-mono text-xs text-white tabular-nums"
                          />
                          <select
                            aria-label={`Transition for clip #${clip.rank}`}
                            value={clip.transition}
                            onChange={(e) =>
                              handleClipPatch(clip.id, { transition: e.target.value })
                            }
                            className="h-7 flex-1 rounded border border-white/10 bg-[#131722] px-1.5 text-[11px] text-slate-200"
                          >
                            <option value="fade">Fade</option>
                            <option value="cut">Cut</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">{clip.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Keyframes & Scene Strip */}
            {workspace.keyframes.length > 0 && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="mb-2 text-xs font-medium text-slate-400">
                  Extracted Keyframes ({workspace.keyframes.length})
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {workspace.keyframes.map((kf) => (
                    <div key={kf.id} className="w-24 shrink-0">
                      <img
                        src={kf.publicUrl}
                        alt={`Keyframe at ${kf.formattedTime}`}
                        referrerPolicy="no-referrer"
                        className="h-14 w-24 rounded border border-white/10 object-cover"
                      />
                      <p className="mt-1 text-center font-mono text-[10px] text-slate-400 tabular-nums">
                        {kf.formattedTime}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
