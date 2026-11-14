import fs from 'node:fs';
import path from 'node:path';
import type { AspectRatioProfile, FeedbackSubmission } from '../backend/types';
import {
  createWorkspace,
  getWorkspace,
  getWorkspaceDir,
  listWorkspaceFiles,
  listWorkspaces,
  updateWorkspace,
} from '../backend/storage/workspaceStore';
import {
  attachSampleVideoToWorkspace,
  buildWorkspaceUrls,
  editClipInWorkspace,
  inspectAudioOnly,
  refreshViralTitle,
  renderWorkspaceCompilation,
  runFullVideoAnalysisAndRanking,
} from '../backend/services/pipelineService';
import { detectScenes, extractKeyframes, inspectVideo } from '../video-engine/ffmpegPipeline';
import { sortClipsForCountdown } from '../video-engine/rankingEngine';
import { VISUAL_REFERENCES, getReferenceById } from '../ai/visualReferences';
import { getProviderRegistry } from '../ai/providers/registry';
import { submitFeedback } from '../backend/email/feedbackService';

export interface McpToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpToolSpec[] = [
  // VIDEO ANALYSIS
  {
    name: 'inspect_video',
    description: 'Inspect complete video metadata (duration, resolution, FPS, codecs, audio properties) in a workspace.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string', description: 'Workspace UUID' } },
      required: ['uuid'],
    },
  },
  {
    name: 'extract_video_metadata',
    description: 'Extract detailed FFprobe container and stream metadata for the workspace video.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' } },
      required: ['uuid'],
    },
  },
  {
    name: 'detect_scenes',
    description: 'Detect scene change boundaries and timestamps using FFmpeg scene-delta analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        threshold: { type: 'number', description: 'Scene threshold 0.1 - 0.6 (default 0.22)' },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'extract_keyframes',
    description: 'Extract representative JPEG keyframes from the source video at detected scenes or custom timestamps.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        timestamps: { type: 'array', items: { type: 'number' } },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'analyze_visual_content',
    description: 'Run autonomous visual + scene + moment analysis over extracted keyframes using Gemini / local ranker.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        category: { type: 'string' },
        instruction: { type: 'string' },
        targetClipCount: { type: 'number' },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'analyze_audio',
    description: 'Measure mean and peak dB audio energy levels across the workspace video.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' } },
      required: ['uuid'],
    },
  },
  {
    name: 'detect_moments',
    description: 'Identify ranked candidate moment windows combining visual cuts and audio energy.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' }, targetClipCount: { type: 'number' } },
      required: ['uuid'],
    },
  },
  // AI RANKING
  {
    name: 'identify_video_category',
    description: 'Set or infer the ranking category (e.g., Funniest Animal Moments, Craziest Sports Moments).',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' }, category: { type: 'string' } },
      required: ['uuid', 'category'],
    },
  },
  {
    name: 'generate_ranking',
    description: 'Score and rank detected video clips from #N down to #1.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' }, order: { type: 'string', enum: ['countdown', 'top-first'] } },
      required: ['uuid'],
    },
  },
  {
    name: 'score_video_moments',
    description: 'Update ranking score and selection reason for a specific clip.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        clipId: { type: 'string' },
        score: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['uuid', 'clipId', 'score'],
    },
  },
  {
    name: 'sort_clips',
    description: 'Reorder clips in countdown (#10 to #1) or top-first (#1 to #10) sequence.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' }, order: { type: 'string', enum: ['countdown', 'top-first'] } },
      required: ['uuid'],
    },
  },
  {
    name: 'generate_viral_title',
    description: 'Autonomously generate and select a viral title tailored to the analyzed footage.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' } },
      required: ['uuid'],
    },
  },
  {
    name: 'generate_video_description',
    description: 'Update or generate the social description for the ranking compilation.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' }, description: { type: 'string' } },
      required: ['uuid'],
    },
  },
  // VIDEO EDITING
  {
    name: 'trim_clip',
    description: 'Adjust startSec and endSec timestamps for an extracted clip.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        clipId: { type: 'string' },
        startSec: { type: 'number' },
        endSec: { type: 'number' },
      },
      required: ['uuid', 'clipId', 'startSec', 'endSec'],
    },
  },
  {
    name: 'split_video',
    description: 'Split a source video into ranked clip segments.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' }, targetClipCount: { type: 'number' } },
      required: ['uuid'],
    },
  },
  {
    name: 'crop_video',
    description: 'Configure output framing and aspect ratio (9:16, 16:9, 1:1).',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' }, aspectRatio: { type: 'string', enum: ['9:16', '16:9', '1:1'] } },
      required: ['uuid', 'aspectRatio'],
    },
  },
  {
    name: 'resize_video',
    description: 'Resize target export resolution profile (9:16 vertical, 16:9 landscape, 1:1 square).',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' }, aspectRatio: { type: 'string', enum: ['9:16', '16:9', '1:1'] } },
      required: ['uuid', 'aspectRatio'],
    },
  },
  {
    name: 'add_title',
    description: 'Set the viral title banner text and placement on the compilation.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        title: { type: 'string' },
        titlePlacement: { type: 'string', enum: ['top-banner', 'lower-third', 'top-minimal'] },
      },
      required: ['uuid', 'title'],
    },
  },
  {
    name: 'add_ranking_number',
    description: 'Enable and position the #N ranking overlay badge on rendered clips.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        enabled: { type: 'boolean' },
        placement: { type: 'string', enum: ['top-left', 'top-right', 'bottom-left'] },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'add_captions',
    description: 'Set or toggle dynamic caption overlays on a clip or workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        clipId: { type: 'string' },
        caption: { type: 'string' },
        enabled: { type: 'boolean' },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'add_transitions',
    description: 'Apply transition style (fade, cut, slideleft, zoom) to clips.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        transition: { type: 'string', enum: ['fade', 'cut', 'slideleft', 'zoom'] },
      },
      required: ['uuid', 'transition'],
    },
  },
  {
    name: 'set_clip_duration',
    description: 'Adjust a specific clip duration from its start timestamp.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' }, clipId: { type: 'string' }, durationSec: { type: 'number' } },
      required: ['uuid', 'clipId', 'durationSec'],
    },
  },
  {
    name: 'compose_ranking_video',
    description: 'Apply a Visual Reference layout template and compose the full ranking timeline.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        referenceId: { type: 'string' },
        aspectRatio: { type: 'string', enum: ['9:16', '16:9', '1:1'] },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'render_video',
    description: 'Render the final MP4 compilation via FFmpeg and return verified workspace, preview, and download URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        aspectRatio: { type: 'string', enum: ['9:16', '16:9', '1:1'] },
        referenceId: { type: 'string' },
      },
      required: ['uuid'],
    },
  },
  // WORKSPACE MANAGEMENT
  {
    name: 'create_workspace',
    description: 'Create a new UUID workspace project (optionally attaching a sample compilation video).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        category: { type: 'string' },
        instruction: { type: 'string' },
        aspectRatio: { type: 'string', enum: ['9:16', '16:9', '1:1'] },
        attachSamplePreset: { type: 'string' },
      },
    },
  },
  {
    name: 'get_workspace',
    description: 'Retrieve full workspace project configuration, clips, analysis, and export links.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' } },
      required: ['uuid'],
    },
  },
  {
    name: 'list_workspace_files',
    description: 'List all source, keyframe, clip, and rendered output files inside a workspace.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' } },
      required: ['uuid'],
    },
  },
  {
    name: 'save_project',
    description: 'Persist project title, category, or overlay settings to the UUID workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        title: { type: 'string' },
        category: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'get_video_preview',
    description: 'Get verified HTML5 browser preview URL for a rendered workspace video.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' } },
      required: ['uuid'],
    },
  },
  {
    name: 'export_video',
    description: 'Verify rendered MP4 availability and return workspace, preview, and download URLs.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' } },
      required: ['uuid'],
    },
  },
  {
    name: 'get_render_status',
    description: 'Check current analysis/rendering progress and output file size for a workspace.',
    inputSchema: {
      type: 'object',
      properties: { uuid: { type: 'string' } },
      required: ['uuid'],
    },
  },
  // DISCOVERY & FEEDBACK
  {
    name: 'list_visual_references',
    description: 'List CLIPPAH visual reference layout templates and their geometry attributes.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_providers',
    description: 'List available AI and open-source FFmpeg providers, capabilities, and free-tier constraints.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'submit_feedback',
    description: 'Submit a 1-5 star rating and feedback for CLIPPAH.',
    inputSchema: {
      type: 'object',
      properties: {
        rating: { type: 'number', minimum: 1, maximum: 5 },
        category: { type: 'string' },
        comment: { type: 'string' },
        projectUuid: { type: 'string' },
      },
      required: ['rating'],
    },
  },
  {
    name: 'get_feedback_schema',
    description: 'Return the JSON schema and endpoint details for submitting user or agent feedback.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export const MCP_PROMPTS = [
  {
    name: 'autonomous_ranking_director',
    description: 'Full autonomous pipeline: inspect video, detect moments, rank #10 to #1, title, and render.',
    arguments: [
      { name: 'category', description: 'Ranking category e.g. Funniest Animal Moments', required: true },
      { name: 'aspectRatio', description: '9:16, 16:9, or 1:1', required: false },
    ],
  },
  {
    name: 'viral_title_selector',
    description: 'Generate and choose one viral title based on actual analyzed clip moments.',
    arguments: [{ name: 'uuid', description: 'Workspace UUID', required: true }],
  },
  {
    name: 'reference_layout_matcher',
    description: 'Match a CLIPPAH visual reference template to the target aspect ratio and category.',
    arguments: [{ name: 'referenceId', description: 'Reference ID', required: true }],
  },
];

function okJson(payload: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>,
  baseUrl: string,
  actorId: string
) {
  const uuid = typeof args.uuid === 'string' ? args.uuid : '';

  switch (name) {
    case 'create_workspace': {
      const ws = createWorkspace({
        ownerId: actorId,
        title: typeof args.title === 'string' ? args.title : undefined,
        category: typeof args.category === 'string' ? args.category : undefined,
        instruction: typeof args.instruction === 'string' ? args.instruction : undefined,
        aspectRatio: (args.aspectRatio as AspectRatioProfile) || '9:16',
      });
      if (typeof args.attachSamplePreset === 'string' && args.attachSamplePreset.trim()) {
        const updated = await attachSampleVideoToWorkspace(ws.uuid, args.attachSamplePreset.trim());
        return okJson({ workspace: updated, links: buildWorkspaceUrls(updated.uuid, baseUrl) });
      }
      return okJson({ workspace: ws, links: buildWorkspaceUrls(ws.uuid, baseUrl) });
    }

    case 'get_workspace': {
      const ws = getWorkspace(uuid);
      if (!ws) throw new Error(`Workspace ${uuid} not found.`);
      return okJson({ workspace: ws, links: buildWorkspaceUrls(ws.uuid, baseUrl) });
    }

    case 'list_workspace_files': {
      const ws = getWorkspace(uuid);
      if (!ws) throw new Error(`Workspace ${uuid} not found.`);
      return okJson({ uuid, files: listWorkspaceFiles(uuid) });
    }

    case 'save_project': {
      const ws = updateWorkspace(uuid, {
        ...(typeof args.title === 'string' ? { title: args.title } : {}),
        ...(typeof args.category === 'string' ? { category: args.category } : {}),
        ...(typeof args.description === 'string' ? { description: args.description } : {}),
      });
      if (!ws) throw new Error(`Workspace ${uuid} not found.`);
      return okJson({ saved: true, workspace: ws });
    }

    case 'inspect_video':
    case 'extract_video_metadata': {
      const ws = getWorkspace(uuid);
      if (!ws || !ws.sourceVideoPath) throw new Error('Workspace has no source video attached.');
      const metadata = await inspectVideo(ws.sourceVideoPath);
      updateWorkspace(uuid, { videoMetadata: metadata });
      return okJson({ uuid, metadata });
    }

    case 'detect_scenes': {
      const ws = getWorkspace(uuid);
      if (!ws || !ws.sourceVideoPath) throw new Error('Workspace has no source video attached.');
      const meta = ws.videoMetadata ?? (await inspectVideo(ws.sourceVideoPath));
      const threshold = typeof args.threshold === 'number' ? args.threshold : 0.22;
      const scenes = await detectScenes(ws.sourceVideoPath, meta.durationSec, threshold);
      updateWorkspace(uuid, { scenes, videoMetadata: meta });
      return okJson({ uuid, sceneCount: scenes.length, scenes });
    }

    case 'extract_keyframes': {
      const ws = getWorkspace(uuid);
      if (!ws || !ws.sourceVideoPath) throw new Error('Workspace has no source video attached.');
      const timestamps = Array.isArray(args.timestamps)
        ? (args.timestamps as number[])
        : ws.scenes.length
          ? ws.scenes.map((s) => s.timestampSec + 0.3)
          : [1, 3, 6, 9, 12];
      const wsDir = getWorkspaceDir(uuid);
      const keyframes = await extractKeyframes({
        filePath: ws.sourceVideoPath,
        timestamps,
        outDir: path.join(wsDir, 'keyframes'),
        workspaceUuid: uuid,
      });
      updateWorkspace(uuid, { keyframes });
      return okJson({ uuid, keyframeCount: keyframes.length, keyframes });
    }

    case 'analyze_audio': {
      const audio = await inspectAudioOnly(uuid);
      return okJson({ uuid, audio });
    }

    case 'analyze_visual_content':
    case 'detect_moments':
    case 'split_video': {
      const updated = await runFullVideoAnalysisAndRanking({
        uuid,
        targetClipCount: typeof args.targetClipCount === 'number' ? args.targetClipCount : 6,
        category: typeof args.category === 'string' ? args.category : undefined,
        instruction: typeof args.instruction === 'string' ? args.instruction : undefined,
      });
      return okJson({
        uuid,
        title: updated.title,
        providerUsed: updated.providerUsed,
        aiAnalysisSummary: updated.aiAnalysisSummary,
        clips: updated.clips,
      });
    }

    case 'identify_video_category': {
      const ws = updateWorkspace(uuid, { category: String(args.category || 'Top Moments') });
      if (!ws) throw new Error(`Workspace ${uuid} not found.`);
      return okJson({ uuid, category: ws.category });
    }

    case 'generate_ranking':
    case 'sort_clips': {
      const ws = getWorkspace(uuid);
      if (!ws) throw new Error(`Workspace ${uuid} not found.`);
      const order = args.order === 'top-first' ? 'top-first' : 'countdown';
      const sorted = sortClipsForCountdown(ws.clips, order);
      const saved = updateWorkspace(uuid, { clips: sorted });
      return okJson({ uuid, order, clips: saved?.clips });
    }

    case 'score_video_moments': {
      const saved = editClipInWorkspace(uuid, String(args.clipId), {
        score: Number(args.score),
        ...(typeof args.reason === 'string' ? { reason: args.reason } : {}),
      });
      return okJson({ uuid, clips: saved.clips });
    }

    case 'generate_viral_title': {
      const saved = await refreshViralTitle(uuid);
      return okJson({
        uuid,
        title: saved.title,
        viralTitleCandidates: saved.viralTitleCandidates,
      });
    }

    case 'generate_video_description': {
      const ws = getWorkspace(uuid);
      if (!ws) throw new Error(`Workspace ${uuid} not found.`);
      const desc =
        typeof args.description === 'string'
          ? args.description
          : `${ws.title} — ${ws.clips.length} ranked moments (${ws.category}).`;
      const saved = updateWorkspace(uuid, { description: desc });
      return okJson({ uuid, description: saved?.description });
    }

    case 'trim_clip': {
      const saved = editClipInWorkspace(uuid, String(args.clipId), {
        startSec: Number(args.startSec),
        endSec: Number(args.endSec),
      });
      return okJson({ uuid, clips: saved.clips });
    }

    case 'set_clip_duration': {
      const ws = getWorkspace(uuid);
      if (!ws) throw new Error(`Workspace ${uuid} not found.`);
      const clip = ws.clips.find((c) => c.id === String(args.clipId));
      if (!clip) throw new Error(`Clip ${args.clipId} not found.`);
      const saved = editClipInWorkspace(uuid, clip.id, {
        startSec: clip.startSec,
        endSec: clip.startSec + Number(args.durationSec),
      });
      return okJson({ uuid, clips: saved.clips });
    }

    case 'crop_video':
    case 'resize_video': {
      const ratio = (args.aspectRatio as AspectRatioProfile) || '9:16';
      const saved = updateWorkspace(uuid, (prev) => ({
        ...prev,
        overlayConfig: { ...prev.overlayConfig, aspectRatio: ratio },
        exportMetadata: { ...prev.exportMetadata, exportProfile: ratio },
      }));
      if (!saved) throw new Error(`Workspace ${uuid} not found.`);
      return okJson({ uuid, aspectRatio: ratio });
    }

    case 'add_title': {
      const saved = updateWorkspace(uuid, (prev) => ({
        ...prev,
        title: String(args.title || prev.title),
        overlayConfig: {
          ...prev.overlayConfig,
          ...(typeof args.titlePlacement === 'string'
            ? { titlePlacement: args.titlePlacement as 'top-banner' | 'lower-third' | 'top-minimal' }
            : {}),
        },
      }));
      if (!saved) throw new Error(`Workspace ${uuid} not found.`);
      return okJson({ uuid, title: saved.title, overlayConfig: saved.overlayConfig });
    }

    case 'add_ranking_number': {
      const saved = updateWorkspace(uuid, (prev) => ({
        ...prev,
        overlayConfig: {
          ...prev.overlayConfig,
          showRankingNumber: typeof args.enabled === 'boolean' ? args.enabled : true,
          ...(typeof args.placement === 'string'
            ? { rankingBadgePlacement: args.placement as 'top-left' | 'top-right' | 'bottom-left' }
            : {}),
        },
      }));
      if (!saved) throw new Error(`Workspace ${uuid} not found.`);
      return okJson({ uuid, overlayConfig: saved.overlayConfig });
    }

    case 'add_captions': {
      if (typeof args.clipId === 'string' && typeof args.caption === 'string') {
        const saved = editClipInWorkspace(uuid, args.clipId, { caption: args.caption });
        return okJson({ uuid, clips: saved.clips });
      }
      const saved = updateWorkspace(uuid, (prev) => ({
        ...prev,
        overlayConfig: {
          ...prev.overlayConfig,
          showCaptions: typeof args.enabled === 'boolean' ? args.enabled : true,
        },
      }));
      if (!saved) throw new Error(`Workspace ${uuid} not found.`);
      return okJson({ uuid, overlayConfig: saved.overlayConfig });
    }

    case 'add_transitions': {
      const transition = (args.transition as 'fade' | 'cut' | 'slideleft' | 'zoom') || 'fade';
      const saved = updateWorkspace(uuid, (prev) => ({
        ...prev,
        clips: prev.clips.map((c) => ({ ...c, transition })),
      }));
      if (!saved) throw new Error(`Workspace ${uuid} not found.`);
      return okJson({ uuid, transition, clipCount: saved.clips.length });
    }

    case 'compose_ranking_video': {
      const ref = getReferenceById(typeof args.referenceId === 'string' ? args.referenceId : undefined);
      const saved = updateWorkspace(uuid, (prev) => ({
        ...prev,
        overlayConfig: {
          ...prev.overlayConfig,
          referenceId: ref.id,
          titlePlacement: ref.attributes.titlePlacement,
          rankingBadgePlacement: ref.attributes.rankingBadgePlacement,
          captionPlacement: ref.attributes.captionPlacement,
          backgroundTreatment: ref.attributes.backgroundTreatment,
          aspectRatio: (args.aspectRatio as AspectRatioProfile) || ref.attributes.aspectRatio,
        },
      }));
      if (!saved) throw new Error(`Workspace ${uuid} not found.`);
      return okJson({ uuid, reference: ref, overlayConfig: saved.overlayConfig });
    }

    case 'render_video': {
      const rendered = await renderWorkspaceCompilation({
        uuid,
        aspectRatio: args.aspectRatio as AspectRatioProfile | undefined,
        referenceId: typeof args.referenceId === 'string' ? args.referenceId : undefined,
      });
      const fileExists = Boolean(
        rendered.exportMetadata.renderedFilePath && fs.existsSync(rendered.exportMetadata.renderedFilePath)
      );
      if (!fileExists) {
        throw new Error('Render completed without producing output MP4.');
      }
      const links = buildWorkspaceUrls(rendered.uuid, baseUrl);
      return okJson({
        status: 'completed',
        uuid: rendered.uuid,
        title: rendered.title,
        renderedBytes: rendered.exportMetadata.renderedBytes,
        exportProfile: rendered.exportMetadata.exportProfile,
        links,
      });
    }

    case 'get_render_status': {
      const ws = getWorkspace(uuid);
      if (!ws) throw new Error(`Workspace ${uuid} not found.`);
      return okJson({ uuid, exportMetadata: ws.exportMetadata });
    }

    case 'get_video_preview':
    case 'export_video': {
      const ws = getWorkspace(uuid);
      if (!ws) throw new Error(`Workspace ${uuid} not found.`);
      const ready = Boolean(ws.exportMetadata.renderedFilePath && fs.existsSync(ws.exportMetadata.renderedFilePath));
      if (!ready) {
        throw new Error('Rendered video is not available yet. Run render_video first.');
      }
      return okJson({
        uuid,
        ready: true,
        links: buildWorkspaceUrls(uuid, baseUrl),
      });
    }

    case 'list_visual_references': {
      return okJson({ references: VISUAL_REFERENCES });
    }

    case 'list_providers': {
      return okJson({ providers: getProviderRegistry() });
    }

    case 'get_feedback_schema': {
      return okJson({
        endpoint: `${baseUrl.replace(/\/$/, '')}/api/review-feedback/`,
        method: 'POST',
        schema: {
          rating: 'integer (1..5, required)',
          category: 'AI Ranking | Video Render | MCP Integration | UI / UX | Bug Report | General',
          comment: 'string (optional)',
          issueDescription: 'string (optional)',
          projectUuid: 'string (optional)',
        },
      });
    }

    case 'submit_feedback': {
      const entry = await submitFeedback({
        rating: Number(args.rating),
        category: (args.category as FeedbackSubmission['category']) || 'General',
        comment: typeof args.comment === 'string' ? args.comment : '',
        projectUuid: typeof args.projectUuid === 'string' ? args.projectUuid : undefined,
      });
      return okJson({ submitted: true, feedback: entry });
    }

    default:
      throw new Error(`Unknown MCP tool: ${name}`);
  }
}

export async function handleMcpJsonRpc(
  body: unknown,
  baseUrl: string,
  actorId: string
): Promise<Record<string, unknown>> {
  const req = (body && typeof body === 'object' ? body : {}) as {
    jsonrpc?: string;
    id?: string | number | null;
    method?: string;
    params?: Record<string, unknown>;
  };

  const id = req.id ?? null;

  try {
    switch (req.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
              prompts: { listChanged: false },
            },
            serverInfo: {
              name: 'clippah-by-yuangames77',
              version: '1.0.0',
            },
          },
        };

      case 'notifications/initialized':
        return { jsonrpc: '2.0', id, result: {} };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { tools: MCP_TOOLS },
        };

      case 'tools/call': {
        const toolName = String(req.params?.name || '');
        const toolArgs = (req.params?.arguments as Record<string, unknown>) || {};
        if (!toolName) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing tool name in params.name' },
          };
        }
        try {
          const result = await executeMcpTool(toolName, toolArgs, baseUrl, actorId);
          return { jsonrpc: '2.0', id, result };
        } catch (toolErr) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: toolErr instanceof Error ? toolErr.message : String(toolErr),
                },
              ],
            },
          };
        }
      }

      case 'resources/list': {
        const workspaces = listWorkspaces(actorId);
        const resources = [
          {
            uri: 'clippah://references',
            name: 'Visual Reference Library',
            mimeType: 'application/json',
          },
          {
            uri: 'clippah://providers',
            name: 'AI & FFmpeg Provider Registry',
            mimeType: 'application/json',
          },
          ...workspaces.map((w) => ({
            uri: `clippah://workspace/${w.uuid}`,
            name: `Workspace: ${w.title} (${w.uuid})`,
            mimeType: 'application/json',
          })),
        ];
        return { jsonrpc: '2.0', id, result: { resources } };
      }

      case 'resources/read': {
        const uri = String(req.params?.uri || '');
        if (uri === 'clippah://references') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(VISUAL_REFERENCES, null, 2) }],
            },
          };
        }
        if (uri === 'clippah://providers') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(getProviderRegistry(), null, 2) }],
            },
          };
        }
        if (uri.startsWith('clippah://workspace/')) {
          const wsUuid = uri.replace('clippah://workspace/', '').replace(/\/$/, '');
          const ws = getWorkspace(wsUuid);
          if (!ws) {
            return { jsonrpc: '2.0', id, error: { code: -32004, message: `Workspace ${wsUuid} not found.` } };
          }
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify({ workspace: ws, links: buildWorkspaceUrls(ws.uuid, baseUrl) }, null, 2),
                },
              ],
            },
          };
        }
        return { jsonrpc: '2.0', id, error: { code: -32004, message: `Resource not found: ${uri}` } };
      }

      case 'prompts/list':
        return { jsonrpc: '2.0', id, result: { prompts: MCP_PROMPTS } };

      case 'prompts/get': {
        const promptName = String(req.params?.name || '');
        const found = MCP_PROMPTS.find((p) => p.name === promptName);
        if (!found) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: `Prompt not found: ${promptName}` } };
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            description: found.description,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Execute CLIPPAH workflow "${found.name}". ${found.description} Always verify rendered output via export_video before returning WORKSPACE, PREVIEW, and DOWNLOAD links.`,
                },
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        };
    }
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
