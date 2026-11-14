import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Film,
  Search,
  Brain,
  ScanEye,
  ExternalLink,
  CheckCircle2,
  Download,
} from 'lucide-react';
import type { VisualOverlayConfig, VisualReferenceItem, WorkspaceProject } from '../../backend/types';
import {
  analyzeImageApi,
  animateImageApi,
  deepStrategyApi,
  generateImageApi,
  searchTrendsApi,
  updateWorkspaceApi,
} from '../lib/api';

interface AiCreativeLabProps {
  workspace: WorkspaceProject | null;
  references: VisualReferenceItem[];
  onWorkspaceUpdated: (ws: WorkspaceProject) => void;
}

const IMAGE_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'];

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      resolve({ base64, mimeType: file.type || 'image/png', dataUrl: result });
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export const AiCreativeLab: React.FC<AiCreativeLabProps> = ({
  workspace,
  references,
  onWorkspaceUpdated,
}) => {
  // 1. Image Analysis state
  const [analyzePreview, setAnalyzePreview] = useState<string>('');
  const [analyzeBase64, setAnalyzeBase64] = useState<{ base64: string; mimeType: string } | null>(null);
  const [analyzePrompt, setAnalyzePrompt] = useState<string>('');
  const [analyzeResult, setAnalyzeResult] = useState<{
    analysis: string;
    suggestedOverlay: Partial<VisualOverlayConfig>;
    modelUsed: string;
    fallbackNotice?: string;
  } | null>(null);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);

  // 2. Image Generation state
  const [genPrompt, setGenPrompt] = useState<string>(
    'Minimalist dark studio broadcast frame for a Top 10 Incredible Moments countdown, crisp rim lighting'
  );
  const [genRatio, setGenRatio] = useState<string>('9:16');
  const [genResult, setGenResult] = useState<{
    imageDataUrl: string;
    modelUsed: string;
    fallbackNotice?: string;
  } | null>(null);
  const [genBusy, setGenBusy] = useState(false);

  // 3. Animate Image to Video state
  const [animPreview, setAnimPreview] = useState<string>('');
  const [animBase64, setAnimBase64] = useState<{ base64: string; mimeType: string } | null>(null);
  const [animRatio, setAnimRatio] = useState<'16:9' | '9:16'>('9:16');
  const [animPrompt, setAnimPrompt] = useState<string>(
    'Dynamic slow push-in camera motion with subtle ambient light shimmer'
  );
  const [animResult, setAnimResult] = useState<{
    videoDataUrl: string;
    modelUsed: string;
    fallbackNotice?: string;
  } | null>(null);
  const [animBusy, setAnimBusy] = useState(false);

  // 4. Google Search Trend Grounding state
  const [searchQuery, setSearchQuery] = useState<string>(
    workspace?.category || 'Funniest Animal Moments viral Shorts title trends 2026'
  );
  const [searchResult, setSearchResult] = useState<{
    summary: string;
    sources: Array<{ title: string; uri: string }>;
    model: string;
  } | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);

  // 5. High Thinking Editorial Strategy state
  const [thinkPrompt, setThinkPrompt] = useState<string>(
    'Design the optimal #10 to #1 retention pacing, opening 2-second hook, and punchline structure for this compilation.'
  );
  const [thinkResult, setThinkResult] = useState<{
    strategy: string;
    modelUsed: string;
    fallbackNotice?: string;
  } | null>(null);
  const [thinkBusy, setThinkBusy] = useState(false);

  const [labError, setLabError] = useState<string | null>(null);
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);

  async function handleAnalyzeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await readFileAsBase64(file);
    setAnalyzePreview(data.dataUrl);
    setAnalyzeBase64({ base64: data.base64, mimeType: data.mimeType });
  }

  async function handleRunAnalyze() {
    if (!analyzeBase64) return;
    setLabError(null);
    setAnalyzeBusy(true);
    try {
      const res = await analyzeImageApi({
        base64Data: analyzeBase64.base64,
        mimeType: analyzeBase64.mimeType,
        prompt: analyzePrompt || undefined,
      });
      setAnalyzeResult(res);
    } catch (err) {
      setLabError(err instanceof Error ? err.message : 'Image analysis failed.');
    } finally {
      setAnalyzeBusy(false);
    }
  }

  async function handleApplyOverlayToWorkspace() {
    if (!workspace || !analyzeResult?.suggestedOverlay) return;
    try {
      const res = await updateWorkspaceApi(workspace.uuid, {
        overlayConfig: { ...workspace.overlayConfig, ...analyzeResult.suggestedOverlay },
      });
      onWorkspaceUpdated(res.workspace);
      setAppliedMsg('Applied analyzed layout placements to active workspace.');
      setTimeout(() => setAppliedMsg(null), 2500);
    } catch (err) {
      setLabError(err instanceof Error ? err.message : 'Failed to apply overlay.');
    }
  }

  async function handleGenerateImage() {
    setLabError(null);
    setGenBusy(true);
    try {
      const res = await generateImageApi({ prompt: genPrompt, aspectRatio: genRatio });
      setGenResult(res);
    } catch (err) {
      setLabError(err instanceof Error ? err.message : 'Image generation failed.');
    } finally {
      setGenBusy(false);
    }
  }

  async function handleAnimUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await readFileAsBase64(file);
    setAnimPreview(data.dataUrl);
    setAnimBase64({ base64: data.base64, mimeType: data.mimeType });
  }

  async function handleAnimateImage() {
    if (!animBase64) return;
    setLabError(null);
    setAnimBusy(true);
    try {
      const res = await animateImageApi({
        base64Data: animBase64.base64,
        mimeType: animBase64.mimeType,
        prompt: animPrompt,
        aspectRatio: animRatio,
      });
      setAnimResult(res);
    } catch (err) {
      setLabError(err instanceof Error ? err.message : 'Image animation failed.');
    } finally {
      setAnimBusy(false);
    }
  }

  async function handleSearchTrends() {
    setLabError(null);
    setSearchBusy(true);
    try {
      const res = await searchTrendsApi(searchQuery);
      setSearchResult(res);
    } catch (err) {
      setLabError(err instanceof Error ? err.message : 'Search grounding failed.');
    } finally {
      setSearchBusy(false);
    }
  }

  async function handleDeepThink() {
    setLabError(null);
    setThinkBusy(true);
    try {
      const clipsContext = workspace?.clips.length
        ? workspace.clips.map((c) => `#${c.rank} (${c.startFormatted}-${c.endFormatted}): ${c.description}`).join('\n')
        : 'No clips analyzed yet.';
      const res = await deepStrategyApi({
        prompt: thinkPrompt,
        category: workspace?.category || 'Top Moments',
        clipsContext,
      });
      setThinkResult(res);
    } catch (err) {
      setLabError(err instanceof Error ? err.message : 'Deep thinking strategy failed.');
    } finally {
      setThinkBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-8">
      <div className="mb-6 border-b border-white/10 pb-5">
        <p className="text-xs text-slate-400">
          Multimodal Intelligence · Search Grounding · Aspect Ratio Synthesis · Interactions Video
        </p>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          AI Creative & Visual Reference Lab
        </h1>
      </div>

      {labError && (
        <div role="alert" className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {labError}
        </div>
      )}

      {appliedMsg && (
        <div role="status" className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{appliedMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 1. Image Understanding & Reference Placement Extractor */}
        <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
              <ScanEye className="h-4 w-4 text-[var(--accent)]" />
              01. Visual Reference & Image Analyzer
            </h2>
            <span className="font-mono text-[11px] text-slate-400">gemini-4-argon</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Upload a photo or layout reference to extract placement coordinates for titles, ranking numbers, and captions.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-[#0B0D12] px-3.5 text-xs font-semibold text-white hover:border-white/30 cursor-pointer">
              Upload Photo
              <input type="file" accept="image/*" onChange={handleAnalyzeUpload} className="hidden" />
            </label>
            <button
              type="button"
              onClick={handleRunAnalyze}
              disabled={!analyzeBase64 || analyzeBusy}
              className="h-9 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 cursor-pointer"
            >
              {analyzeBusy ? 'Analyzing...' : 'Analyze Image'}
            </button>
          </div>

          <input
            type="text"
            value={analyzePrompt}
            onChange={(e) => setAnalyzePrompt(e.target.value)}
            placeholder="Optional custom visual question..."
            className="mt-3 h-9 w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3 text-xs text-white placeholder:text-slate-500"
          />

          {analyzePreview && (
            <img
              src={analyzePreview}
              alt="Uploaded for visual analysis"
              className="mt-3 max-h-48 rounded-lg border border-white/10 object-contain"
            />
          )}

          {analyzeResult && (
            <div className="mt-4 rounded-lg border border-white/10 bg-[#0B0D12] p-3.5 text-xs">
              <p className="font-mono text-[11px] text-slate-400">{analyzeResult.modelUsed}</p>
              <p className="mt-1.5 leading-relaxed text-slate-200">{analyzeResult.analysis}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                <span className="font-mono text-[11px] text-slate-400">
                  {analyzeResult.suggestedOverlay.aspectRatio} · {analyzeResult.suggestedOverlay.titlePlacement} ·{' '}
                  {analyzeResult.suggestedOverlay.rankingBadgePlacement}
                </span>
                {workspace && (
                  <button
                    type="button"
                    onClick={handleApplyOverlayToWorkspace}
                    className="rounded-md bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                  >
                    Apply to Workspace
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 2. Animate Image into Video (Interactions API) */}
        <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
              <Film className="h-4 w-4 text-[var(--accent)]" />
              02. Animate Image to Video
            </h2>
            <span className="font-mono text-[11px] text-slate-400">gemini-omni-1.2-flash</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Upload a photo, choose 16:9 landscape or 9:16 portrait, and animate it via the Interactions API (with local FFmpeg motion fallback).
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-[#0B0D12] px-3.5 text-xs font-semibold text-white hover:border-white/30 cursor-pointer">
              Upload Photo
              <input type="file" accept="image/*" onChange={handleAnimUpload} className="hidden" />
            </label>

            <div className="flex items-center gap-1 rounded-lg bg-[#0B0D12] p-1">
              {(['9:16', '16:9'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAnimRatio(r)}
                  className={`rounded px-2.5 py-1 font-mono text-xs cursor-pointer ${
                    animRatio === r ? 'bg-[var(--accent)] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAnimateImage}
              disabled={!animBase64 || animBusy}
              className="h-9 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 cursor-pointer"
            >
              {animBusy ? 'Generating Video...' : 'Animate Photo'}
            </button>
          </div>

          <input
            type="text"
            value={animPrompt}
            onChange={(e) => setAnimPrompt(e.target.value)}
            placeholder="Describe motion prompt..."
            className="mt-3 h-9 w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3 text-xs text-white"
          />

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {animPreview && (
              <img
                src={animPreview}
                alt="Source frame for animation"
                className="max-h-48 w-full rounded-lg border border-white/10 object-contain bg-black"
              />
            )}
            {animResult && (
              <div className="space-y-2">
                <video
                  src={animResult.videoDataUrl}
                  controls
                  autoPlay
                  loop
                  muted
                  className="max-h-48 w-full rounded-lg border border-white/10 bg-black"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono">{animResult.modelUsed}</span>
                  <a
                    href={animResult.videoDataUrl}
                    download={`clippah-animated-${animRatio.replace(':', 'x')}.mp4`}
                    className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                  >
                    <Download className="h-3 w-3" />
                    Save MP4
                  </a>
                </div>
                {animResult.fallbackNotice && (
                  <p className="text-[11px] text-amber-300">{animResult.fallbackNotice}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 3. Aspect Ratio Image Studio */}
        <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
              <ImageIcon className="h-4 w-4 text-[var(--accent)]" />
              03. Aspect-Ratio Reference Image Studio
            </h2>
            <span className="font-mono text-[11px] text-slate-400">gemini-nano-banana-2.1</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Image aspect ratios">
            {IMAGE_ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setGenRatio(ratio)}
                className={`rounded-md border px-2.5 py-1 font-mono text-xs cursor-pointer ${
                  genRatio === ratio
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-white'
                    : 'border-white/10 bg-[#0B0D12] text-slate-400 hover:text-white'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          <textarea
            rows={2}
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
            className="mt-3 w-full rounded-lg border border-white/10 bg-[#0B0D12] p-2.5 text-xs text-white focus:border-[var(--accent)] focus:outline-none"
          />

          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-[11px] text-slate-400">Selected: {genRatio}</span>
            <button
              type="button"
              onClick={handleGenerateImage}
              disabled={genBusy}
              className="h-9 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 cursor-pointer"
            >
              {genBusy ? 'Generating...' : 'Generate Reference'}
            </button>
          </div>

          {genResult && (
            <div className="mt-4 space-y-2">
              <img
                src={genResult.imageDataUrl}
                alt="Generated studio reference"
                className="max-h-64 rounded-lg border border-white/10 object-contain"
              />
              <p className="font-mono text-[11px] text-slate-400">{genResult.modelUsed}</p>
              {'fallbackNotice' in genResult && genResult.fallbackNotice && (
                <p className="text-[11px] text-amber-300">{genResult.fallbackNotice}</p>
              )}
            </div>
          )}
        </div>

        {/* 4. Google Search Trend Grounding + High Thinking Editorial Strategy */}
        <div className="space-y-6">
          <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
                <Search className="h-4 w-4 text-[var(--accent)]" />
                04. Google Search Viral Trend Grounding
              </h2>
              <span className="font-mono text-[11px] text-slate-400">gemini-4-hydrogen</span>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search current viral formats & hooks..."
                className="h-9 flex-1 rounded-lg border border-white/10 bg-[#0B0D12] px-3 text-xs text-white"
              />
              <button
                type="button"
                onClick={handleSearchTrends}
                disabled={searchBusy}
                className="h-9 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 cursor-pointer shrink-0"
              >
                {searchBusy ? 'Searching...' : 'Search Trends'}
              </button>
            </div>

            {searchResult && (
              <div className="mt-3 rounded-lg border border-white/10 bg-[#0B0D12] p-3 text-xs">
                <p className="whitespace-pre-line leading-relaxed text-slate-200">{searchResult.summary}</p>
                {searchResult.sources.length > 0 && (
                  <div className="mt-2.5 border-t border-white/10 pt-2">
                    <p className="text-[11px] font-semibold text-slate-400">Grounded Sources</p>
                    <ul className="mt-1 space-y-1">
                      {searchResult.sources.slice(0, 5).map((src, i) => (
                        <li key={i}>
                          <a
                            href={src.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate">{src.title}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
                <Brain className="h-4 w-4 text-[var(--accent)]" />
                05. High-Thinking Editorial Strategy
              </h2>
              <span className="font-mono text-[11px] text-slate-400">gemini-4-carbon · HIGH</span>
            </div>

            <textarea
              rows={2}
              value={thinkPrompt}
              onChange={(e) => setThinkPrompt(e.target.value)}
              className="mt-3 w-full rounded-lg border border-white/10 bg-[#0B0D12] p-2.5 text-xs text-white"
            />
            <div className="mt-2.5 flex justify-end">
              <button
                type="button"
                onClick={handleDeepThink}
                disabled={thinkBusy}
                className="h-9 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 cursor-pointer"
              >
                {thinkBusy ? 'Reasoning...' : 'Run High-Thinking Plan'}
              </button>
            </div>

            {thinkResult && (
              <div className="mt-3 max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-[#0B0D12] p-3 text-xs">
                <p className="font-mono text-[11px] text-slate-400">{thinkResult.modelUsed}</p>
                {thinkResult.fallbackNotice && (
                  <p className="mt-1 text-[11px] text-amber-300">{thinkResult.fallbackNotice}</p>
                )}
                <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-200">{thinkResult.strategy}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reference Library Gallery */}
      <div className="mt-8 rounded-xl border border-white/10 bg-[#131722] p-5">
        <h2 className="font-display text-base font-semibold text-white">
          Built-in Visual Reference Library ({references.length} Templates)
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {references.map((ref) => (
            <div key={ref.id} className="overflow-hidden rounded-lg border border-white/10 bg-[#0B0D12]">
              <img
                src={ref.imageUrl}
                alt={ref.category}
                referrerPolicy="no-referrer"
                className="h-44 w-full object-cover"
              />
              <div className="p-3">
                <p className="text-xs font-semibold text-white">{ref.category}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{ref.description}</p>
                <p className="mt-2 font-mono text-[11px] text-slate-300">
                  {ref.attributes.aspectRatio} · {ref.attributes.typography}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
