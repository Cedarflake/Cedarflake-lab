import { BACKGROUND_IMAGE_PATHS } from '../../generated/backgroundManifest'

const FALLBACK_BACKGROUND_IMAGE_PATH = '/assets/background/maimai-2025-bg.png'
const LEGACY_MAIMAI_BACKGROUND_IMAGE_PATH = '/assets/background/maimai-2025-bg.png'

type DemoRoutePath = '/' | '/music'

export type DemoRouteScene = {
  accentLabel: string
  backgroundImage: string
  description: string
  path: DemoRoutePath
  title: string
}

function pickPrimaryBackground() {
  return (
    BACKGROUND_IMAGE_PATHS.find((imagePath) => imagePath.endsWith('maimai-2025-bg.png')) ??
    BACKGROUND_IMAGE_PATHS[0] ??
    FALLBACK_BACKGROUND_IMAGE_PATH
  )
}

const PRIMARY_BACKGROUND_IMAGE = pickPrimaryBackground()

const MUSIC_BACKGROUND_IMAGE_CANDIDATES = BACKGROUND_IMAGE_PATHS.filter(
  (imagePath) => imagePath !== PRIMARY_BACKGROUND_IMAGE,
)

function pickMusicBackground() {
  if (MUSIC_BACKGROUND_IMAGE_CANDIDATES.length === 0) {
    return LEGACY_MAIMAI_BACKGROUND_IMAGE_PATH
  }

  const randomIndex = Math.floor(Math.random() * MUSIC_BACKGROUND_IMAGE_CANDIDATES.length)

  return MUSIC_BACKGROUND_IMAGE_CANDIDATES[randomIndex] ?? LEGACY_MAIMAI_BACKGROUND_IMAGE_PATH
}

export const DEMO_ROUTE_SCENES: Record<DemoRoutePath, DemoRouteScene> = {
  '/': {
    accentLabel: 'Route Demo · Home',
    backgroundImage: PRIMARY_BACKGROUND_IMAGE,
    description:
      '当前首页用于展示开场动画完成后停留的主场景，点击下方按钮会在转场中途切到 /music。',
    path: '/',
    title: 'Maimai Opening Route Demo',
  },
  '/music': {
    accentLabel: 'Route Demo · Music',
    backgroundImage: LEGACY_MAIMAI_BACKGROUND_IMAGE_PATH,
    description:
      '这里模拟另一个页面场景。点击返回首页时，会先盖上转场，再在安全时机切回根路由。',
    path: '/music',
    title: 'Music Scene Showcase',
  },
}

export function getDemoRouteScene(pathname: string): DemoRouteScene {
  if (pathname === '/music' || pathname.startsWith('/music/')) {
    return {
      ...DEMO_ROUTE_SCENES['/music'],
      backgroundImage: pickMusicBackground(),
    }
  }

  return DEMO_ROUTE_SCENES['/']
}
