export function ControlsLegend() {
  return (
    <dl className="controls">
      <div className="glass-card controls__item">
        <dt>Drive</dt>
        <dd>W / S / Up / Down</dd>
      </div>
      <div className="glass-card controls__item">
        <dt>Steer</dt>
        <dd>A / D / Left / Right</dd>
      </div>
      <div className="glass-card controls__item">
        <dt>Drift</dt>
        <dd>Space / Shift</dd>
      </div>
      <div className="glass-card controls__item">
        <dt>Pause</dt>
        <dd>Esc</dd>
      </div>
      <div className="glass-card controls__item">
        <dt>Gamepad</dt>
        <dd>A / RT / LT / Menu</dd>
      </div>
    </dl>
  )
}
