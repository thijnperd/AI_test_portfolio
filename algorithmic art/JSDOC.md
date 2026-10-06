# JavaScript documentation with JSDoc

JSDoc is the documentation-comment convention used by this project. It plays
a role similar to Python docstrings: documentation sits beside the JavaScript
it describes, and editors can show it in hover and completion help. This
project has no build step, documentation generator, or JSDoc package
dependency; the comments are the maintained source of truth.

## How to view the documentation

In VS Code:

1. Open the `algorithmic art` folder.
2. In Explorer, open `API.md` for the framework reference or `JSDOC.md` for
   the documentation-writing guide.
3. Press **Ctrl+Shift+V** to open the Markdown Preview. To keep the Markdown
   source and rendered guide side by side, press **Ctrl+K**, then **V**.
4. Use the links in the preview to move between `README.md`, `API.md`, and
   `JSDOC.md`.

You can also read the `.md` files directly in VS Code or any Markdown viewer.
This repository does not generate a separate HTML documentation site, so
there is no build command to run. To see inline API comments while coding,
open the relevant `.js` file and hover a documented function or value in a
JavaScript-aware editor.

`API.md` describes the framework as it exists; `JSDOC.md` explains how to write
and maintain source comments. They are complementary documents, not generated
copies of each other.

## What to document

- Give every JavaScript file a short module banner with `@module`.
- Document public helpers, shared APIs, and functions whose behavior or
  contract is not obvious from their name.
- For sketch files, explain the artistic/algorithmic idea and any important
  assumptions or non-obvious math in the module banner.
- Describe parameters and return values. Document thrown errors, mutation,
  units, ranges, determinism, and side effects when they matter to callers.
- Prefer a clear name over a comment that merely repeats the name.
- Keep comments accurate when changing code. Do not add comments to every
  statement or narrate obvious operations.

## Module banner

Start each JavaScript source file with a block that explains its role:

```js
/**
 * Module Name — one-line description of its responsibility.
 *
 * A short note about important behavior, assumptions, or dependencies.
 *
 * @module relative/module-name
 */
```

Sketch banners should mention their generative process and relevant source
inspirations. Cite links when adapting a concept from an external example, and
describe the implementation as an original adaptation; do not copy another
artist's code or reproduce a work.

## Functions and methods

Use standard JSDoc tags to explain the callable contract:

```js
/**
 * Map a value from one interval into another.
 *
 * @param {number} value - Value in the source interval.
 * @param {number} sourceMin - Inclusive lower source bound.
 * @param {number} sourceMax - Upper source bound.
 * @param {number} targetMin - Lower target bound.
 * @param {number} targetMax - Upper target bound.
 * @param {boolean} [clip=false] - Whether to clamp the result to the target interval.
 * @returns {number} The mapped value.
 */
function map(value, sourceMin, sourceMax, targetMin, targetMax, clip) {
  // ...
}
```

Use `{Type} [name]` for optional parameters and explain meaningful defaults.
Use `@returns {void}` for functions that intentionally return nothing.
Include `@throws {Error}` when callers need to know about a documented failure
case. Keep type expressions specific enough to help an editor; do not invent
types or guarantees that the implementation does not enforce.

## Sketch contract example

The `e` object is supplied by `core/engine.js`. Sketch code should document
sketch-specific state and behavior rather than restating every field on every
callback:

```js
/**
 * Scatter pigment along a seeded noise field.
 *
 * @param {object} e - Sketch environment from the AlgoArt engine.
 * @param {CanvasRenderingContext2D} e.ctx - Scaled 2D drawing context.
 * @param {number} e.w - Logical canvas width in CSS pixels.
 * @param {number} e.h - Logical canvas height in CSS pixels.
 * @param {object} e.params - Current values declared in this sketch's params.
 * @param {object} e.state - State initialized by setup for this restart.
 * @returns {void}
 */
function draw(e) {
  // ...
}
```

The real environment contract is documented in [`API.md`](API.md). When a
shared contract changes, update the API reference and the implementation
comments together.

## Types and data shapes

Use `@typedef` and `@property` when a named object shape is reused or its fields
are not self-explanatory:

```js
/**
 * A sketch particle in logical canvas coordinates.
 *
 * @typedef {object} Particle
 * @property {number} x - Horizontal position in CSS pixels.
 * @property {number} y - Vertical position in CSS pixels.
 * @property {number} life - Remaining simulation steps.
 */
```

Do not introduce a type alias for a one-off value when a direct description is
clearer.

## Keeping documentation useful

1. Write or update the module/function documentation alongside the behavior.
2. Check names, units, defaults, and edge cases against the implementation.
3. Update [`API.md`](API.md) for shared framework contracts and [`README.md`](README.md)
   for user-facing features or controls.
4. Run the app and inspect the relevant sketch after changes to visual behavior.
5. At task completion, update the repository [`context.md`](../context.md) if
   the new Markdown contains durable guidance future coding tasks must read.

The project intentionally runs directly from `file://`. Do not add a JSDoc
generation pipeline or dependency unless explicitly requested.
