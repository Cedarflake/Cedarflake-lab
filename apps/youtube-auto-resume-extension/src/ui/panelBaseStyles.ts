export const PANEL_BASE_STYLES = `
  :host {
    all: initial;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  button,
  input,
  select {
    font: inherit;
  }

  .wrap {
    display: block;
    width: max-content;
    max-width: calc(
      100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)
    );
    color: #f1f1f1;
    font-family: "Roboto", "Arial", sans-serif;
    line-height: normal;
  }

  .hidden {
    display: none !important;
  }

  .fab {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    overflow: visible;
    padding: 0;
    border: 0;
    border-radius: 50%;
    outline: none;
    background: transparent;
    color: #ff0000;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.2s;
  }

  .fab-aurora {
    --ytar-fab-aurora-blur: 4px;
    --ytar-fab-aurora-inset: -1px;
    --ytar-fab-aurora-scale-x: 1;
    --ytar-fab-aurora-scale-y: 1;
    --ytar-fab-aurora-gradient: conic-gradient(
      #3186ff 34%,
      #9378ff 37%,
      #f96bd6 39%,
      #fc413d 41%,
      #fc413d 48%,
      #ff6b2b 50%,
      #fec700 52%,
      #ffdb0f 56%,
      #88de42 58%,
      #0ebc5f 61%,
      #0ebc5f 65%,
      #2eaab2 70%,
      #00a9bb 72%,
      #3186ff 73%,
      #3186ff 83%,
      #3186ff 100%
    );

    position: absolute;
    inset: 0;
    z-index: 0;
    display: block;
    overflow: visible;
    border-radius: 50%;
    pointer-events: none;
  }

  .fab-aurora-motion {
    --ytar-fab-aurora-focus: 0;
    --ytar-fab-aurora-mask-angle: 0deg;
    --ytar-fab-aurora-gradient-angle: 0deg;
    --ytar-fab-aurora-soft-fade-start: 0%;
    --ytar-fab-aurora-soft-solid-start: 0%;
    --ytar-fab-aurora-soft-solid-end: 100%;
    --ytar-fab-aurora-soft-fade-end: 100%;
    --ytar-fab-aurora-sharp-fade-start: 0%;
    --ytar-fab-aurora-sharp-solid-start: 0%;
    --ytar-fab-aurora-sharp-solid-end: 100%;
    --ytar-fab-aurora-sharp-fade-end: 100%;

    position: absolute;
    inset: 0;
    z-index: 1;
    display: block;
    border-radius: inherit;
    opacity: 0;
    will-change:
      --ytar-fab-aurora-mask-angle,
      --ytar-fab-aurora-gradient-angle,
      opacity;
  }

  .fab-aurora-stack,
  .fab-aurora-clip,
  .fab-aurora-mask,
  .fab-aurora-gradient {
    position: absolute;
    display: block;
    border-radius: inherit;
  }

  .fab-aurora-stack,
  .fab-aurora-mask,
  .fab-aurora-gradient {
    inset: 0;
  }

  .fab-aurora-clip {
    inset: var(--ytar-fab-aurora-inset);
    overflow: hidden;
    backface-visibility: hidden;
    filter: blur(var(--ytar-fab-aurora-blur));
    opacity: calc(0.55 + var(--ytar-fab-aurora-focus) * 0.45);
    transform: translateZ(0);
  }

  .fab-aurora-clip-sharp {
    filter: blur(1px);
    opacity: calc(0.9 + var(--ytar-fab-aurora-focus) * 0.1);
  }

  .fab-aurora-mask {
    scale:
      var(--ytar-fab-aurora-scale-x)
      var(--ytar-fab-aurora-scale-y);
    -webkit-mask-image:
      conic-gradient(
        from var(--ytar-fab-aurora-mask-angle),
        transparent 0,
        transparent var(--ytar-fab-aurora-soft-fade-start),
        black var(--ytar-fab-aurora-soft-solid-start),
        black var(--ytar-fab-aurora-soft-solid-end),
        transparent var(--ytar-fab-aurora-soft-fade-end),
        transparent 100%
      );
    mask-image:
      conic-gradient(
        from var(--ytar-fab-aurora-mask-angle),
        transparent 0,
        transparent var(--ytar-fab-aurora-soft-fade-start),
        black var(--ytar-fab-aurora-soft-solid-start),
        black var(--ytar-fab-aurora-soft-solid-end),
        transparent var(--ytar-fab-aurora-soft-fade-end),
        transparent 100%
      );
  }

  .fab-aurora-clip-sharp .fab-aurora-mask {
    -webkit-mask-image:
      conic-gradient(
        from var(--ytar-fab-aurora-mask-angle),
        transparent 0,
        transparent var(--ytar-fab-aurora-sharp-fade-start),
        black var(--ytar-fab-aurora-sharp-solid-start),
        black var(--ytar-fab-aurora-sharp-solid-end),
        transparent var(--ytar-fab-aurora-sharp-fade-end),
        transparent 100%
      );
    mask-image:
      conic-gradient(
        from var(--ytar-fab-aurora-mask-angle),
        transparent 0,
        transparent var(--ytar-fab-aurora-sharp-fade-start),
        black var(--ytar-fab-aurora-sharp-solid-start),
        black var(--ytar-fab-aurora-sharp-solid-end),
        transparent var(--ytar-fab-aurora-sharp-fade-end),
        transparent 100%
      );
  }

  .fab-aurora-gradient {
    rotate: var(--ytar-fab-aurora-gradient-angle);
    backface-visibility: hidden;
    background: var(--ytar-fab-aurora-gradient);
    transform: translateZ(0);
  }

  .fab-surface {
    position: absolute;
    inset: 1px;
    z-index: 1;
    display: block;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    background: rgba(33, 33, 33, 0.96);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
    clip-path: circle(50%);
    pointer-events: none;
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    transition: background-color 0.2s, filter 0.2s;
  }

  .fab-surface::after {
    position: absolute;
    inset: -10px;
    border-radius: inherit;
    background: inherit;
    opacity: 0.5;
    content: "";
  }

  .fab:hover .fab-surface {
    background: rgba(48, 48, 48, 0.98);
    filter: blur(2px);
  }

  .fab-content {
    position: relative;
    z-index: 2;
    display: inline-flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .fab:active {
    transform: scale(0.95);
  }

  .fab:focus-visible,
  .icon-button:focus-visible,
  .button:focus-visible,
  ::slotted(.native-skip-button:focus-visible),
  .number-input:focus-visible,
  .select-input:focus-visible {
    outline: 2px solid #3ea6ff;
    outline-offset: 2px;
  }

  .switch input:focus-visible + .track {
    outline: 2px solid #3ea6ff;
    outline-offset: 3px;
  }

  .fab-content svg {
    width: 24px;
    height: 24px;
  }

  .panel {
    display: grid;
    width: 340px;
    max-width: calc(
      100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)
    );
    max-height: min(
      680px,
      calc(
        72vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
      )
    );
    max-height: min(
      680px,
      calc(
        72dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
      )
    );
    overflow: hidden;
    grid-template-rows: auto minmax(0, 1fr) auto;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    background: #212121;
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.5);
    color: #f1f1f1;
    transform-origin: bottom right;
  }

  .header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: inherit;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 500;
  }

  .badge {
    display: inline-flex;
    color: #ff0000;
  }

  .badge svg {
    width: 20px;
    height: 20px;
  }

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    outline: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .icon-button:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .icon-button:active {
    background: rgba(255, 255, 255, 0.2);
  }

  .icon-button svg {
    width: 20px;
    height: 20px;
  }

  .content {
    min-height: 0;
    overflow: hidden auto;
    padding: 12px 16px 16px;
  }

  .grid {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .label {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
    cursor: pointer;
  }

  .label-key {
    font-size: 14px;
    font-weight: 400;
  }

  .label-description {
    color: #aaaaaa;
    font-size: 12px;
  }

  .number-input,
  .select-input {
    width: 80px;
    flex: 0 0 auto;
    padding: 6px 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    outline: none;
    background-color: rgba(0, 0, 0, 0.2);
    color: inherit;
    font-size: 13px;
    text-align: center;
    transition: border-color 0.2s;
  }

  .number-input:focus {
    border-color: #3ea6ff;
  }

  .select-input {
    width: 132px;
    appearance: none;
    padding-right: 30px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23f1f1f1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-position: right 9px center;
    background-repeat: no-repeat;
    text-align: left;
  }

  .select-input:focus {
    border-color: #3ea6ff;
  }

  .select-input option {
    background: #212121;
    color: #f1f1f1;
  }

  .switch {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    margin-right: 2px;
    cursor: pointer;
  }

  .switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .track {
    display: inline-flex;
    width: 36px;
    height: 14px;
    align-items: center;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.2);
    transition: background-color 0.2s;
  }

  .thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #aaaaaa;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    transform: translateX(-2px);
    transition: background-color 0.2s, transform 0.2s;
  }

  input:checked + .track {
    background: rgba(62, 166, 255, 0.3);
  }

  input:checked + .track .thumb {
    background: #3ea6ff;
    transform: translateX(18px);
  }

  .status {
    margin-top: 16px;
    padding: 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: #aaaaaa;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-line;
  }

  .last-action {
    margin-top: 8px;
    color: #aaaaaa;
    font-size: 12px;
    text-align: center;
  }

  .footer {
    display: flex;
    gap: 8px;
    padding: 12px 16px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    background: inherit;
  }

  slot[name="native-skip-action"] {
    display: contents;
  }

  .button,
  ::slotted(.native-skip-button) {
    display: inline-flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    border: 0;
    border-radius: 18px;
    outline: none;
    background: rgba(255, 255, 255, 0.1);
    color: #f1f1f1;
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    transition: background-color 0.2s;
  }

  .button:hover,
  ::slotted(.native-skip-button:hover) {
    background: rgba(255, 255, 255, 0.2);
  }

  .button:active,
  ::slotted(.native-skip-button:active) {
    background: rgba(255, 255, 255, 0.3);
  }

  ::slotted(.native-skip-button[aria-disabled="true"]) {
    background: rgba(255, 255, 255, 0.06);
    color: #717171;
    cursor: not-allowed;
    pointer-events: none;
  }

  .button-primary {
    background: #f1f1f1;
    color: #0f0f0f;
  }

  .button-primary:hover {
    background: #d9d9d9;
  }

  .button svg {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
  }

  .fade-in {
    animation: fade-in 0.2s cubic-bezier(0.05, 0, 0, 1);
  }
`
