# Implementation Plan: Underwater Caustics Background for Contact Page

## Task Type
- [x] Frontend
- [ ] Backend
- [ ] Fullstack

## Requirement
Create a dynamic animated background **only on the contact page** (`/contact`) that simulates shimmering underwater light rays (caustics). The animation must **react to mouse movement** — the light rays shift, intensify, or ripple based on cursor position. Reference: `Underwater Light Rays [KbJz8FaepCU].mp4`.

---

## Technical Solution: Canvas 2D Procedural Caustics with Mouse Reactivity

### Algorithm
4 sine wave layers at different angles produce organic interference patterns. A power curve sharpens peaks into ray-like shapes. **Mouse position influences the wave phase offsets and a localized brightness boost**, creating the illusion that the viewer is moving a light source through water.

### Mouse Interaction Model
- Track `mousemove` on the container element
- Normalize mouse position to `[0, 1]` range (mouseX / containerWidth, mouseY / containerHeight)
- **Phase shift**: Each wave layer's phase offset is nudged by mouse position, creating a gentle "sway" as the cursor moves
- **Brightness hotspot**: A radial falloff centered on the cursor amplifies caustic brightness within ~200px radius, simulating a focused light beam following the mouse
- **Smooth interpolation**: Mouse influence is lerped each frame (factor ~0.05) for fluid, non-jerky response
- **Touch support**: `touchmove` mapped to same coordinates for mobile
- **No mouse / touch idle**: Falls back to center position with slow autonomous drift

---

## Current State

- **Contact page** (`app/contact/page.tsx`): Navbar + `<ContactSection />` + Footer. No background effects.
- **ContactSection** (`components/sections/ContactSection.tsx`): Static section with `bg-navy-800/40`. Heading, description, mailto button.
- **Existing pattern**: Other pages use absolutely-positioned `pointer-events-none` layers (radial glow + grid).

---

## Implementation Steps

### Step 1: Create `UnderwaterCaustics` client component

**File:** `components/backgrounds/UnderwaterCaustics.tsx` (NEW, ~140-160 lines)

```
'use client' component that:
- useRef: canvas element, animation frame ID, mouse position (current + target)
- useEffect: canvas lifecycle — setup, render loop, cleanup
- Render at 50% viewport resolution, CSS scale to 100%
- 4-layer sine wave interference with mouse-reactive phase offsets
- Brightness hotspot follows cursor (radial gradient centered on mouse)
- Mouse tracking: onMouseMove on container, normalized to [0,1]
- Touch tracking: onTouchMove mapped to same coords
- Lerp mouse influence each frame (smooth factor 0.05)
- No mouse present: center position + slow sinusoidal drift
- Colors: transparent base, marine blue (#1E6EFF) rays, cyan (#00D4FF) peaks
- prefers-reduced-motion: render one static frame, stop loop
- document.hidden: pause animation
- Canvas: aria-hidden="true", role="presentation"
- ResizeObserver for canvas resize (debounced)
- Reuse ImageData buffer across frames
- Accept className prop
```

### Step 2: Integrate into contact page

**File:** `app/contact/page.tsx` (MODIFY)

```tsx
// Before:
<main className="pt-24">
  <ContactSection />
</main>

// After:
<main className="relative min-h-screen pt-24 overflow-hidden">
  <UnderwaterCaustics className="absolute inset-0 z-0" />
  <div className="relative z-10">
    <ContactSection />
  </div>
</main>
```

The `overflow-hidden` prevents canvas from causing scrollbars. The caustics component handles its own mouse tracking internally.

### Step 3: Adjust ContactSection for caustics visibility

**File:** `components/sections/ContactSection.tsx` (MODIFY)

- Change `bg-navy-800/40` to transparent so caustics show through
- Add a subtle `backdrop-blur-sm` or glass card around the text content to maintain legibility against the animated background

### Step 4: Add reduced-motion CSS fallback

**File:** `app/globals.css` (MODIFY)

Add `@media (prefers-reduced-motion: reduce)` with a static gradient mimicking caustic highlights.

---

## Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `components/backgrounds/UnderwaterCaustics.tsx` | **Create** | Canvas 2D caustics with mouse-reactive phase + brightness hotspot |
| `app/contact/page.tsx:14-18` | **Modify** | Wrap content with caustics background layer |
| `components/sections/ContactSection.tsx:5` | **Modify** | Remove opaque background, add glass card for legibility |
| `app/globals.css` | **Modify** | Add `prefers-reduced-motion` static fallback |

---

## Pseudo-Code: Mouse-Reactive Caustics Renderer

```typescript
'use client'

const WAVE_LAYERS = [
  { angle: 0,           freq: 0.015, speed: 0.4, amp: 1.0 },
  { angle: Math.PI / 3, freq: 0.012, speed: 0.3, amp: 0.8 },
  { angle: 2*Math.PI/3, freq: 0.018, speed: 0.35, amp: 0.7 },
  { angle: Math.PI / 4, freq: 0.010, speed: 0.25, amp: 0.6 },
]

const RES_SCALE = 0.5
const SHARPNESS = 2.5
const MAX_BRIGHTNESS = 0.18
const MOUSE_LERP = 0.05
const HOTSPOT_RADIUS = 200  // pixels at full res

// State: currentMouse = { x: 0.5, y: 0.5 }, targetMouse = same
// On mousemove: targetMouse = { e.clientX / width, e.clientY / height }
// On touchmove: targetMouse = { touch.clientX / width, touch.clientY / height }
// Each frame: currentMouse lerps toward targetMouse

function renderFrame(ctx, w, h, time, mouse, imageData) {
  const data = imageData.data
  const hotspotX = mouse.x * w
  const hotspotY = mouse.y * h
  const hotspotR = HOTSPOT_RADIUS * RES_SCALE

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (const wave of WAVE_LAYERS) {
        // Mouse shifts the wave phase
        const phaseShift = (mouse.x - 0.5) * 2 * wave.amp
                         + (mouse.y - 0.5) * 1.5 * wave.amp
        const proj = x * Math.cos(wave.angle) + y * Math.sin(wave.angle)
        sum += Math.sin(proj * wave.freq + time * wave.speed + phaseShift) * wave.amp
      }

      const norm = (sum / 3.1 + 1) / 2
      let brightness = Math.pow(norm, SHARPNESS) * MAX_BRIGHTNESS

      // Hotspot: boost brightness near cursor
      const dx = x - hotspotX
      const dy = y - hotspotY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < hotspotR) {
        const hotspotFactor = 1 - dist / hotspotR
        brightness += hotspotFactor * 0.08  // Gentle boost
      }

      const i = (y * w + x) * 4
      data[i]     = 30   // R (marine blue #1E6EFF)
      data[i + 1] = 110  // G
      data[i + 2] = 255  // B
      data[i + 3] = Math.min(brightness * 255, 255)
    }
  }
  ctx.putImageData(imageData, 0, 0)
}
```

---

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Per-pixel loop slow on large screens | 50% resolution (~518K pixels at 1080p). 25% on mobile. |
| Mouse tracking feels laggy | Lerp factor 0.05 gives smooth ~300ms response. Adjustable. |
| Caustics distract from contact CTA | Max brightness 0.18, glass card on content, hotspot is subtle |
| Touch events conflict with scroll | Use `passive: true` listener, only track position (no preventDefault) |
| No mouse on mobile | Default center position with autonomous sinusoidal drift |
| Memory from ImageData | Single buffer reused every frame |
