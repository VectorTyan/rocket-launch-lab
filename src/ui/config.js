/** Stable camera IDs are shared with scene controls and keyboard shortcuts. */
export const CAMERA_MODES = Object.freeze(
  [
    ['orbit', 'orbit', '自由环绕'],
    ['follow', 'target', '箭体跟随'],
    ['pad', 'camera', '地面追踪'],
    ['engine', 'engine', '发动机视角'],
    ['wide', 'globe', '飞行全景'],
    ['cinematic', 'camera', '电影镜头'],
  ].map(Object.freeze),
);

export const PLAYBACK_RATES = Object.freeze([1, 5, 20, 100, 600]);
