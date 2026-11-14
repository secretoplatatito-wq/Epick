import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const SAMPLES_DIR = path.resolve(process.cwd(), '.clippah_data', 'samples');

const SANS_FONT = fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
  ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
  : '';

export interface SamplePreset {
  id: string;
  label: string;
  category: string;
  scenes: Array<{ color: string; title: string; freq: number; duration: number }>;
}

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'funny-animals-compilation',
    label: 'Funny Animal Moments (6-Scene Sample MP4)',
    category: 'Funniest Animal Moments',
    scenes: [
      { color: '#1E293B', title: 'Scene 1: Cat vs Cucumber Jump', freq: 330, duration: 3 },
      { color: '#7C2D12', title: 'Scene 2: Golden Retriever Tail Spin', freq: 392, duration: 3 },
      { color: '#064E3B', title: 'Scene 3: Parrot Beatboxing Solo', freq: 440, duration: 3 },
      { color: '#312E81', title: 'Scene 4: Duckling Synchronized Dash', freq: 523, duration: 3 },
      { color: '#831843', title: 'Scene 5: Husky Dramatic Opera', freq: 587, duration: 3 },
      { color: '#14532D', title: 'Scene 6: Tiny Kitten High-Five', freq: 659, duration: 3 },
    ],
  },
  {
    id: 'sports-highlights-reel',
    label: 'Craziest Sports Moments (6-Scene Sample MP4)',
    category: 'Craziest Sports Moments',
    scenes: [
      { color: '#0F172A', title: 'Scene 1: Half-Court Buzzer Shot', freq: 293, duration: 3 },
      { color: '#7F1D1D', title: 'Scene 2: Diving Goal Line Save', freq: 349, duration: 3 },
      { color: '#1E3A8A', title: 'Scene 3: Bicycle Kick Top Corner', freq: 440, duration: 3 },
      { color: '#3F6212', title: 'Scene 4: Photo-Finish Sprint Surge', freq: 493, duration: 3 },
      { color: '#581C87', title: 'Scene 5: One-Handed Sideline Catch', freq: 587, duration: 3 },
      { color: '#78350F', title: 'Scene 6: Alley-Oop Poster Dunk', freq: 698, duration: 3 },
    ],
  },
];

export async function ensureSampleVideo(presetId: string): Promise<{ filePath: string; preset: SamplePreset }> {
  const preset = SAMPLE_PRESETS.find((p) => p.id === presetId) ?? SAMPLE_PRESETS[0];
  fs.mkdirSync(SAMPLES_DIR, { recursive: true });
  const outputPath = path.join(SAMPLES_DIR, `${preset.id}.mp4`);

  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 20_000) {
    return { filePath: outputPath, preset };
  }

  const fontArg = SANS_FONT ? `fontfile=${SANS_FONT}:` : '';
  const segPaths: string[] = [];

  for (let i = 0; i < preset.scenes.length; i++) {
    const sc = preset.scenes[i];
    const segPath = path.join(SAMPLES_DIR, `${preset.id}_seg_${i}.mp4`);
    const safeTitle = sc.title.replace(/:/g, '\\:').replace(/'/g, "\\'");

    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=${sc.color}:s=960x540:d=${sc.duration}:r=25`,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${sc.freq}:sample_rate=44100:duration=${sc.duration}`,
        '-vf',
        `drawbox=x=60:y=60:w=840:h=420:color=white@0.12:t=4,drawbox=x='100+mod(t*240,620)':y=320:w=120:h=80:color=0xF97316@0.9:t=fill,drawtext=${fontArg}text='${safeTitle}':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=190`,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-ar',
        '44100',
        '-ac',
        '2',
        '-shortest',
        segPath,
      ],
      { maxBuffer: 15 * 1024 * 1024 }
    );
    segPaths.push(segPath);
  }

  const concatPath = path.join(SAMPLES_DIR, `${preset.id}_concat.txt`);
  fs.writeFileSync(
    concatPath,
    segPaths.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'),
    'utf-8'
  );

  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatPath,
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    outputPath,
  ]);

  return { filePath: outputPath, preset };
}
