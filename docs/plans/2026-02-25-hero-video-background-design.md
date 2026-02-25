# Hero Video Background — Design Document

**Date:** 2026-02-25
**Status:** Approved

## Goal

Embed a self-hosted sailing video as a full-bleed, autoplaying background behind the Hero section to increase visual impact and time-on-page engagement.

## Source Video

Facebook: https://www.facebook.com/espsailing/videos/1644167686354464/
Hosted at: `public/video/hero-bg.mp4`

## Layer Stack

```
z-index 30  →  Hero content (headline, subhead, CTAs)     — existing
z-index 20  →  Grid overlay + radial glow                 — existing
z-index 10  →  Dark overlay (60% navy, new)               — new
z-index 0   →  <video> element (full-bleed background)    — new
```

## Video Element

```html
<video
  autoPlay
  muted
  loop
  playsInline
  className="absolute inset-0 h-full w-full object-cover"
>
  <source src="/video/hero-bg.mp4" type="video/mp4" />
</video>
```

All four attributes (`autoPlay muted loop playsInline`) are required for cross-browser autoplay compliance.

## Dark Overlay

A semi-transparent navy layer between the video and the brand elements ensures headline legibility:

```html
<div className="absolute inset-0 bg-navy-900/60" />
```

## Fallback

The existing `bg-gradient-to-b from-navy-800 to-navy-900` on `<section>` remains as the CSS background. If the video fails to load or hasn't buffered yet, users see the current dark navy hero — no blank screen.

## Mobile

Video plays on mobile via `playsInline`. No separate static poster image is needed for MVP. A `poster` attribute can be added later for low-bandwidth optimization.

## Files Changed

- `components/sections/Hero.tsx` — only file modified
- `public/video/hero-bg.mp4` — video asset to be downloaded and placed manually

## Video Download (one-time, manual step)

```bash
brew install yt-dlp
yt-dlp "https://www.facebook.com/espsailing/videos/1644167686354464/" -o "public/video/hero-bg.mp4"
```
