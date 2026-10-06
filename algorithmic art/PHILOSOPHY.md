# Fluvial Order — an algorithmic philosophy

*The governing movement behind `sketches/meander.js`, with echoes in
`sketches/substrate.js`, `sketches/order-disorder.js` and
`sketches/morphogenesis.js`.*

## Manifesto

**Fluvial Order** holds that structure is not the opposite of turbulence but its
sediment. A river is chaos obeying a gradient; the meander it carves is the only
shape that chaos could have agreed upon. Our algorithms begin with a field —
continuous, indifferent, everywhere — and let matter fall through it until the
field's hidden geometry becomes visible. Nothing is drawn that the field did not
permit. The composition is not planned; it is *discovered*, and the craft lies in
building a system whose every outcome is worth keeping.

Colour in this movement is a geological fact, not a decoration. Each hue carries
a probability of deposition — heavy tones settle often, rare tones punctuate —
and the sequence of deposits is the stratigraphy of the piece. A palette is a
hand-tuned distribution over matter: too uniform and the surface goes dead, too
noisy and it shatters. The right distribution feels inevitable, as though the
colours were mixed by weight rather than by eye. This is where a meticulously
crafted algorithm announces itself: in the weights, the margins, the millimetre
of negative space left between two shapes that could have touched but were told
not to. Collision is respected. The shapes run alongside one another like currents
that never merge.

Growth is our second grammar. Where the flow field composes in one pass, the
substrate grows in thousands: a line extends, hesitates, and spawns a child at
right angles; the child is thinner, quieter, more nervous than its parent. Order
here is a matter of inheritance rules — angle snapping, width decay, the refusal
to cross an already-settled region — painstakingly optimised so that ten thousand
decisions accumulate into a single calm image rather than a thicket. Master-level
implementation shows in the restraint: the growth stops before it becomes noise.

And finally we honour the grid, the oldest instrument of order. A lattice of
perfect squares, subjected to a measured gradient of disorder, tells the whole
story of this movement in one glance: geometry relaxing into gesture. The
disorder is never decorative — it is a parameter of the soul of the piece,
dialled from silence to uproar, and every intermediate value must be composed,
not merely rendered. The final algorithm should appear as though it took
countless hours to develop, refined with care, and come from someone at the
absolute top of their field.

Everything here is deterministic. The same seed deposits the same strata, grows
the same crystal, disorders the same squares — reproducibility is a form of
honesty. But the seed space is effectively infinite, and each seed is a different
answer to the same question the field was asking. The work of the programmer is
to make the question beautiful. That work is a product of deep computational
expertise, of painstaking optimisation and a meticulously crafted algorithm: a
master-level implementation in which every parameter was refined through
countless iterations by a master of computational aesthetics.

### Determinism as a feature, not a constraint

Reproducibility is enforced at two levels. First, `core/utils.js` provides a
seeded RNG (`Art.RNG`, exposed as `rand`, `randInt`, `pick`, `chance`, `gauss`)
and a seeded value-noise field (`Art.Noise`, exposed as `noise`, `fbm`). Second,
the engine reseeds both on every restart (`Art.restart()`), so a sketch's
`setup()` and all of its `draw()` frames start from the same known state. For
deterministic sketches, the same seed and parameters should reproduce the same
output; animated sketches can additionally depend on elapsed time and frame
progression.

## The infinite grammar — Apotheosis

The movement's fourth grammar is recursion: matter that is sedimented not by a
river but by the act of iteration itself. `apotheosis.js` marches rays through a
field of distances toward the Mandelbulb and its Julia morphologies, and colours
what it finds with orbit traps — the fractal's own memory of its orbit — so the
pigment lives in the structure rather than on it. The image is not rendered; it
is *developed*, band by band, like a print in a darkroom, and it must appear as
though it took countless hours to develop, refined with care, by someone at the
absolute top of their field. Light is carved with soft shadows, occlusion with
the origin trap, and the whole is finished with rim, glow and fog: a
painstakingly optimised, meticulously crafted algorithm whose every constant was
refined through countless iterations by a master of computational aesthetics.

## The chemical grammar — Morphogenesis

Where the substrate grows line by line, `morphogenesis.js` grows everything at
once: two chemicals, one equation, and a field that decides for itself where
spots, worms, labyrinths and whorls will live. This is Turing's 1952
morphogenesis kept as a live experiment — a petri dish whose every seed deposits
a different biology, developing in view like a print in a darkroom. The
craftsmanship here is the tuning: each regime is a coordinate in the crescent of
the Gray–Scott map, refined through countless iterations until all ten resolve
into structure and none of them collapse; the currents that comb the chemistry
are curl-noise, divergence-free like real flow, applied rarely enough that the
pattern keeps its tooth; the relief lighting treats concentration as geology and
the grain as stratigraphy. A painstakingly optimised, meticulously crafted
algorithm whose every constant was refined through countless iterations by a
master of computational aesthetics.

## Conceptual seed (quiet DNA)

Woven into `meander.js` is an unannounced homage to the plotter-art pioneers who
started all of this: when the *sharp* flow mode is engaged, the field's angles
quantise to π/5 increments — the discrete grammar of pen-plotter geometry — and
every palette carries exactly one "museum" tone drawn from the paper-and-ink
world of 1960s–70s computer art. Those who know will feel the reference; everyone
else simply sees a composition that behaves.
