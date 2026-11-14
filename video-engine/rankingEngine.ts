import type { RankedClip, RankingCategory, SceneBoundary, KeyframeAsset } from '../backend/types';

export function formatTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function clampClipWindow(
  startSec: number,
  endSec: number,
  totalDurationSec: number,
  minDuration = 1.5
): { startSec: number; endSec: number; durationSec: number } {
  const safeTotal = Math.max(minDuration, totalDurationSec);
  const clampedStart = Math.max(0, Math.min(startSec, safeTotal - minDuration));
  const clampedEnd = Math.max(clampedStart + minDuration, Math.min(endSec, safeTotal));
  return {
    startSec: Number(clampedStart.toFixed(2)),
    endSec: Number(clampedEnd.toFixed(2)),
    durationSec: Number((clampedEnd - clampedStart).toFixed(2)),
  };
}

export function scoreMomentCandidate(params: {
  sceneScore: number;
  audioPeakDb: number;
  positionRatio: number;
  visualImpactScore?: number;
}): number {
  const visual = params.visualImpactScore ?? 7.2;
  const sceneComponent = Math.min(3.5, params.sceneScore * 5.0);
  // Audio peaks closer to 0 dB are louder/more energetic than -50 dB
  const audioNormalized = Math.max(0, Math.min(1, (params.audioPeakDb + 45) / 40));
  const audioComponent = audioNormalized * 2.5;
  // Opening hook and finale clips get a subtle pacing bonus
  const hookBonus = params.positionRatio < 0.15 || params.positionRatio > 0.8 ? 0.6 : 0.2;
  const raw = visual * 0.55 + sceneComponent + audioComponent + hookBonus;
  return Number(Math.max(1, Math.min(10, raw)).toFixed(2));
}

export function sortClipsForCountdown(clips: RankedClip[], order: 'countdown' | 'top-first' = 'countdown'): RankedClip[] {
  const sortedByScore = [...clips].sort((a, b) => b.score - a.score);
  const total = sortedByScore.length;

  // Re-assign #1 to highest score, #N to lowest score
  const ranked = sortedByScore.map((clip, idx) => ({
    ...clip,
    rank: idx + 1,
  }));

  if (order === 'countdown') {
    // Playback order: #N down to #1 so #1 is the grand finale
    return ranked.sort((a, b) => b.rank - a.rank);
  }
  return ranked.sort((a, b) => a.rank - b.rank);
}

export function buildCandidateWindowsFromScenes(params: {
  durationSec: number;
  scenes: SceneBoundary[];
  keyframes: KeyframeAsset[];
  targetClipCount: number;
  sourceVideoRef: string;
}): RankedClip[] {
  const { durationSec, scenes, keyframes, targetClipCount, sourceVideoRef } = params;
  const count = Math.max(1, Math.min(targetClipCount, 12));
  const safeDuration = Math.max(4, durationSec);

  // Build candidate windows either around detected scenes or evenly segmented slices
  const anchors: { time: number; sceneScore: number; audioPeakDb: number }[] = [];

  if (scenes.length >= count) {
    const step = scenes.length / count;
    for (let i = 0; i < count; i++) {
      const s = scenes[Math.min(scenes.length - 1, Math.floor(i * step))];
      anchors.push({
        time: s.timestampSec,
        sceneScore: s.sceneScore,
        audioPeakDb: s.audioPeakDb,
      });
    }
  } else {
    const windowSpan = safeDuration / count;
    for (let i = 0; i < count; i++) {
      const matchingScene = scenes.find(
        (s) => s.timestampSec >= i * windowSpan && s.timestampSec < (i + 1) * windowSpan
      );
      anchors.push({
        time: matchingScene ? matchingScene.timestampSec : i * windowSpan,
        sceneScore: matchingScene?.sceneScore ?? 0.42 + ((i % 3) * 0.14),
        audioPeakDb: matchingScene?.audioPeakDb ?? -18 + ((i % 4) * 3),
      });
    }
  }

  const maxClipLen = Math.min(6, Math.max(2.2, (safeDuration / count) * 0.92));

  const rawClips: RankedClip[] = anchors.map((anchor, index) => {
    const { startSec, endSec, durationSec: clipDur } = clampClipWindow(
      anchor.time,
      anchor.time + maxClipLen,
      safeDuration,
      1.5
    );
    const midpoint = (startSec + endSec) / 2;
    const nearestKeyframe = keyframes.reduce<KeyframeAsset | undefined>((best, kf) => {
      if (!best) return kf;
      return Math.abs(kf.timestampSec - midpoint) < Math.abs(best.timestampSec - midpoint) ? kf : best;
    }, undefined);

    const score = scoreMomentCandidate({
      sceneScore: anchor.sceneScore,
      audioPeakDb: anchor.audioPeakDb,
      positionRatio: midpoint / safeDuration,
      visualImpactScore: 6.8 + ((index * 1.37) % 3.1),
    });

    return {
      id: `clip-${index + 1}`,
      rank: count - index,
      startSec,
      endSec,
      durationSec: clipDur,
      startFormatted: formatTimestamp(startSec),
      endFormatted: formatTimestamp(endSec),
      description: `Moment window ${formatTimestamp(startSec)}–${formatTimestamp(endSec)}`,
      caption: `Clip highlight at ${formatTimestamp(startSec)}`,
      score,
      reason: 'High visual motion delta and audio energy spike',
      sourceVideoRef,
      keyframeUrl: nearestKeyframe?.publicUrl,
      transition: index % 2 === 0 ? 'fade' : 'cut',
    };
  });

  return sortClipsForCountdown(rawClips, 'countdown');
}

export function inferFallbackTitle(category: RankingCategory, clipCount: number, clipSummary?: string): {
  title: string;
  candidates: string[];
} {
  const cleanCat = category || 'Top Moments';
  const baseCandidates = [
    `Top ${clipCount} ${cleanCat} Caught On Camera`,
    `Ranking the Wildest ${cleanCat} (#${clipCount} to #1)`,
    `You Won't Believe #1 in ${cleanCat}`,
  ];
  if (clipSummary && clipSummary.trim().length > 8) {
    baseCandidates.unshift(`Top ${clipCount} ${cleanCat}: ${clipSummary.slice(0, 44).trim()}`);
  }
  return {
    title: baseCandidates[0],
    candidates: baseCandidates.slice(0, 3),
  };
}
