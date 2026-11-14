import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  AuthenticatedRequest,
  canAccessWorkspace,
  getStudioClientToken,
  requireApiAuth,
} from './backend/middleware/auth';
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  getWorkspaceDir,
  listWorkspaces,
  updateWorkspace,
} from './backend/storage/workspaceStore';
import {
  attachSampleVideoToWorkspace,
  attachUploadedVideoToWorkspace,
  buildWorkspaceUrls,
  editClipInWorkspace,
  refreshViralTitle,
  renderWorkspaceCompilation,
  runFullVideoAnalysisAndRanking,
} from './backend/services/pipelineService';
import { SAMPLE_PRESETS } from './backend/storage/sampleVideoGenerator';
import {
  detectScenes,
  inspectVideo,
  renderImageKenBurnsVideo,
} from './video-engine/ffmpegPipeline';
import { sortClipsForCountdown } from './video-engine/rankingEngine';
import { VISUAL_REFERENCES } from './ai/visualReferences';
import { getProviderRegistry } from './ai/providers/registry';
import {
  analyzeImageToOverlayConfig,
  animateImageViaInteractions,
  generateReferenceImage,
  runDeepRankingStrategy,
  searchViralTrendsGrounded,
} from './ai/orchestration/geminiService';
import {
  checkSpamRateLimit,
  listFeedbackSubmissions,
  submitFeedback,
} from './backend/email/feedbackService';
import { MCP_PROMPTS, MCP_TOOLS, handleMcpJsonRpc } from './mcp/server';
import type { AspectRatioProfile, FeedbackSubmission } from './backend/types';

const PORT = Number(process.env.PORT || 3000);
const UPLOAD_TMP_DIR = path.resolve(process.cwd(), '.clippah_data', 'tmp_uploads');
fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_TMP_DIR,
  limits: { fileSize: 250 * 1024 * 1024 },
});

function getBaseUrl(req: express.Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function streamVideoFile(filePath: string, req: express.Request, res: express.Response, downloadName?: string) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Not Found', message: 'Video file does not exist yet.' });
  }
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (downloadName) {
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  }
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': chunkSize,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': fileSize });
    fs.createReadStream(filePath).pipe(res);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Studio session token discovery (never exposes GEMINI_API_KEY or email secrets)
  app.get(['/api/auth/session', '/api/auth/session/'], (req, res) => {
    const baseUrl = getBaseUrl(req);
    res.json({
      authenticated: true,
      mcpEndpoint: `${baseUrl}/api/mcp/`,
      mcpToken: getStudioClientToken(),
      protocolVersion: '2024-11-05',
    });
  });

  // Public discovery metadata for providers, samples, and visual references
  app.get(['/api/providers', '/api/providers/'], (_req, res) => {
    res.json({ providers: getProviderRegistry() });
  });

  app.get(['/api/references', '/api/references/'], (_req, res) => {
    res.json({ references: VISUAL_REFERENCES });
  });

  app.get(['/api/samples', '/api/samples/'], (_req, res) => {
    res.json({ samples: SAMPLE_PRESETS });
  });

  // MCP Server Endpoint (GET discovery + POST JSON-RPC 2.0)
  app.get(['/api/mcp', '/api/mcp/'], requireApiAuth, (req: AuthenticatedRequest, res) => {
    const baseUrl = getBaseUrl(req);
    res.json({
      name: 'clippah-by-yuangames77',
      version: '1.0.0',
      protocol: 'Model Context Protocol (JSON-RPC 2.0 over HTTP)',
      endpoint: `${baseUrl}/api/mcp/`,
      toolsCount: MCP_TOOLS.length,
      tools: MCP_TOOLS,
      prompts: MCP_PROMPTS,
      resources: ['clippah://references', 'clippah://providers', 'clippah://workspace/{uuid}'],
    });
  });

  app.post(['/api/mcp', '/api/mcp/'], requireApiAuth, async (req: AuthenticatedRequest, res) => {
    const baseUrl = getBaseUrl(req);
    const actorId = req.authContext?.actorId || 'studio-admin';
    const responsePayload = await handleMcpJsonRpc(req.body, baseUrl, actorId);
    res.json(responsePayload);
  });

  // Workspace Routes
  app.get(['/api/workspace', '/api/workspace/'], requireApiAuth, (req: AuthenticatedRequest, res) => {
    const actorId = req.authContext?.actorId || 'studio-admin';
    const baseUrl = getBaseUrl(req);
    const items = listWorkspaces(actorId).map((w) => ({
      ...w,
      links: buildWorkspaceUrls(w.uuid, baseUrl),
    }));
    res.json({ workspaces: items });
  });

  app.post(['/api/workspace/create', '/api/workspace/create/'], requireApiAuth, (req: AuthenticatedRequest, res) => {
    const actorId = req.authContext?.actorId || 'studio-admin';
    const ws = createWorkspace({
      ownerId: actorId,
      title: req.body?.title,
      category: req.body?.category,
      instruction: req.body?.instruction,
      aspectRatio: req.body?.aspectRatio,
      referenceId: req.body?.referenceId,
    });
    res.status(201).json({ workspace: ws, links: buildWorkspaceUrls(ws.uuid, getBaseUrl(req)) });
  });

  app.get(['/api/workspace/:uuid', '/api/workspace/:uuid/'], requireApiAuth, (req: AuthenticatedRequest, res) => {
    const ws = getWorkspace(req.params.uuid);
    if (!ws) return res.status(404).json({ error: 'Not Found', message: 'Workspace not found.' });
    if (!canAccessWorkspace(ws, req.authContext?.actorId || '')) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this workspace.' });
    }
    res.json({ workspace: ws, links: buildWorkspaceUrls(ws.uuid, getBaseUrl(req)) });
  });

  app.patch(['/api/workspace/:uuid', '/api/workspace/:uuid/'], requireApiAuth, (req: AuthenticatedRequest, res) => {
    const ws = getWorkspace(req.params.uuid);
    if (!ws) return res.status(404).json({ error: 'Not Found', message: 'Workspace not found.' });
    if (!canAccessWorkspace(ws, req.authContext?.actorId || '')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const updated = updateWorkspace(ws.uuid, {
      ...(typeof req.body.title === 'string' ? { title: req.body.title } : {}),
      ...(typeof req.body.category === 'string' ? { category: req.body.category } : {}),
      ...(typeof req.body.description === 'string' ? { description: req.body.description } : {}),
      ...(typeof req.body.instruction === 'string' ? { instruction: req.body.instruction } : {}),
      ...(req.body.overlayConfig ? { overlayConfig: { ...ws.overlayConfig, ...req.body.overlayConfig } } : {}),
      ...(Array.isArray(req.body.clips) ? { clips: req.body.clips } : {}),
    });
    res.json({ workspace: updated, links: buildWorkspaceUrls(ws.uuid, getBaseUrl(req)) });
  });

  app.delete(['/api/workspace/:uuid', '/api/workspace/:uuid/'], requireApiAuth, (req: AuthenticatedRequest, res) => {
    const ws = getWorkspace(req.params.uuid);
    if (!ws) return res.status(404).json({ error: 'Not Found' });
    if (!canAccessWorkspace(ws, req.authContext?.actorId || '')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    deleteWorkspace(ws.uuid);
    res.json({ deleted: true, uuid: req.params.uuid });
  });

  // Preview, Download, Source & Keyframe Assets
  // Browser <video src="..."> and <a download> cannot attach custom Authorization headers cleanly,
  // so preview/download serve verified workspace output when rendered, or validate workspace existence.
  app.get(['/api/workspace/:uuid/preview', '/api/workspace/:uuid/preview/'], (req, res) => {
    const ws = getWorkspace(req.params.uuid);
    if (!ws) return res.status(404).json({ error: 'Not Found', message: 'Workspace not found.' });
    const renderedPath = ws.exportMetadata.renderedFilePath;
    if (!renderedPath || !fs.existsSync(renderedPath)) {
      return res.status(404).json({
        error: 'Render Not Available',
        message: 'Rendered video does not exist yet. Run /api/video/render/ first.',
      });
    }
    return streamVideoFile(renderedPath, req, res);
  });

  app.get(['/api/workspace/:uuid/download', '/api/workspace/:uuid/download/'], (req, res) => {
    const ws = getWorkspace(req.params.uuid);
    if (!ws) return res.status(404).json({ error: 'Not Found', message: 'Workspace not found.' });
    const renderedPath = ws.exportMetadata.renderedFilePath;
    if (!renderedPath || !fs.existsSync(renderedPath)) {
      return res.status(404).json({
        error: 'Render Not Available',
        message: 'Rendered video does not exist yet.',
      });
    }
    const safeSlug = ws.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'clippah-ranking';
    return streamVideoFile(renderedPath, req, res, `${safeSlug}-${ws.uuid.slice(0, 8)}.mp4`);
  });

  app.get(['/api/workspace/:uuid/source', '/api/workspace/:uuid/source/'], (req, res) => {
    const ws = getWorkspace(req.params.uuid);
    if (!ws || !ws.sourceVideoPath) return res.status(404).json({ error: 'Source video not found.' });
    return streamVideoFile(ws.sourceVideoPath, req, res);
  });

  app.get('/api/workspace/:uuid/asset/keyframes/:filename', (req, res) => {
    const ws = getWorkspace(req.params.uuid);
    if (!ws) return res.status(404).send('Not found');
    const safeFile = path.basename(req.params.filename);
    const fullPath = path.join(getWorkspaceDir(ws.uuid), 'keyframes', safeFile);
    if (!fs.existsSync(fullPath)) return res.status(404).send('Keyframe not found');
    res.sendFile(fullPath);
  });

  // Video Upload & Sample Video Attachment
  app.post(['/api/video/upload', '/api/video/upload/'], requireApiAuth, upload.single('video'), async (req, res) => {
    try {
      const uuid = String(req.body.uuid || '');
      if (!uuid || !req.file) {
        return res.status(400).json({ error: 'Bad Request', message: 'Workspace uuid and video file are required.' });
      }
      const updated = await attachUploadedVideoToWorkspace(uuid, req.file.path, req.file.originalname);
      res.json({ workspace: updated });
    } catch (err) {
      res.status(500).json({ error: 'Upload Failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post(['/api/video/sample', '/api/video/sample/'], requireApiAuth, async (req, res) => {
    try {
      const uuid = String(req.body.uuid || '');
      const presetId = String(req.body.presetId || 'funny-animals-compilation');
      if (!uuid) return res.status(400).json({ error: 'Workspace uuid is required.' });
      const updated = await attachSampleVideoToWorkspace(uuid, presetId);
      res.json({ workspace: updated });
    } catch (err) {
      res.status(500).json({ error: 'Sample Generation Failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  // Video Analysis, Scene Detection, Clips, Ranking & Rendering
  app.post(['/api/video/analyze', '/api/video/analyze/'], requireApiAuth, async (req, res) => {
    try {
      const updated = await runFullVideoAnalysisAndRanking({
        uuid: String(req.body.uuid),
        targetClipCount: req.body.targetClipCount ? Number(req.body.targetClipCount) : 6,
        category: req.body.category,
        instruction: req.body.instruction,
      });
      res.json({ workspace: updated, links: buildWorkspaceUrls(updated.uuid, getBaseUrl(req)) });
    } catch (err) {
      res.status(400).json({ error: 'Analysis Failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post(['/api/video/scenes', '/api/video/scenes/'], requireApiAuth, async (req, res) => {
    try {
      const ws = getWorkspace(String(req.body.uuid));
      if (!ws || !ws.sourceVideoPath) return res.status(404).json({ error: 'Source video not found.' });
      const meta = ws.videoMetadata ?? (await inspectVideo(ws.sourceVideoPath));
      const scenes = await detectScenes(ws.sourceVideoPath, meta.durationSec, Number(req.body.threshold || 0.22));
      const updated = updateWorkspace(ws.uuid, { scenes, videoMetadata: meta });
      res.json({ scenes, workspace: updated });
    } catch (err) {
      res.status(400).json({ error: 'Scene Detection Failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post(['/api/video/clips', '/api/video/clips/'], requireApiAuth, (req, res) => {
    try {
      const updated = editClipInWorkspace(String(req.body.uuid), String(req.body.clipId), req.body.updates || {});
      res.json({ workspace: updated });
    } catch (err) {
      res.status(400).json({ error: 'Clip Edit Failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post(['/api/video/ranking', '/api/video/ranking/'], requireApiAuth, (req, res) => {
    try {
      const ws = getWorkspace(String(req.body.uuid));
      if (!ws) return res.status(404).json({ error: 'Workspace not found.' });
      const order = req.body.order === 'top-first' ? 'top-first' : 'countdown';
      const sorted = sortClipsForCountdown(ws.clips, order);
      const updated = updateWorkspace(ws.uuid, { clips: sorted });
      res.json({ workspace: updated });
    } catch (err) {
      res.status(400).json({ error: 'Ranking Update Failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post(['/api/video/render', '/api/video/render/'], requireApiAuth, async (req, res) => {
    try {
      const rendered = await renderWorkspaceCompilation({
        uuid: String(req.body.uuid),
        aspectRatio: req.body.aspectRatio as AspectRatioProfile | undefined,
        referenceId: req.body.referenceId,
      });
      res.json({
        workspace: rendered,
        links: buildWorkspaceUrls(rendered.uuid, getBaseUrl(req)),
      });
    } catch (err) {
      res.status(500).json({ error: 'Render Failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  // AI Specialized Endpoints
  app.post(['/api/ai/title', '/api/ai/title/'], requireApiAuth, async (req, res) => {
    try {
      const updated = await refreshViralTitle(String(req.body.uuid));
      res.json({ title: updated.title, candidates: updated.viralTitleCandidates, workspace: updated });
    } catch (err) {
      res.status(400).json({ error: 'Title Generation Failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post(['/api/ai/captions', '/api/ai/captions/'], requireApiAuth, (req, res) => {
    try {
      const updated = editClipInWorkspace(String(req.body.uuid), String(req.body.clipId), {
        caption: String(req.body.caption || ''),
      });
      res.json({ workspace: updated });
    } catch (err) {
      res.status(400).json({ error: 'Caption Update Failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post(['/api/ai/visual-analysis', '/api/ai/visual-analysis/'], requireApiAuth, async (req, res) => {
    try {
      const base64Data = String(req.body.base64Data || '');
      const mimeType = String(req.body.mimeType || 'image/jpeg');
      if (!base64Data) return res.status(400).json({ error: 'base64Data is required.' });
      const result = await analyzeImageToOverlayConfig({
        base64Data,
        mimeType,
        prompt: req.body.prompt,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: 'Visual Analysis Failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post(['/api/ai/search-trends', '/api/ai/search-trends/'], requireApiAuth, async (req, res) => {
    try {
      const query = String(req.body.query || '').trim();
      if (!query) return res.status(400).json({ error: 'Search query is required.' });
      const result = await searchViralTrendsGrounded(query);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: 'Search Grounding Failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post(['/api/ai/deep-strategy', '/api/ai/deep-strategy/'], requireApiAuth, async (req, res) => {
    try {
      const result = await runDeepRankingStrategy({
        prompt: String(req.body.prompt || 'Optimize my #10 to #1 ranking arc and opening hook.'),
        category: String(req.body.category || 'Top Moments'),
        clipsContext: String(req.body.clipsContext || 'No clips attached yet.'),
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: 'Deep Strategy Failed', message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post(['/api/ai/generate-image', '/api/ai/generate-image/'], requireApiAuth, async (req, res) => {
    try {
      const prompt = String(req.body.prompt || '').trim();
      const aspectRatio = String(req.body.aspectRatio || '9:16');
      if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });
      const result = await generateReferenceImage({ prompt, aspectRatio });
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: 'Image Generation Unavailable',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post(['/api/ai/animate-image', '/api/ai/animate-image/'], requireApiAuth, async (req, res) => {
    try {
      const base64Data = String(req.body.base64Data || '');
      const mimeType = String(req.body.mimeType || 'image/png');
      const prompt = String(req.body.prompt || 'Smooth cinematic camera motion');
      const aspectRatio = req.body.aspectRatio === '9:16' ? '9:16' : '16:9';
      if (!base64Data) return res.status(400).json({ error: 'Image data is required.' });

      try {
        const result = await animateImageViaInteractions({ base64Data, mimeType, prompt, aspectRatio });
        return res.json({
          videoDataUrl: `data:${result.mimeType};base64,${result.videoBuffer.toString('base64')}`,
          modelUsed: result.modelUsed,
        });
      } catch (omniErr) {
        // Fallback: synthesize a genuine MP4 using FFmpeg zoompan Ken Burns motion so user still gets a playable MP4
        const tmpImg = path.join(UPLOAD_TMP_DIR, `anim_${Date.now()}.png`);
        const tmpVid = path.join(UPLOAD_TMP_DIR, `anim_${Date.now()}.mp4`);
        fs.writeFileSync(tmpImg, Buffer.from(base64Data, 'base64'));
        const buf = await renderImageKenBurnsVideo({
          imagePath: tmpImg,
          aspectRatio,
          outputFilePath: tmpVid,
          durationSec: 4,
        });
        fs.rmSync(tmpImg, { force: true });
        fs.rmSync(tmpVid, { force: true });
        return res.json({
          videoDataUrl: `data:video/mp4;base64,${buf.toString('base64')}`,
          modelUsed: 'FFmpeg Ken Burns MP4 Fallback',
          fallbackNotice:
            omniErr instanceof Error
              ? `${omniErr.message} (Rendered 4s ${aspectRatio} MP4 via local FFmpeg fallback.)`
              : 'Rendered via local FFmpeg fallback.',
        });
      }
    } catch (err) {
      res.status(400).json({
        error: 'Image Animation Failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Review and Feedback Endpoints
  app.get(['/api/review-feedback', '/api/review-feedback/'], (_req, res) => {
    res.json({ submissions: listFeedbackSubmissions() });
  });

  app.post(['/api/review-feedback', '/api/review-feedback/'], async (req, res) => {
    const ip = req.ip || 'local';
    const rate = checkSpamRateLimit(ip);
    if (!rate.allowed) {
      return res.status(429).json({
        error: 'Rate Limited',
        message: `Please wait ${rate.retryAfterSec}s before submitting again.`,
      });
    }

    try {
      const submission = await submitFeedback({
        rating: Number(req.body.rating),
        category: (req.body.category as FeedbackSubmission['category']) || 'General',
        comment: req.body.comment,
        issueDescription: req.body.issueDescription,
        projectUuid: req.body.projectUuid,
        honeypot: req.body.website,
      });
      res.status(201).json({
        success: true,
        message: 'Thank you! Your feedback has been recorded and routed to the CLIPPAH team.',
        submission,
      });
    } catch (err) {
      res.status(400).json({
        error: 'Validation Failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Vite dev middleware or production static assets
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CLIPPAH BY YUANGAMES77 server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CLIPPAH server:', err);
  process.exit(1);
});
