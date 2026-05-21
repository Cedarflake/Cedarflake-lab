import styles from './RouteShowcasePage.module.css'
import type { DemoRouteScene } from './routeScenes'

type RouteShowcasePageProps = {
  isTransitioning: boolean
  onNavigate: (path: DemoRouteScene['path']) => void
  scene: DemoRouteScene
}

export function RouteShowcasePage({
  isTransitioning,
  onNavigate,
  scene,
}: RouteShowcasePageProps) {
  const nextPath = scene.path === '/' ? '/music' : '/'
  const nextLabel = nextPath === '/music' ? '前往 /music' : '返回根目录'
  const secondaryLabel = scene.path === '/' ? '主页场景' : 'Music 场景'

  return (
    <section
      className={styles.page}
      style={{ backgroundImage: `url("${scene.backgroundImage}")` }}
    >
      <div className={styles.content}>
        <header className={styles.topBar}>
          <div className={styles.brand} data-smooth-corners="pill">
            <span className={styles.brandDot} data-smooth-corners="pill" />
            舞萌转场 · 路由切换 Demo
          </div>

          <button
            type="button"
            data-smooth-corners="pill"
            className={`${styles.secondaryButton} ${styles.sceneStatusButton}`}
            disabled
          >
            {isTransitioning ? '转场进行中…' : secondaryLabel}
          </button>
        </header>

        <main className={styles.hero}>
          <span className={styles.accentLabel} data-smooth-corners="pill">
            {scene.accentLabel}
          </span>
          <h1 className={styles.title}>{scene.title}</h1>
          <p className={styles.description}>{scene.description}</p>

          <div className={styles.actions}>
            <button
              type="button"
              data-smooth-corners="pill"
              className={styles.primaryButton}
              disabled={isTransitioning}
              onClick={() => onNavigate(nextPath)}
            >
              {nextLabel}
            </button>
          </div>
        </main>

        <footer className={styles.footer}>
          <span className={styles.note} data-smooth-corners="md">
            点击按钮后不会立刻切页，而是先播放开场遮罩；到时间轴的场景切换点才真正导航。
          </span>
        </footer>
      </div>
    </section>
  )
}
