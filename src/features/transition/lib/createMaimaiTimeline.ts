import { gsap } from 'gsap'

import {
  MAIMAI_SELECTORS,
  MAIMAI_TIMINGS,
  SVG_CENTER,
} from '../constants'

type TimelineLifecycle = {
  onStart?: () => void
  onComplete?: () => void
  onSceneSwap?: () => void
  preserveAspectRatio?: 'xMidYMid meet' | 'xMidYMid slice'
  sceneSwapAt?: number
}

function queryRequired<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)

  if (!element) {
    throw new Error(`缺少 SVG 图层：${selector}`)
  }

  return element
}

function queryAll<T extends Element>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector))
}

function applySvgStyles(
  elements: Element | Element[],
  styles: Partial<CSSStyleDeclaration>,
) {
  const list = Array.isArray(elements) ? elements : [elements]

  list.forEach((element) => {
    Object.assign((element as SVGElement).style, styles)
  })
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function addCornerIn(
  timeline: gsap.core.Timeline,
  target: Element,
  startAt: number,
  duration: number,
  direction: 'topLeft' | 'bottomRight',
) {
  const overshootX = direction === 'topLeft' ? 100 : -100
  const overshootY = direction === 'topLeft' ? 60 : -60
  const recoilX = direction === 'topLeft' ? -25 : 25
  const recoilY = direction === 'topLeft' ? -15 : 15

  timeline.to(
    target,
    {
      x: overshootX,
      y: overshootY,
      duration: duration * 0.65,
      ease: 'expo.out',
    },
    startAt,
  )

  timeline.to(
    target,
    {
      x: recoilX,
      y: recoilY,
      duration: duration * 0.2,
      ease: 'sine.inOut',
    },
    startAt + duration * 0.65,
  )

  timeline.to(
    target,
    {
      x: 0,
      y: 0,
      duration: duration * 0.15,
      ease: 'sine.inOut',
    },
    startAt + duration * 0.85,
  )
}

function addCornerOut(
  timeline: gsap.core.Timeline,
  target: Element,
  startAt: number,
  duration: number,
  direction: 'topLeft' | 'bottomRight',
) {
  const overshootX = direction === 'topLeft' ? 100 : -100
  const overshootY = direction === 'topLeft' ? 60 : -60
  const recoilX = direction === 'topLeft' ? -25 : 25
  const recoilY = direction === 'topLeft' ? -15 : 15
  const exitX = direction === 'topLeft' ? -2400 : 2400
  const exitY = direction === 'topLeft' ? -1500 : 1500

  timeline.to(
    target,
    {
      x: overshootX,
      y: overshootY,
      duration: duration * 0.2,
      ease: 'sine.inOut',
    },
    startAt,
  )

  timeline.to(
    target,
    {
      x: recoilX,
      y: recoilY,
      duration: duration * 0.15,
      ease: 'sine.inOut',
    },
    startAt + duration * 0.2,
  )

  timeline.to(
    target,
    {
      x: exitX,
      y: exitY,
      opacity: 0,
      duration: duration * 0.65,
      ease: 'power1.in',
    },
    startAt + duration * 0.35,
  )
}

export function createMaimaiTimeline(
  svg: SVGSVGElement,
  lifecycle: TimelineLifecycle = {},
) {
  const chip = queryRequired<SVGElement>(svg, MAIMAI_SELECTORS.chip)
  const topLeftBase = queryAll<SVGElement>(svg, MAIMAI_SELECTORS.baseTopLeft)
  const bottomRightBase = queryAll<SVGElement>(svg, MAIMAI_SELECTORS.baseBottomRight)
  const purpleTopLeft = queryRequired<SVGGElement>(svg, MAIMAI_SELECTORS.purpleTopLeft)
  const purpleBottomRight = queryRequired<SVGGElement>(svg, MAIMAI_SELECTORS.purpleBottomRight)
  const whiteTopLeft = queryRequired<SVGGElement>(svg, MAIMAI_SELECTORS.whiteTopLeft)
  const whiteBottomRight = queryRequired<SVGGElement>(svg, MAIMAI_SELECTORS.whiteBottomRight)
  const holds = queryAll<SVGUseElement>(svg, MAIMAI_SELECTORS.holds)
  const slides = queryAll<SVGUseElement>(svg, MAIMAI_SELECTORS.slides)

  const timeline = gsap.timeline({
    paused: true,
    defaults: {
      overwrite: 'auto',
    },
    onStart: lifecycle.onStart,
    onComplete: lifecycle.onComplete,
  })

  if (lifecycle.onSceneSwap) {
    timeline.call(
      lifecycle.onSceneSwap,
      undefined,
      lifecycle.sceneSwapAt ?? MAIMAI_TIMINGS.sceneSwapAt,
    )
  }

  svg.setAttribute(
    'preserveAspectRatio',
    lifecycle.preserveAspectRatio ?? 'xMidYMid meet',
  )

  applySvgStyles(chip, {
    backfaceVisibility: 'hidden',
    transformBox: 'view-box',
    transformOrigin: '50% 50%',
    willChange: 'transform, opacity',
  })

  applySvgStyles([...topLeftBase, ...bottomRightBase], {
    transformBox: 'fill-box',
    transformOrigin: '50% 50%',
  })

  applySvgStyles([purpleTopLeft, purpleBottomRight, whiteTopLeft, whiteBottomRight], {
    transformBox: 'view-box',
    transformOrigin: '50% 50%',
  })

  applySvgStyles([...holds, ...slides], {
    transformBox: 'fill-box',
    transformOrigin: '50% 50%',
  })

  if (chip.parentNode === svg) {
    svg.appendChild(chip)
  }

  gsap.set(chip, {
    svgOrigin: `${SVG_CENTER.x} ${SVG_CENTER.y}`,
    rotation: -180,
    scale: 4.5,
    opacity: 0,
  })

  gsap.set(topLeftBase, {
    x: -2400,
    y: -1500,
  })

  gsap.set(bottomRightBase, {
    x: 2400,
    y: 1500,
  })

  gsap.set([purpleTopLeft, whiteTopLeft], {
    svgOrigin: `${SVG_CENTER.x} ${SVG_CENTER.y}`,
    scale: 1.06,
    x: -2400,
    y: -1500,
  })

  gsap.set([purpleBottomRight, whiteBottomRight], {
    svgOrigin: `${SVG_CENTER.x} ${SVG_CENTER.y}`,
    scale: 1.06,
    x: 2400,
    y: 1500,
  })

  gsap.set(holds, {
    x: 2400,
    y: -2400,
    opacity: 0,
  })

  gsap.set(slides, {
    x: -2400,
    y: 2400,
    opacity: 0,
  })

  const chipInStart = MAIMAI_TIMINGS.chipDelay
  const chipOutStart = MAIMAI_TIMINGS.chipExitAt

  timeline.to(
    chip,
    {
      ease: 'none',
      keyframes: [
        {
          rotation: -170,
          scale: 4.3,
          opacity: 0.55,
          duration: 0.031,
        },
        {
          rotation: -140,
          scale: 3.6,
          opacity: 0.85,
          duration: 0.081,
        },
        {
          rotation: -100,
          scale: 2.5,
          opacity: 0.95,
          duration: 0.087,
        },
        {
          rotation: -55,
          scale: 1.4,
          opacity: 1,
          duration: 0.099,
        },
        {
          rotation: -22,
          scale: 0.96,
          opacity: 1,
          duration: 0.087,
        },
        {
          rotation: -8,
          scale: 0.91,
          opacity: 1,
          duration: 0.074,
        },
        {
          rotation: -2,
          scale: 0.97,
          opacity: 1,
          duration: 0.074,
        },
        {
          rotation: 0,
          scale: 1.015,
          opacity: 1,
          duration: 0.05,
        },
        {
          rotation: 0,
          scale: 1,
          opacity: 1,
          duration: 0.037,
        },
      ],
    },
    chipInStart,
  )

  timeline.to(
    topLeftBase,
    {
      x: 0,
      y: 0,
      duration: MAIMAI_TIMINGS.baseInDuration,
      ease: 'expo.out',
      stagger: 0,
    },
    MAIMAI_TIMINGS.globalDelay,
  )

  timeline.to(
    bottomRightBase,
    {
      x: 0,
      y: 0,
      duration: MAIMAI_TIMINGS.baseInDuration,
      ease: 'expo.out',
      stagger: 0,
    },
    MAIMAI_TIMINGS.globalDelay,
  )

  addCornerIn(
    timeline,
    purpleTopLeft,
    MAIMAI_TIMINGS.globalDelay,
    MAIMAI_TIMINGS.purpleInDuration,
    'topLeft',
  )
  addCornerIn(
    timeline,
    purpleBottomRight,
    MAIMAI_TIMINGS.globalDelay,
    MAIMAI_TIMINGS.purpleInDuration,
    'bottomRight',
  )
  addCornerIn(
    timeline,
    whiteTopLeft,
    MAIMAI_TIMINGS.globalDelay,
    MAIMAI_TIMINGS.whiteInDuration,
    'topLeft',
  )
  addCornerIn(
    timeline,
    whiteBottomRight,
    MAIMAI_TIMINGS.globalDelay,
    MAIMAI_TIMINGS.whiteInDuration,
    'bottomRight',
  )

  holds.forEach((element) => {
    timeline.to(
      element,
      {
        x: 0,
        y: 0,
        opacity: 1,
        duration: randomBetween(
          MAIMAI_TIMINGS.holdSlideInDurationMin,
          MAIMAI_TIMINGS.holdSlideInDurationMax,
        ),
        ease: 'expo.out',
      },
      randomBetween(
        MAIMAI_TIMINGS.holdSlideInDelayMin,
        MAIMAI_TIMINGS.holdSlideInDelayMax,
      ),
    )
  })

  slides.forEach((element) => {
    timeline.to(
      element,
      {
        x: 0,
        y: 0,
        opacity: 1,
        duration: randomBetween(
          MAIMAI_TIMINGS.holdSlideInDurationMin,
          MAIMAI_TIMINGS.holdSlideInDurationMax,
        ),
        ease: 'expo.out',
      },
      randomBetween(
        MAIMAI_TIMINGS.holdSlideInDelayMin,
        MAIMAI_TIMINGS.holdSlideInDelayMax,
      ),
    )
  })

  timeline.to(
    chip,
    {
      scale: 0.82,
      opacity: 1,
      duration: MAIMAI_TIMINGS.chipOutDuration * 0.3,
      ease: 'power1.in',
    },
    chipOutStart,
  )

  timeline.to(
    chip,
    {
      scale: 2.2,
      opacity: 0.65,
      duration: MAIMAI_TIMINGS.chipOutDuration * 0.2,
      ease: 'power2.out',
    },
    chipOutStart + MAIMAI_TIMINGS.chipOutDuration * 0.3,
  )

  timeline.to(
    chip,
    {
      scale: 3.4,
      opacity: 0.3,
      duration: MAIMAI_TIMINGS.chipOutDuration * 0.2,
      ease: 'power2.out',
    },
    chipOutStart + MAIMAI_TIMINGS.chipOutDuration * 0.5,
  )

  timeline.to(
    chip,
    {
      scale: 4.6,
      opacity: 0,
      duration: MAIMAI_TIMINGS.chipOutDuration * 0.3,
      ease: 'power1.in',
    },
    chipOutStart + MAIMAI_TIMINGS.chipOutDuration * 0.7,
  )

  timeline.to(
    topLeftBase,
    {
      x: -2400,
      y: -1500,
      opacity: 0,
      duration: MAIMAI_TIMINGS.baseOutDuration,
      ease: 'power1.in',
      stagger: 0,
    },
    MAIMAI_TIMINGS.baseExitAt,
  )

  timeline.to(
    bottomRightBase,
    {
      x: 2400,
      y: 1500,
      opacity: 0,
      duration: MAIMAI_TIMINGS.baseOutDuration,
      ease: 'power1.in',
      stagger: 0,
    },
    MAIMAI_TIMINGS.baseExitAt,
  )

  addCornerOut(
    timeline,
    purpleTopLeft,
    MAIMAI_TIMINGS.baseExitAt,
    MAIMAI_TIMINGS.purpleOutDuration,
    'topLeft',
  )
  addCornerOut(
    timeline,
    purpleBottomRight,
    MAIMAI_TIMINGS.baseExitAt,
    MAIMAI_TIMINGS.purpleOutDuration,
    'bottomRight',
  )
  addCornerOut(
    timeline,
    whiteTopLeft,
    MAIMAI_TIMINGS.baseExitAt,
    MAIMAI_TIMINGS.whiteOutDuration,
    'topLeft',
  )
  addCornerOut(
    timeline,
    whiteBottomRight,
    MAIMAI_TIMINGS.baseExitAt,
    MAIMAI_TIMINGS.whiteOutDuration,
    'bottomRight',
  )

  holds.forEach((element) => {
    timeline.to(
      element,
      {
        x: -2200,
        y: 2200,
        opacity: 0,
        duration: randomBetween(
          MAIMAI_TIMINGS.holdSlideOutDurationMin,
          MAIMAI_TIMINGS.holdSlideOutDurationMax,
        ),
        ease: 'power2.in',
      },
      randomBetween(
        MAIMAI_TIMINGS.holdSlideOutDelayMin,
        MAIMAI_TIMINGS.holdSlideOutDelayMax,
      ),
    )
  })

  slides.forEach((element) => {
    timeline.to(
      element,
      {
        x: 2200,
        y: -2200,
        opacity: 0,
        duration: randomBetween(
          MAIMAI_TIMINGS.holdSlideOutDurationMin,
          MAIMAI_TIMINGS.holdSlideOutDurationMax,
        ),
        ease: 'power2.in',
      },
      randomBetween(
        MAIMAI_TIMINGS.holdSlideOutDelayMin,
        MAIMAI_TIMINGS.holdSlideOutDelayMax,
      ),
    )
  })

  return timeline
}
