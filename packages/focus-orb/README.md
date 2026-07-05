# @igcrystal/focus-orb

Reusable React WebGL focus orb component.

## Usage

```tsx
import { FocusOrbBackground, FocusOrbButton } from "@igcrystal/focus-orb"
import "@igcrystal/focus-orb/style.css"

export function Example() {
  return (
    <>
      <FocusOrbButton ariaLabelActive="退出专注模式" />
      <div style={{ position: "relative", minHeight: 480, overflow: "hidden" }}>
        <FocusOrbBackground orbScale={2.2} intensity={0.85} />
      </div>
    </>
  )
}
```
