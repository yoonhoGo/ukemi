# Theme contract changelog

The classes and custom properties in `contract.css` are a public API. A theme
written against version *n* must keep working until this file records a
breaking change and the version is bumped.

## v1 — 2026-09-09

Initial contract.

**Tokens**: `--u-bg-*`, `--u-text*`, `--u-line*`, `--u-accent*`, `--u-conflict*`,
`--u-added*`, `--u-removed*`, `--u-modified`, `--u-immutable`, `--u-radius*`,
`--u-font*`, `--u-row-height`, `--u-lane-width`, `--u-lane-inset`,
`--u-node-radius`, `--u-duration`, `--u-ease`.

**Classes**: `.mono` `.sec` `.ter` `.selectable` `.key` `.tb-btn` `.side-item`
`.side-head` `.row` `.pill` `.avatar` `.step` `.file` `.diff-line` `.u-scroll`.

**State attributes** a theme may target: `aria-selected` on `.row` and `.file`,
`aria-current` on `.side-item`, `data-kind` on `.pill` (`conflict`, `bookmark`)
and `.diff-line` (`add`, `del`, `hunk`), `data-variant` on `.tb-btn` and
`.step` (`primary`), `:disabled` on `.tb-btn` and `.step`.

Not yet in the contract: the graph renderer (layer 3) and component
replacement (layer 4). The graph reads `--u-row-height` and `--u-lane-*`, so a
theme can move nodes but not redraw them.

### Obligation on theme authors

A theme rule is written as `:root[data-theme="…"] .cls`, which outranks the
contract's own state rules like `.tb-btn[data-variant="primary"]`. **If you
override a base class, restate the states of that class you still want.**
Overriding `.tb-btn`'s background without restating the primary variant makes
the primary button vanish — light ink on a transparent ground. The bundled Ink
& Paper theme hit exactly this, which is why a second theme ships at all.
