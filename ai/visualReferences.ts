import type { VisualReferenceItem } from '../backend/types';

export const VISUAL_REFERENCES: VisualReferenceItem[] = [
  {
    id: 'ref-vertical-top10',
    imageUrl: '/src/assets/images/ref_vertical_ranking_top10_1794676541123.jpg',
    category: 'Vertical Ranking Show',
    description:
      'High-impact 9:16 vertical ranking layout with bold top title banner, upper-left ranking badge, centered focal frame, and bottom-third caption card.',
    recommendedUse: 'Default short-form #10 to #1 countdown compilations (Shorts, Reels, TikTok).',
    supportedFormats: ['9:16', '1:1'],
    attributes: {
      titlePlacement: 'top-banner',
      rankingBadgePlacement: 'top-left',
      captionPlacement: 'bottom-third',
      typography: 'Outfit Bold + JetBrains Mono numerals',
      textAnimation: 'Snap scale-in on clip cut (140ms)',
      captionStyling: 'High-contrast white on dark translucent pill bar',
      aspectRatio: '9:16',
      transitionStyle: 'fade',
      backgroundTreatment: 'obsidian-blur',
    },
  },
  {
    id: 'ref-sports-hud',
    imageUrl: '/src/assets/images/ref_sports_highlights_hud_1794676541274.jpg',
    category: 'Sports Broadcast HUD',
    description:
      'Widescreen 16:9 broadcast replay aesthetic featuring a crisp upper-left rank tag and sleek lower-third athlete/moment title bar.',
    recommendedUse: 'Craziest Sports Moments and landscape YouTube highlight countdowns.',
    supportedFormats: ['16:9'],
    attributes: {
      titlePlacement: 'lower-third',
      rankingBadgePlacement: 'top-left',
      captionPlacement: 'bottom-bar',
      typography: 'Outfit Condensed + Tabular Mono counter',
      textAnimation: 'Horizontal slide-in from left',
      captionStyling: 'Broadcast slate lower-third strip',
      aspectRatio: '16:9',
      transitionStyle: 'cut',
      backgroundTreatment: 'studio-frame',
    },
  },
  {
    id: 'ref-animal-comedy',
    imageUrl: '/src/assets/images/ref_animal_comedy_split_1794676541640.jpg',
    category: 'Animal & Comedy Split',
    description:
      'Playful vertical compilation template with a high-contrast header card at top, rounded center video window, and bold yellow reaction caption strip.',
    recommendedUse: 'Funniest Animal Moments, Funniest Fails, and Top 10 Incredible Animal Reactions.',
    supportedFormats: ['9:16'],
    attributes: {
      titlePlacement: 'top-banner',
      rankingBadgePlacement: 'top-right',
      captionPlacement: 'bottom-third',
      typography: 'Outfit ExtraBold headline + Sans reaction captions',
      textAnimation: 'Pop bounce entrance',
      captionStyling: 'Amber/Yellow high-visibility punchline bar',
      aspectRatio: '9:16',
      transitionStyle: 'fade',
      backgroundTreatment: 'clean-matte',
    },
  },
  {
    id: 'ref-minimal-satisfying',
    imageUrl: '/src/assets/images/ref_minimal_satisfying_loop_1794676542797.jpg',
    category: 'Minimalist Kinetic Loop',
    description:
      'Clean square/vertical minimalist studio frame with understated top typography, unobstructed center subject, and slim bottom timeline indicator.',
    recommendedUse: 'Most Satisfying Videos and Most Unbelievable Coincidences.',
    supportedFormats: ['1:1', '9:16', '16:9'],
    attributes: {
      titlePlacement: 'top-minimal',
      rankingBadgePlacement: 'bottom-left',
      captionPlacement: 'bottom-bar',
      typography: 'Outfit Light uppercase tracking + clean numerals',
      textAnimation: 'Cross-dissolve 220ms',
      captionStyling: 'Minimalist subtitle line without box',
      aspectRatio: '1:1',
      transitionStyle: 'fade',
      backgroundTreatment: 'clean-matte',
    },
  },
];

export function getReferenceById(id?: string): VisualReferenceItem {
  return VISUAL_REFERENCES.find((r) => r.id === id) ?? VISUAL_REFERENCES[0];
}
