import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import styles from './App.module.css'
import { RouteShowcasePage } from './features/demo/RouteShowcasePage'
import {
  getDemoRouteScene,
  type DemoRouteScene,
} from './features/demo/routeScenes'
import {
  MaimaiOpening,
  type MaimaiOpeningFitMode,
  type MaimaiOpeningLayoutMode,
  type TransitionStatus,
} from './features/transition'
import { useResponsiveOpeningMode } from './hooks/useResponsiveOpeningMode'

type ActiveRouteTransition = {
  key: number
  mode: 'initial' | 'route'
}

let hasPlayedInitialRouteDemoTransition = false

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const transitionKeyRef = useRef(0)
  const pendingPathRef = useRef<DemoRouteScene['path'] | null>(null)
  const hasHandledSceneSwapRef = useRef(false)
  const [activeTransition, setActiveTransition] = useState<ActiveRouteTransition | null>(null)
  const { deviceClass, fitMode, layoutMode } = useResponsiveOpeningMode()

  const currentScene = useMemo(
    () => getDemoRouteScene(location.pathname),
    [location.pathname],
  )

  const openTransition = useCallback((mode: ActiveRouteTransition['mode']) => {
    transitionKeyRef.current += 1
    setActiveTransition({
      key: transitionKeyRef.current,
      mode,
    })
  }, [])

  useEffect(() => {
    if (hasPlayedInitialRouteDemoTransition) {
      return
    }

    hasPlayedInitialRouteDemoTransition = true
    openTransition('initial')
  }, [openTransition])

  const startRouteTransition = useCallback(
    (targetPath: DemoRouteScene['path']) => {
      if (activeTransition || targetPath === currentScene.path) {
        return
      }

      pendingPathRef.current = targetPath
      hasHandledSceneSwapRef.current = false
      openTransition('route')
    },
    [activeTransition, currentScene.path, openTransition],
  )

  const handleSceneSwap = useCallback(() => {
    if (hasHandledSceneSwapRef.current) {
      return
    }

    hasHandledSceneSwapRef.current = true

    const pendingPath = pendingPathRef.current

    if (pendingPath && pendingPath !== currentScene.path) {
      navigate(pendingPath)
    }
  }, [currentScene.path, navigate])

  const handleOpeningStatusChange = useCallback((status: TransitionStatus) => {
    if (status !== 'finished') {
      return
    }

    pendingPathRef.current = null
    hasHandledSceneSwapRef.current = false
    setActiveTransition(null)
  }, [])

  const openingClassName = [
    styles.transitionOpening,
    deviceClass === 'phone' ? styles.transitionOpeningPhone : '',
    deviceClass === 'tablet' ? styles.transitionOpeningTablet : '',
    layoutMode === 'fullscreen' ? styles.transitionOpeningFullscreen : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <main className={styles.appShell}>
      <div className={styles.routeLayer}>
        <Routes>
          <Route
            path="/"
            element={
              <RouteShowcasePage
                isTransitioning={activeTransition !== null}
                onNavigate={startRouteTransition}
                scene={currentScene}
              />
            }
          />
          <Route
            path="/music"
            element={
              <RouteShowcasePage
                isTransitioning={activeTransition !== null}
                onNavigate={startRouteTransition}
                scene={currentScene}
              />
            }
          />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </div>

      {activeTransition ? (
        <div className={styles.transitionOverlay}>
          <MaimaiOpening
            key={activeTransition.key}
            className={openingClassName}
            fitMode={fitMode as MaimaiOpeningFitMode}
            initialStageBackgroundColor={
              activeTransition.mode === 'initial' ? '#ffffff' : 'transparent'
            }
            layoutMode={layoutMode as MaimaiOpeningLayoutMode}
            onSceneSwap={handleSceneSwap}
            onStatusChange={handleOpeningStatusChange}
            stageBackgroundColor="transparent"
          />
        </div>
      ) : null}
    </main>
  )
}

export default App
