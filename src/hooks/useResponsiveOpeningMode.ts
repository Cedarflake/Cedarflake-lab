import { useEffect, useState } from 'react'

import type {
  MaimaiOpeningFitMode,
  MaimaiOpeningLayoutMode,
} from '../features/transition'

export type ResponsiveDeviceClass = 'desktop' | 'tablet' | 'phone'

type ResponsiveOpeningMode = {
  deviceClass: ResponsiveDeviceClass
  fitMode: MaimaiOpeningFitMode
  isPortrait: boolean
  layoutMode: MaimaiOpeningLayoutMode
}

function getResponsiveOpeningMode(): ResponsiveOpeningMode {
  if (typeof window === 'undefined') {
    return {
      deviceClass: 'desktop',
      fitMode: 'contain',
      isPortrait: false,
      layoutMode: 'frame',
    }
  }

  const width = window.innerWidth
  const height = window.innerHeight
  const shortestSide = Math.min(width, height)
  const isPortrait = height >= width

  let deviceClass: ResponsiveDeviceClass = 'desktop'

  if (shortestSide <= 767) {
    deviceClass = 'phone'
  } else if (shortestSide <= 1180) {
    deviceClass = 'tablet'
  }

  const useFullscreenPresentation = deviceClass !== 'desktop'

  return {
    deviceClass,
    fitMode: useFullscreenPresentation ? 'cover' : 'contain',
    isPortrait,
    layoutMode: useFullscreenPresentation ? 'fullscreen' : 'frame',
  }
}

export function useResponsiveOpeningMode() {
  const [mode, setMode] = useState<ResponsiveOpeningMode>(getResponsiveOpeningMode)

  useEffect(() => {
    const mediaQueryList = window.matchMedia('(orientation: portrait)')

    const updateMode = () => {
      setMode(getResponsiveOpeningMode())
    }

    updateMode()
    window.addEventListener('resize', updateMode)
    mediaQueryList.addEventListener('change', updateMode)

    return () => {
      window.removeEventListener('resize', updateMode)
      mediaQueryList.removeEventListener('change', updateMode)
    }
  }, [])

  return mode
}
