import fs from 'node:fs';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { KeyframeAsset, RankedClip, RankingCategory, VisualOverlayConfig } from '../../backend/types';
import { inferFallbackTitle, sortClipsForCountdown } from '../../video-engine/rankingEngine';

function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key.trim().length < 10) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
    return 'Using free local fallback (paid Gemini tier not required).';
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'Gemini rate limit reached; using free local fallback.';
  }
  return msg;
}

export async function analyzeMomentsWithGemini(params: {
  category: RankingCategory;
  instruction: string;
  durationSec: number;
  keyframes: KeyframeAsset[];
  keyframesBaseDir: string;
  baseClips: RankedClip[];
}): Promise<{
  title: string;
  viralTitleCandidates: string[];
  description: string;
  aiAnalysisSummary: string;
  clips: RankedClip[];
  providerUsed: string;
}> {
  const ai = getGeminiClient();
  const fallbackTitle = inferFallbackTitle(params.category, params.baseClips.length);

  if (!ai) {
    return {
      title: fallbackTitle.title,
      viralTitleCandidates: fallbackTitle.candidates,
      description: `Automated ${params.category} ranking compilation generated with CLIPPAH FFmpeg Scene & Audio Peak Analyzer.`,
      aiAnalysisSummary:
        'Analyzed via local FFmpeg scene-delta & audio energy ranker (GEMINI_API_KEY not configured for cloud vision).',
      clips: params.baseClips,
      providerUsed: 'local-heuristic-ranker',
    };
  }

  try {
    const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];

    // Attach up to 6 actual extracted JPEG keyframes so Gemini sees real frames
    const sampleFrames = params.keyframes.slice(0, 6);
    for (const kf of sampleFrames) {
      const fullPath = `${params.keyframesBaseDir}/${kf.relativePath}`;
      if (fs.existsSync(fullPath)) {
        const b64 = fs.readFileSync(fullPath).toString('base64');
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: b64,
          },
        });
      }
    }

    const clipSummaryPrompt = params.baseClips
      .map(
        (c, idx) =>
          `Candidate ${idx + 1}: id=${c.id}, window=${c.startFormatted}-${c.endFormatted} (${c.durationSec}s), baseScore=${c.score}`
      )
      .join('\n');

    parts.push({
      text: `You are CLIPPAH's autonomous video ranking director.
Category: "${params.category}"
User Instruction: "${params.instruction}"
Video Duration: ${params.durationSec}s
Candidate timestamp windows detected by FFmpeg:
${clipSummaryPrompt}

Inspect the attached keyframes and candidate windows. Return JSON with:
1. "bestTitle": one viral, punchy title specifically matched to the footage and category (do not use generic placeholders).
2. "titleCandidates": array of 3 strong viral title options.
3. "videoDescription": 1-2 sentence social video description.
4. "analysisSummary": concise summary of what makes these moments engaging.
5. "clipUpdates": array matching each candidate id with refined "score" (1-10), "description", short punchy "caption" (<= 55 chars), and "reason" for ranking.`,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bestTitle: { type: Type.STRING },
            titleCandidates: { type: Type.ARRAY, items: { type: Type.STRING } },
            videoDescription: { type: Type.STRING },
            analysisSummary: { type: Type.STRING },
            clipUpdates: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  description: { type: Type.STRING },
                  caption: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    });

    const parsed = JSON.parse((response.text || '{}').trim()) as {
      bestTitle?: string;
      titleCandidates?: string[];
      videoDescription?: string;
      analysisSummary?: string;
      clipUpdates?: Array<{
        id?: string;
        score?: number;
        description?: string;
        caption?: string;
        reason?: string;
      }>;
    };

    const updatedClips = params.baseClips.map((clip, i) => {
      const match = parsed.clipUpdates?.find((u) => u.id === clip.id) ?? parsed.clipUpdates?.[i];
      if (!match) return clip;
      return {
        ...clip,
        score: typeof match.score === 'number' ? Number(Math.max(1, Math.min(10, match.score)).toFixed(2)) : clip.score,
        description: match.description || clip.description,
        caption: (match.caption || clip.caption).slice(0, 65),
        reason: match.reason || clip.reason,
      };
    });

    return {
      title: parsed.bestTitle || fallbackTitle.title,
      viralTitleCandidates: parsed.titleCandidates?.length ? parsed.titleCandidates.slice(0, 4) : fallbackTitle.candidates,
      description: parsed.videoDescription || `Ranked ${params.category} compilation`,
      aiAnalysisSummary: parsed.analysisSummary || 'Analyzed keyframes and audio peaks via Gemini 4 Hydrogen.',
      clips: sortClipsForCountdown(updatedClips, 'countdown'),
      providerUsed: 'gemini-4-hydrogen',
    };
  } catch (err) {
    console.warn('Gemini moment analysis fell back to deterministic ranker:', formatGeminiError(err));
    return {
      title: fallbackTitle.title,
      viralTitleCandidates: fallbackTitle.candidates,
      description: `Ranked ${params.category} compilation`,
      aiAnalysisSummary: `FFmpeg + local ranker active (Gemini fallback note: ${formatGeminiError(err)})`,
      clips: params.baseClips,
      providerUsed: 'local-heuristic-ranker',
    };
  }
}

export async function generateViralTitlesWithGemini(params: {
  category: RankingCategory;
  clipDescriptions: string[];
}): Promise<{ bestTitle: string; candidates: string[]; providerUsed: string }> {
  const ai = getGeminiClient();
  const fallback = inferFallbackTitle(params.category, params.clipDescriptions.length, params.clipDescriptions[0]);
  if (!ai) {
    return { bestTitle: fallback.title, candidates: fallback.candidates, providerUsed: 'local-heuristic-ranker' };
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `Category: ${params.category}\nClips:\n${params.clipDescriptions.join('\n')}\nGenerate 4 viral short-form ranking video titles and pick the single strongest one.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bestTitle: { type: Type.STRING },
            candidates: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    });
    const parsed = JSON.parse((response.text || '{}').trim()) as { bestTitle?: string; candidates?: string[] };
    return {
      bestTitle: parsed.bestTitle || fallback.title,
      candidates: parsed.candidates?.length ? parsed.candidates : fallback.candidates,
      providerUsed: 'gemini-3.1-flash-lite',
    };
  } catch {
    return { bestTitle: fallback.title, candidates: fallback.candidates, providerUsed: 'local-heuristic-ranker' };
  }
}

export async function searchViralTrendsGrounded(query: string): Promise<{
  summary: string;
  sources: Array<{ title: string; uri: string }>;
  model: string;
}> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      summary: `Offline Trend Playbook for "${query}":\n• Hook in the first 1.5s with a bold top banner + #10 countdown framing.\n• Keep clip pacing tight (2.2s–3.5s per moment) and escalate energy toward #1.\n• Pair crisp short captions at the lower third with a dynamic audio drop on #1.`,
      sources: [],
      model: 'local-trend-playbook (free fallback)',
    };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Research current short-form video trends, viral ranking hooks, and title patterns for: ${query}. Return concise, actionable creative recommendations.`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources: Array<{ title: string; uri: string }> = [];
  for (const ch of chunks) {
    if (ch.web?.uri) {
      sources.push({
        title: ch.web.title || ch.web.uri,
        uri: ch.web.uri,
      });
    }
  }

  return {
    summary: response.text || 'No grounded trend summary returned.',
    sources,
    model: 'gemini-4-hydrogen (Google Search Grounding)',
  };
}

export async function runDeepRankingStrategy(params: {
  prompt: string;
  category: string;
  clipsContext: string;
}): Promise<{ strategy: string; modelUsed: string; fallbackNotice?: string }> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      strategy: `Free Local Editorial Plan (${params.category}):\n1. Opening Hook (0.0s–2.0s): Flash the countdown title ("${params.category}") and start immediately with strong motion on #N.\n2. Escalating Arc: Place mid-high reaction moments at #5–#3 to prevent drop-off, saving the sharpest audio/visual spike for #1.\n3. Caption Cadence: Keep captions under 7 words in the lower-third safe zone and use hard cuts on high-energy beats.`,
      modelUsed: 'local-editorial-planner (free fallback)',
      fallbackNotice: 'Generated using $0 local editorial strategy planner.',
    };
  }

  const fullPrompt = `Category: ${params.category}
Clip Context:
${params.clipsContext}

Director Query: ${params.prompt}

Provide a deep editorial pacing strategy, opening hook design, countdown arc from #10 to #1, and retention-maximizing caption structure.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-carbon',
      contents: fullPrompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      },
    });
    return {
      strategy: response.text || '',
      modelUsed: 'gemini-4-carbon (ThinkingLevel.HIGH)',
    };
  } catch (err) {
    // Graceful fallback to gemini-4-hydrogen with ThinkingLevel.HIGH if paid key not selected
    const fallbackResp = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: fullPrompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      },
    });
    return {
      strategy: fallbackResp.text || '',
      modelUsed: 'gemini-4-hydrogen (ThinkingLevel.HIGH fallback)',
      fallbackNotice: formatGeminiError(err),
    };
  }
}

export async function analyzeImageToOverlayConfig(params: {
  base64Data: string;
  mimeType: string;
  prompt?: string;
}): Promise<{
  analysis: string;
  suggestedOverlay: Partial<VisualOverlayConfig>;
  modelUsed: string;
  fallbackNotice?: string;
}> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }

  const instruction =
    params.prompt ||
    'Analyze this visual frame or reference layout. Describe its visual composition, focal points, typography style, and recommend placement for titlePlacement (top-banner | lower-third | top-minimal), rankingBadgePlacement (top-left | top-right | bottom-left), captionPlacement (bottom-third | bottom-bar | center-low), and aspectRatio (9:16 | 16:9 | 1:1).';

  const schema = {
    type: Type.OBJECT,
    properties: {
      analysis: { type: Type.STRING },
      titlePlacement: { type: Type.STRING },
      rankingBadgePlacement: { type: Type.STRING },
      captionPlacement: { type: Type.STRING },
      aspectRatio: { type: Type.STRING },
    },
  };

  const imagePart = { inlineData: { mimeType: params.mimeType, data: params.base64Data } };

  let textOut = '';
  let modelUsed = 'gemini-4-argon';
  let fallbackNotice: string | undefined;

  try {
    const resp = await ai.models.generateContent({
      model: 'gemini-4-argon',
      contents: { parts: [imagePart, { text: instruction }] },
      config: { responseMimeType: 'application/json', responseSchema: schema },
    });
    textOut = resp.text || '{}';
  } catch (err) {
    modelUsed = 'gemini-4-hydrogen (vision fallback)';
    fallbackNotice = formatGeminiError(err);
    const resp = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts: [imagePart, { text: instruction }] },
      config: { responseMimeType: 'application/json', responseSchema: schema },
    });
    textOut = resp.text || '{}';
  }

  const parsed = JSON.parse(textOut.trim()) as {
    analysis?: string;
    titlePlacement?: VisualOverlayConfig['titlePlacement'];
    rankingBadgePlacement?: VisualOverlayConfig['rankingBadgePlacement'];
    captionPlacement?: VisualOverlayConfig['captionPlacement'];
    aspectRatio?: VisualOverlayConfig['aspectRatio'];
  };

  return {
    analysis: parsed.analysis || 'Analyzed visual layout and subject framing.',
    suggestedOverlay: {
      titlePlacement: ['top-banner', 'lower-third', 'top-minimal'].includes(parsed.titlePlacement || '')
        ? parsed.titlePlacement
        : 'top-banner',
      rankingBadgePlacement: ['top-left', 'top-right', 'bottom-left'].includes(parsed.rankingBadgePlacement || '')
        ? parsed.rankingBadgePlacement
        : 'top-left',
      captionPlacement: ['bottom-third', 'bottom-bar', 'center-low'].includes(parsed.captionPlacement || '')
        ? parsed.captionPlacement
        : 'bottom-third',
      aspectRatio: ['9:16', '16:9', '1:1'].includes(parsed.aspectRatio || '') ? parsed.aspectRatio : '9:16',
    },
    modelUsed,
    fallbackNotice,
  };
}

function buildLocalAspectReferenceSvg(prompt: string, aspectRatio: string): string {
  const ratioMap: Record<string, [number, number]> = {
    '1:1': [720, 720],
    '2:3': [640, 960],
    '3:2': [960, 640],
    '3:4': [720, 960],
    '4:3': [960, 720],
    '9:16': [540, 960],
    '16:9': [960, 540],
    '21:9': [1050, 450],
  };
  const [w, h] = ratioMap[aspectRatio] ?? [540, 960];
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const titleLine = esc(prompt.slice(0, 52) + (prompt.length > 52 ? '...' : ''));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B0D12"/>
      <stop offset="100%" stop-color="#171E2E"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect x="24" y="24" width="${w - 48}" height="${h - 48}" rx="18" fill="none" stroke="#F97316" stroke-opacity="0.45" stroke-width="2" stroke-dasharray="10 8"/>
  <rect x="40" y="42" width="${w - 80}" height="64" rx="10" fill="#131722" stroke="#FFFFFF" stroke-opacity="0.12"/>
  <rect x="40" y="42" width="8" height="64" rx="4" fill="#F97316"/>
  <text x="64" y="70" fill="#94A3B8" font-family="sans-serif" font-size="14" font-weight="700">CLIPPAH BROADCAST REFERENCE · ${aspectRatio}</text>
  <text x="64" y="92" fill="#F8FAFC" font-family="sans-serif" font-size="16" font-weight="700">${titleLine}</text>
  <rect x="40" y="126" width="68" height="44" rx="8" fill="#F97316"/>
  <text x="74" y="155" text-anchor="middle" fill="#FFFFFF" font-family="monospace" font-size="22" font-weight="800">#1</text>
  <rect x="40" y="${h - 96}" width="${w - 80}" height="52" rx="10" fill="#0B0D12" fill-opacity="0.88" stroke="#FFFFFF" stroke-opacity="0.14"/>
  <text x="${w / 2}" y="${h - 64}" text-anchor="middle" fill="#E2E8F0" font-family="sans-serif" font-size="15" font-weight="600">Caption Safe Zone (${w}x${h})</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
}

export async function generateReferenceImage(params: {
  prompt: string;
  aspectRatio: string;
}): Promise<{ imageDataUrl: string; modelUsed: string; fallbackNotice?: string }> {
  const ai = getGeminiClient();
  const allowedRatios = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'];
  const aspectRatio = allowedRatios.includes(params.aspectRatio) ? params.aspectRatio : '1:1';

  if (!ai) {
    return {
      imageDataUrl: buildLocalAspectReferenceSvg(params.prompt, aspectRatio),
      modelUsed: 'local-aspect-frame-generator',
      fallbackNotice: 'Generated $0 local broadcast layout reference.',
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-nano-banana-2.1',
      contents: { parts: [{ text: params.prompt }] },
      config: {
        imageConfig: {
          aspectRatio,
          imageSize: '1K',
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType ?? 'image/png';
        return {
          imageDataUrl: `data:${mime};base64,${part.inlineData.data}`,
          modelUsed: 'gemini-nano-banana-2.1',
        };
      }
    }
  } catch (err) {
    return {
      imageDataUrl: buildLocalAspectReferenceSvg(params.prompt, aspectRatio),
      modelUsed: 'local-aspect-frame-generator',
      fallbackNotice: formatGeminiError(err),
    };
  }

  return {
    imageDataUrl: buildLocalAspectReferenceSvg(params.prompt, aspectRatio),
    modelUsed: 'local-aspect-frame-generator',
    fallbackNotice: 'Generated $0 local broadcast layout reference.',
  };
}

export async function animateImageViaInteractions(params: {
  base64Data: string;
  mimeType: string;
  prompt: string;
  aspectRatio: '16:9' | '9:16';
}): Promise<{ videoBuffer: Buffer; mimeType: string; modelUsed: string }> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }

  const interaction = await ai.interactions.create(
    {
      model: 'gemini-omni-1.2-flash',
      input: [
        {
          type: 'image',
          mime_type: params.mimeType,
          data: params.base64Data,
        },
        {
          type: 'text',
          text: params.prompt || 'Subtle cinematic camera push-in with natural motion.',
        },
      ],
      background: false,
      store: false,
      stream: false,
      response_format: {
        type: 'video',
        aspect_ratio: params.aspectRatio,
      },
    },
    { timeout: 300000 }
  );

  const videoPart = interaction.output_video;
  if (videoPart?.data) {
    return {
      videoBuffer: Buffer.from(videoPart.data, 'base64'),
      mimeType: videoPart.mime_type || 'video/mp4',
      modelUsed: 'gemini-omni-1.2-flash',
    };
  }

  throw new Error('Omni Flash interaction did not return inline video bytes.');
}
