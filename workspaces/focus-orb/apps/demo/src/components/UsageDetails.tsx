import { useState } from "react"
import { Check, Copy } from "lucide-react"

interface UsageDetailsProps {
  codeSample: string
}

export function UsageDetails({ codeSample }: UsageDetailsProps) {
  const [hasCopied, setHasCopied] = useState(false)

  function copyCodeSample() {
    if (!navigator.clipboard) {
      return
    }

    void navigator.clipboard.writeText(codeSample).then(() => {
      setHasCopied(true)
      window.setTimeout(() => {
        setHasCopied(false)
      }, 1400)
    })
  }

  return (
    <section className="details-section" aria-label="Usage details">
      <div className="code-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current Props</p>
            <h2>Live code</h2>
          </div>
        </div>
        <div className="code-block-shell">
          <button
            aria-label={hasCopied ? "Copied" : "Copy code"}
            className="copy-button"
            onClick={copyCodeSample}
            title={hasCopied ? "Copied" : "Copy code"}
            type="button"
          >
            {hasCopied ? (
              <Check aria-hidden="true" className="copy-button__icon" />
            ) : (
              <Copy aria-hidden="true" className="copy-button__icon" />
            )}
          </button>
          <pre>
            <code>{codeSample}</code>
          </pre>
        </div>
      </div>

      <div className="api-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Adjustable Groups</p>
            <h2>Package API</h2>
          </div>
        </div>
        <dl className="api-list">
          <div>
            <dt>Shared surface</dt>
            <dd>colors, width, height, fit, orbScale, textureSrc, className, style</dd>
          </div>
          <div>
            <dt>Shared renderer</dt>
            <dd>state, paused, audio, motion, rendering, shader, onRenderComplete, onError</dd>
          </div>
          <div>
            <dt>Button only</dt>
            <dd>active, defaultActive, interaction, ariaLabelActive, ariaLabelInactive, onActiveChange</dd>
          </div>
          <div>
            <dt>Background only</dt>
            <dd>ariaHidden, interactive, background container events</dd>
          </div>
          <div>
            <dt>Shader groups</dt>
            <dd>shape, flow, material, wave layer, and transition uniforms</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
