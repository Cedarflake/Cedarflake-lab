export const PANEL_VARIANT_STYLES = `
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-color-scheme: light) {
    .wrap {
      color: #0f0f0f;
    }

    .fab-surface {
      border-color: rgba(0, 0, 0, 0.1);
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .fab:hover .fab-surface {
      background: rgba(240, 240, 240, 0.98);
    }

    .fab:focus-visible,
    .icon-button:focus-visible,
    .button:focus-visible,
    .number-input:focus-visible,
    .select-input:focus-visible,
    .switch input:focus-visible + .track {
      outline-color: #065fd4;
    }

    .panel {
      border-color: rgba(0, 0, 0, 0.1);
      background: #ffffff;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      color: #0f0f0f;
    }

    .header {
      border-bottom-color: rgba(0, 0, 0, 0.1);
    }

    .icon-button:hover {
      background: rgba(0, 0, 0, 0.05);
    }

    .label-description,
    .last-action {
      color: #606060;
    }

    .number-input,
    .select-input {
      border-color: rgba(0, 0, 0, 0.1);
      background-color: #ffffff;
    }

    .select-input {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%230f0f0f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    }

    .select-input option {
      background: #ffffff;
      color: #0f0f0f;
    }

    .track {
      background: rgba(0, 0, 0, 0.1);
    }

    .thumb {
      background: #606060;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    input:checked + .track {
      background: rgba(6, 95, 212, 0.2);
    }

    input:checked + .track .thumb {
      background: #065fd4;
    }

    .status {
      background: rgba(0, 0, 0, 0.03);
      color: #606060;
    }

    .button {
      background: rgba(0, 0, 0, 0.05);
      color: #0f0f0f;
    }

    .button:hover {
      background: rgba(0, 0, 0, 0.1);
    }

    .button-primary {
      background: #0f0f0f;
      color: #ffffff;
    }

    .button-primary:hover {
      background: #272727;
    }
  }

  @media (max-width: 420px) {
    .footer {
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fab,
    .fab-surface,
    .icon-button,
    .number-input,
    .select-input,
    .track,
    .thumb,
    .button {
      transition: none;
    }

    .fade-in {
      animation: none;
    }

    .fab-aurora-motion {
      will-change: auto;
    }
  }

  @media (forced-colors: active) {
    .fab-aurora {
      display: none;
    }

    .fab-surface {
      border-color: ButtonText;
      background: ButtonFace;
      box-shadow: none;
      filter: none;
    }

    .fab-content {
      color: ButtonText;
    }
  }
`
