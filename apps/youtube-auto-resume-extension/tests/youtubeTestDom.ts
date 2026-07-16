interface FakeRectOptions {
  height?: number
  left?: number
  top?: number
  width?: number
}

interface FakeElementOptions extends FakeRectOptions {
  activeShorts?: boolean
  control?: boolean
  miniplayer?: boolean
  watchPlayer?: boolean
}

interface FakeStyle {
  display: string
  opacity: string
  pointerEvents: string
  visibility: string
}

export class FakeDocument {
  readonly defaultView: Window
  readonly documentElement: HTMLElement
  readonly location: Location
  readonly viewportHeight: number
  readonly viewportWidth: number
  fullscreenElement: Element | null = null
  enforcementMessage: FakeElement | null = null
  players: FakeElement[] = []

  constructor(
    viewportWidth = 1280,
    viewportHeight = 720,
    pathname = "/watch",
  ) {
    this.viewportHeight = viewportHeight
    this.viewportWidth = viewportWidth
    this.defaultView = {
      getComputedStyle: (element: Element) => (
        (element as unknown as FakeElement).style as CSSStyleDeclaration
      ),
      innerHeight: viewportHeight,
      innerWidth: viewportWidth,
    } as unknown as Window
    this.documentElement = {
      clientHeight: viewportHeight,
      clientWidth: viewportWidth,
    } as HTMLElement
    this.location = { pathname } as Location
  }

  querySelectorAll<T extends Element>(): NodeListOf<T> {
    return this.players as unknown as NodeListOf<T>
  }

  querySelector<T extends Element>(selector: string): T | null {
    const result = selector.includes("ytd-enforcement-message-view-model")
      ? this.enforcementMessage
      : null

    return result as unknown as T | null
  }

  toDocument(): Document {
    return this as unknown as Document
  }
}

export class FakeElement {
  readonly attributes = new Map<string, string>()
  readonly children: FakeElement[] = []
  readonly classes = new Set<string>()
  readonly classList = {
    add: (...tokens: string[]) => {
      for (const token of tokens) {
        this.classes.add(token)
      }
    },
    contains: (token: string) => this.classes.has(token),
    remove: (...tokens: string[]) => {
      for (const token of tokens) {
        this.classes.delete(token)
      }
    },
  } as DOMTokenList
  readonly style: FakeStyle = {
    display: "block",
    opacity: "1",
    pointerEvents: "auto",
    visibility: "visible",
  }
  clickCount = 0
  currentTime = 0
  disabled = false
  duration = Number.NaN
  fallbackVideo: FakeElement | null = null
  isConnected = true
  parentElement: FakeElement | null = null
  queryResults: FakeElement[] = []
  seekRanges: Array<readonly [number, number]> = []
  video: FakeElement | null = null

  readonly #activeShorts: boolean
  readonly #control: boolean
  readonly #document: FakeDocument
  readonly #height: number
  readonly #left: number
  readonly #miniplayer: boolean
  readonly #top: number
  readonly #watchPlayer: boolean
  readonly #width: number

  constructor(documentRef: FakeDocument, options: FakeElementOptions = {}) {
    this.#activeShorts = options.activeShorts ?? false
    this.#control = options.control ?? false
    this.#document = documentRef
    this.#height = options.height ?? 100
    this.#left = options.left ?? 0
    this.#miniplayer = options.miniplayer ?? false
    this.#top = options.top ?? 0
    this.#watchPlayer = options.watchPlayer ?? false
    this.#width = options.width ?? 100
  }

  get ownerDocument(): Document {
    return this.#document.toDocument()
  }

  get seekable(): TimeRanges {
    return {
      end: (index: number) => {
        const range = this.seekRanges[index]

        if (!range) {
          throw new RangeError("seek range index is out of bounds")
        }

        return range[1]
      },
      length: this.seekRanges.length,
      start: (index: number) => {
        const range = this.seekRanges[index]

        if (!range) {
          throw new RangeError("seek range index is out of bounds")
        }

        return range[0]
      },
    }
  }

  append(child: FakeElement): void {
    child.parentElement = this
    this.children.push(child)
  }

  click(): void {
    this.clickCount += 1
  }

  closest(selector: string): Element | null {
    if (selector.includes("button") && this.#control) {
      return this as unknown as Element
    }

    if (selector === "ytd-watch-flexy" && this.#watchPlayer) {
      return this as unknown as Element
    }

    if (selector.includes("ytd-reel-video-renderer") && this.#activeShorts) {
      return this as unknown as Element
    }

    if (selector.includes("ytd-miniplayer") && this.#miniplayer) {
      return this as unknown as Element
    }

    return this.parentElement?.closest(selector) ?? null
  }

  contains(target: Node | null): boolean {
    if (target === (this as unknown as Node)) {
      return true
    }

    return this.children.some((child) => child.contains(target))
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  getBoundingClientRect(): DOMRect {
    return {
      bottom: this.#top + this.#height,
      height: this.#height,
      left: this.#left,
      right: this.#left + this.#width,
      toJSON: () => ({}),
      top: this.#top,
      width: this.#width,
      x: this.#left,
      y: this.#top,
    }
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name)
  }

  querySelector<T extends Element>(selector: string): T | null {
    const result = selector === "video.html5-main-video"
      ? this.video
      : this.fallbackVideo ?? this.video

    return result as unknown as T | null
  }

  querySelectorAll<T extends Element>(): NodeListOf<T> {
    return this.queryResults as unknown as NodeListOf<T>
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }
}

export function asElement(element: FakeElement): HTMLElement {
  return element as unknown as HTMLElement
}
