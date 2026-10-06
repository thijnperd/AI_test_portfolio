---
name: canvas-performance
description: Use when generative art or canvas rendering is slow, janky, memory-hungry, or needs to render high-detail/progressive output — batching draw calls, typed arrays, ImageData pipelines, offscreen canvases, resolution strategy, PNG export quality. Not for app UI responsiveness in general.
---

# Canvas performance — millions of operations without stutter

The difference between a toy sketch and a flagship piece is usually per-frame
discipline. Rules below assume the 2D canvas; they transfer to WebGL thinking.

## Rendering strategy

1. **Batch by style.** One `beginPath()` → many `moveTo/lineTo` → one `stroke()`
   per color/width. Never `stroke()` per segment. When segments have different
   colors, bucket them (preallocated arrays per bucket) and stroke once per
   bucket.
2. **State changes are the cost.** `fillStyle`/`strokeStyle` switches, `save()`
   clips, and `filter` are expensive; minimize and group them.
3. **Pixels when geometry is massive.** If you're drawing >100k tiny marks
   (grain, particles, density fields), write an `ImageData` buffer directly and
   `putImageData` once — orders of magnitude faster.
4. **Offscreen accumulation.** For anything that only ever adds ink (growth,
   trails, plotters), draw to an offscreen canvas once and `drawImage` it each
   frame; never redraw the whole history.
5. **Progressive rendering.** For heavy per-pixel work (raymarching, fractals,
   supersampling), render row-bands inside a per-frame time budget
   (`performance.now()` loop capped at ~25ms) and present the buffer each frame.
   The image develops; the UI stays alive.
6. **Resolution strategy.** Render at a fixed internal buffer size and scale
   with `drawImage` + smoothing; cap `devicePixelRatio` at 2. Don't compute
   4× pixels nobody can see.

## Determinism + memory

- Seeded RNG only (`Art.RNG`/`Noise` here) — reproducibility is part of the art.
- Preallocate in `setup()`, reuse arrays in `draw()`; zero per-frame allocation
  in hot loops (no closures/objects per particle).
- Typed arrays (`Float32Array`, `Uint8ClampedArray`) for fields, grids, pixels.
- Spatial hashing/grids for collision and neighbor queries — O(1) lookups
  instead of O(n²) scans.

## Export quality

- Export from the internal buffer at its native resolution (or a dedicated
  high-res buffer), not from the scaled display canvas.
- For static pieces, do the expensive render once in `setup()` and keep
  `draw()` trivial.

## Profiling habit

Time the phases (field build / geometry / strokes / pixels) with
`performance.now()` before optimizing. Usually one phase is 90% of the cost —
find it rather than guessing.
