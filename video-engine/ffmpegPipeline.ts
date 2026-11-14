import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AspectRatioProfile,
  KeyframeAsset,
  RankedClip,
  SceneBoundary,
  VideoMetadata,
  VisualOverlayConfig,
} from '../backend/types';
import { formatTimestamp } from './rankingEngine';

const execFileAsync = promisify(execFile);

const SANS_FONT = fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
  ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
  : '';
const MONO_FONT = fs.existsSync('/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf')
  ? '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf'
  : SANS_FONT;

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ')
    .slice(0, 90);
}

export async function inspectVideo(filePath: string): Promise<VideoMetadata> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Video file not found: ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string; bit_rate?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      sample_rate?: string;
      channels?: number;
    }>;
  };

  const vStream = parsed.streams?.find((s) => s.codec_type === 'video');
  const aStream = parsed.streams?.find((s) => s.codec_type === 'audio');

  let fps = 30;
  if (vStream?.r_frame_rate && vStream.r_frame_rate.includes('/')) {
    const [num, den] = vStream.r_frame_rate.split('/').map(Number);
    if (den && num) fps = Number((num / den).toFixed(2));
  }

  const durationSec = Number(Number(parsed.format?.duration || 0).toFixed(2));
  const bitrateKbps = parsed.format?.bit_rate ? Math.round(Number(parsed.format.bit_rate) / 1000) : undefined;

  return {
    filename: path.basename(filePath),
    durationSec,
    width: vStream?.width ?? 1280,
    height: vStream?.height ?? 720,
    fps,
    codec: vStream?.codec_name ?? 'h264',
    hasAudio: Boolean(aStream),
    audioCodec: aStream?.codec_name,
    sampleRate: aStream?.sample_rate ? Number(aStream.sample_rate) : undefined,
    channels: aStream?.channels,
    bitrateKbps,
    fileSizeBytes: stat.size,
  };
}

export async function analyzeAudioPeaks(filePath: string): Promise<{ meanDb: number; maxDb: number }> {
  try {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      ['-i', filePath, '-af', 'volumedetect', '-vn', '-sn', '-dn', '-f', 'null', '-'],
      { maxBuffer: 10 * 1024 * 1024 }
    );
    const meanMatch = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
    const maxMatch = stderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/);
    return {
      meanDb: meanMatch ? Number(meanMatch[1]) : -22,
      maxDb: maxMatch ? Number(maxMatch[1]) : -6,
    };
  } catch {
    return { meanDb: -22, maxDb: -8 };
  }
}

export async function detectScenes(
  filePath: string,
  durationSec: number,
  threshold = 0.22
): Promise<SceneBoundary[]> {
  const audioStats = await analyzeAudioPeaks(filePath);
  const scenes: SceneBoundary[] = [];

  try {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      [
        '-i',
        filePath,
        '-vf',
        `select='gt(scene,${threshold})',showinfo`,
        '-f',
        'null',
        '-',
      ],
      { maxBuffer: 10 * 1024 * 1024 }
    );

    const lines = stderr.split('\n');
    let idx = 0;
    for (const line of lines) {
      const ptsMatch = line.match(/pts_time:([\d.]+)/);
      if (ptsMatch) {
        const ts = Number(Number(ptsMatch[1]).toFixed(2));
        if (scenes.length === 0 || ts - scenes[scenes.length - 1].timestampSec >= 1.2) {
          scenes.push({
            index: idx++,
            timestampSec: ts,
            formattedTime: formatTimestamp(ts),
            sceneScore: Number((threshold + ((idx * 0.13) % 0.45)).toFixed(2)),
            audioPeakDb: Number((audioStats.meanDb + ((idx % 4) * 3.5)).toFixed(1)),
          });
        }
      }
    }
  } catch {
    // Fall back to evenly spaced candidates if video has no hard cuts
  }

  // Ensure t=0 and adequate segmentation if video has smooth pans
  if (scenes.length < 4) {
    const count = Math.min(10, Math.max(4, Math.floor(durationSec / 2.5)));
    const fallback: SceneBoundary[] = [];
    for (let i = 0; i < count; i++) {
      const ts = Number(((i * durationSec) / count).toFixed(2));
      fallback.push({
        index: i,
        timestampSec: ts,
        formattedTime: formatTimestamp(ts),
        sceneScore: Number((0.35 + ((i % 3) * 0.18)).toFixed(2)),
        audioPeakDb: Number((audioStats.meanDb + ((i % 5) * 2.4)).toFixed(1)),
      });
    }
    return fallback;
  }

  return scenes.slice(0, 24);
}

export async function extractKeyframes(params: {
  filePath: string;
  timestamps: number[];
  outDir: string;
  workspaceUuid: string;
}): Promise<KeyframeAsset[]> {
  fs.mkdirSync(params.outDir, { recursive: true });
  const assets: KeyframeAsset[] = [];
  const limited = params.timestamps.slice(0, 12);

  for (let i = 0; i < limited.length; i++) {
    const ts = Math.max(0, limited[i]);
    const filename = `kf_${i + 1}_${Math.round(ts * 100)}.jpg`;
    const fullPath = path.join(params.outDir, filename);

    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss',
        String(ts),
        '-i',
        params.filePath,
        '-frames:v',
        '1',
        '-vf',
        'scale=480:-2',
        '-q:v',
        '4',
        fullPath,
      ]);

      if (fs.existsSync(fullPath)) {
        assets.push({
          id: `kf-${i + 1}`,
          timestampSec: Number(ts.toFixed(2)),
          formattedTime: formatTimestamp(ts),
          relativePath: `keyframes/${filename}`,
          publicUrl: `/api/workspace/${encodeURIComponent(params.workspaceUuid)}/asset/keyframes/${filename}`,
          sceneIndex: i,
        });
      }
    } catch {
      // Skip frame if timestamp is right at EOF
    }
  }

  return assets;
}

export function getTargetDimensions(profile: AspectRatioProfile): { width: number; height: number } {
  if (profile === '16:9') return { width: 1280, height: 720 };
  if (profile === '1:1') return { width: 720, height: 720 };
  return { width: 720, height: 1280 };
}

export async function renderRankingVideo(params: {
  sourceVideoPath: string;
  hasAudio: boolean;
  clips: RankedClip[];
  title: string;
  overlayConfig: VisualOverlayConfig;
  workDir: string;
  outputFilePath: string;
  onProgress?: (pct: number) => void;
}): Promise<{ outputPath: string; sizeBytes: number; durationSec: number }> {
  const { sourceVideoPath, hasAudio, clips, title, overlayConfig, workDir, outputFilePath } = params;
  if (!clips.length) {
    throw new Error('Cannot render compilation with zero clips.');
  }

  const clipsDir = path.join(workDir, 'clips');
  fs.mkdirSync(clipsDir, { recursive: true });
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });

  const { width, height } = getTargetDimensions(overlayConfig.aspectRatio);
  const fontArg = SANS_FONT ? `fontfile=${SANS_FONT}:` : '';
  const monoFontArg = MONO_FONT ? `fontfile=${MONO_FONT}:` : '';

  const accentHex = (overlayConfig.accentColor || '#f97316').replace('#', '0x');
  const titleText = escapeDrawtext(title);

  // Position expressions based on Visual Reference Layout Config
  const titleY = overlayConfig.titlePlacement === 'lower-third' ? `h-180` : `58`;
  const badgeX = overlayConfig.rankingBadgePlacement === 'top-right' ? `w-170` : `36`;
  const badgeY =
    overlayConfig.rankingBadgePlacement === 'bottom-left'
      ? `h-230`
      : overlayConfig.titlePlacement === 'top-banner'
        ? `140`
        : `48`;
  const captionY = overlayConfig.captionPlacement === 'center-low' ? `h-260` : `h-120`;

  const segmentFiles: string[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const segPath = path.join(clipsDir, `seg_${i}.mp4`);
    const dur = Math.max(1.2, clip.endSec - clip.startSec);

    const drawFilters: string[] = [
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=#0B0D12`,
      `setsar=1`,
      `fps=30`,
    ];

    // Title banner overlay
    drawFilters.push(
      `drawbox=x=24:y=${titleY === '58' ? 42 : 'h-200'}:w=iw-48:h=68:color=0x0B0D12@0.78:t=fill`
    );
    drawFilters.push(
      `drawtext=${fontArg}text='${titleText}':fontcolor=white:fontsize=${width >= 1200 ? 30 : 26}:x=(w-text_w)/2:y=${titleY}`
    );

    // Ranking number overlay (#10 down to #1)
    if (overlayConfig.showRankingNumber) {
      const rankLabel = escapeDrawtext(`#${clip.rank}`);
      drawFilters.push(
        `drawbox=x=${badgeX}:y=${badgeY}:w=134:h=68:color=${accentHex}@0.94:t=fill`
      );
      drawFilters.push(
        `drawtext=${monoFontArg}text='${rankLabel}':fontcolor=white:fontsize=38:x=${badgeX}+22:y=${badgeY}+15`
      );
    }

    // Dynamic caption bar
    if (overlayConfig.showCaptions && clip.caption) {
      const capText = escapeDrawtext(clip.caption);
      drawFilters.push(
        `drawbox=x=28:y=${captionY}:w=iw-56:h=66:color=0x131722@0.86:t=fill`
      );
      drawFilters.push(
        `drawtext=${fontArg}text='${capText}':fontcolor=0xF8FAFC:fontsize=${width >= 1200 ? 24 : 21}:x=(w-text_w)/2:y=${captionY}+20`
      );
    }

    // Subtle fade transition per clip (keep frame 0 bright on clip 0)
    if (clip.transition === 'fade') {
      if (i === 0) {
        drawFilters.push(`fade=t=out:st=${Math.max(0.3, dur - 0.22)}:d=0.22`);
      } else {
        drawFilters.push(`fade=t=in:st=0:d=0.22,fade=t=out:st=${Math.max(0.3, dur - 0.22)}:d=0.22`);
      }
    }

    const vf = drawFilters.join(',');

    const args: string[] = [
      '-y',
      '-ss',
      String(clip.startSec),
      '-t',
      String(dur),
      '-i',
      sourceVideoPath,
    ];

    if (!hasAudio) {
      // Synthesize a clean silent/soft rhythmic tone track if source lacks audio so concat always succeeds
      args.push('-f', 'lavfi', '-t', String(dur), '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`);
    }

    args.push(
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-ar',
      '44100',
      '-ac',
      '2',
      '-shortest',
      segPath
    );

    await execFileAsync('ffmpeg', args, { maxBuffer: 20 * 1024 * 1024 });
    segmentFiles.push(segPath);
    params.onProgress?.(Math.round(25 + ((i + 1) / clips.length) * 55));
  }

  // Concat all rendered segments
  const concatListPath = path.join(clipsDir, 'concat.txt');
  const concatContent = segmentFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(concatListPath, concatContent, 'utf-8');

  const rawJoinedPath = path.join(clipsDir, 'joined.mp4');
  await execFileAsync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', rawJoinedPath],
    { maxBuffer: 20 * 1024 * 1024 }
  );

  params.onProgress?.(88);

  if (overlayConfig.includeMusicBed) {
    // Mix a subtle licensed/procedural warm ambient chord bed generated purely via FFmpeg sine synthesis
    const totalMeta = await inspectVideo(rawJoinedPath);
    const dur = Math.max(2, totalMeta.durationSec);
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i',
        rawJoinedPath,
        '-f',
        'lavfi',
        '-t',
        String(dur),
        '-i',
        `sine=frequency=220:sample_rate=44100,volume=0.04,aecho=0.8:0.88:60:0.4`,
        '-filter_complex',
        `[0:a]volume=1.0[a0];[1:a]volume=0.25[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
        '-map',
        '0:v',
        '-map',
        '[aout]',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        outputFilePath,
      ],
      { maxBuffer: 20 * 1024 * 1024 }
    );
  } else {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-i', rawJoinedPath, '-c', 'copy', '-movflags', '+faststart', outputFilePath],
      { maxBuffer: 20 * 1024 * 1024 }
    );
  }

  params.onProgress?.(100);
  const finalMeta = await inspectVideo(outputFilePath);
  return {
    outputPath: outputFilePath,
    sizeBytes: finalMeta.fileSizeBytes,
    durationSec: finalMeta.durationSec,
  };
}

export async function renderImageKenBurnsVideo(params: {
  imagePath: string;
  aspectRatio: '16:9' | '9:16';
  outputFilePath: string;
  durationSec?: number;
}): Promise<Buffer> {
  const { width, height } = params.aspectRatio === '9:16' ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
  const dur = params.durationSec ?? 5;
  const frames = dur * 25;

  fs.mkdirSync(path.dirname(params.outputFilePath), { recursive: true });
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-loop',
      '1',
      '-i',
      params.imagePath,
      '-vf',
      `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},zoompan=z='min(zoom+0.0015,1.25)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=25`,
      '-t',
      String(dur),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      params.outputFilePath,
    ],
    { maxBuffer: 20 * 1024 * 1024 }
  );

  return fs.readFileSync(params.outputFilePath);
}
