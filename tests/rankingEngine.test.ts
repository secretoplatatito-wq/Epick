import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCandidateWindowsFromScenes,
  clampClipWindow,
  formatTimestamp,
  inferFallbackTitle,
  scoreMomentCandidate,
  sortClipsForCountdown,
} from '../video-engine/rankingEngine';

test('formatTimestamp formats mm:ss accurately', () => {
  assert.equal(formatTimestamp(0), '00:00');
  assert.equal(formatTimestamp(5), '00:05');
  assert.equal(formatTimestamp(67), '01:07');
});

test('clampClipWindow keeps timestamps within video duration', () => {
  const clamped = clampClipWindow(-2, 45, 18, 1.5);
  assert.equal(clamped.startSec, 0);
  assert.equal(clamped.endSec, 18);
  assert.equal(clamped.durationSec, 18);

  const tail = clampClipWindow(17.5, 18, 18, 1.5);
  assert.equal(tail.startSec, 16.5);
  assert.equal(tail.endSec, 18);
  assert.equal(tail.durationSec, 1.5);
});

test('sortClipsForCountdown assigns #1 to highest score and orders #N down to #1', () => {
  const clips = [
    {
      id: 'a',
      rank: 1,
      startSec: 0,
      endSec: 3,
      durationSec: 3,
      startFormatted: '00:00',
      endFormatted: '00:03',
      description: 'Low',
      caption: 'Low',
      score: 5.2,
      reason: 'test',
      sourceVideoRef: 'v.mp4',
      transition: 'fade' as const,
    },
    {
      id: 'b',
      rank: 2,
      startSec: 4,
      endSec: 7,
      durationSec: 3,
      startFormatted: '00:04',
      endFormatted: '00:07',
      description: 'Peak',
      caption: 'Peak',
      score: 9.7,
      reason: 'test',
      sourceVideoRef: 'v.mp4',
      transition: 'cut' as const,
    },
    {
      id: 'c',
      rank: 3,
      startSec: 8,
      endSec: 11,
      durationSec: 3,
      startFormatted: '00:08',
      endFormatted: '00:11',
      description: 'Mid',
      caption: 'Mid',
      score: 7.5,
      reason: 'test',
      sourceVideoRef: 'v.mp4',
      transition: 'fade' as const,
    },
  ];

  const countdown = sortClipsForCountdown(clips, 'countdown');
  assert.deepEqual(
    countdown.map((c) => ({ id: c.id, rank: c.rank })),
    [
      { id: 'a', rank: 3 },
      { id: 'c', rank: 2 },
      { id: 'b', rank: 1 },
    ]
  );

  const topFirst = sortClipsForCountdown(clips, 'top-first');
  assert.deepEqual(
    topFirst.map((c) => ({ id: c.id, rank: c.rank })),
    [
      { id: 'b', rank: 1 },
      { id: 'c', rank: 2 },
      { id: 'a', rank: 3 },
    ]
  );
});

test('buildCandidateWindowsFromScenes generates exact requested clip count in countdown order', () => {
  const scenes = [
    { index: 0, timestampSec: 0, formattedTime: '00:00', sceneScore: 0.4, audioPeakDb: -12 },
    { index: 1, timestampSec: 3, formattedTime: '00:03', sceneScore: 0.65, audioPeakDb: -8 },
    { index: 2, timestampSec: 6, formattedTime: '00:06', sceneScore: 0.5, audioPeakDb: -14 },
    { index: 3, timestampSec: 9, formattedTime: '00:09', sceneScore: 0.8, audioPeakDb: -5 },
    { index: 4, timestampSec: 12, formattedTime: '00:12', sceneScore: 0.45, audioPeakDb: -16 },
  ];
  const clips = buildCandidateWindowsFromScenes({
    durationSec: 18,
    scenes,
    keyframes: [],
    targetClipCount: 5,
    sourceVideoRef: 'sample.mp4',
  });
  assert.equal(clips.length, 5);
  assert.equal(clips[0].rank, 5);
  assert.equal(clips[clips.length - 1].rank, 1);
  assert.ok(scoreMomentCandidate({ sceneScore: 0.8, audioPeakDb: -5, positionRatio: 0.9 }) <= 10);
});

test('inferFallbackTitle returns category-specific title and 3 candidates', () => {
  const res = inferFallbackTitle('Craziest Sports Moments', 10);
  assert.ok(res.title.includes('Craziest Sports Moments'));
  assert.equal(res.candidates.length, 3);
});
