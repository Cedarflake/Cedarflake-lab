export const MAIMAI_SVG_PATH = '/maimai-transition.svg'

export const MAIMAI_TIMINGS = {
  globalDelay: 0.17,
  chipDelay: 0.15,
  chipInDuration: 0.62,
  baseInDuration: 0.8,
  purpleInDuration: 0.7,
  whiteInDuration: 0.68,
  holdSlideInDurationMin: 0.55,
  holdSlideInDurationMax: 0.8,
  holdSlideInDelayMin: 0.17,
  holdSlideInDelayMax: 0.23,
  chipExitAt: 1.62,
  sceneSwapAt: 1.6,
  baseExitAt: 1.746,
  holdSlideExitAt: 1.746,
  chipOutDuration: 0.42,
  baseOutDuration: 0.7,
  purpleOutDuration: 0.7,
  whiteOutDuration: 0.68,
  holdSlideOutDurationMin: 0.27,
  holdSlideOutDurationMax: 0.31,
  holdSlideOutDelayMin: 1.746,
  holdSlideOutDelayMax: 1.766,
  estimatedTotalDuration: 2.48,
} as const

export const MAIMAI_SELECTORS = {
  chip: '#滴拉熊',
  baseTopLeft: '#左上小方块, #左上底板',
  baseBottomRight: '#右下小方块, #右下底板',
  purpleTopLeft: '#两角淡紫 > [id="左上"]',
  purpleBottomRight: '#两角淡紫 > [id="右下"]',
  whiteTopLeft: '#两角白色 > [id="左上"]',
  whiteBottomRight: '#两角白色 > [id="右下"]',
  holds: '#HOLD > use',
  slides: '#Slide > use',
} as const

export const SVG_CENTER = {
  x: 1920,
  y: 1080,
} as const
