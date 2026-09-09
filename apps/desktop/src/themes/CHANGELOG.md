# Theme contract changelog

The classes and custom properties in `contract.css` are a public API. A theme
written against version *n* must keep working until this file records a
breaking change and the version is bumped.

## v1.2 — 2026-09-09

Found the only way it could be: by standing a theme on a black ground. v1 was
written on a white page, and shipping dark themes turned up four assumptions
and one outright bug.

**Fixed — the contract now loads first.** `main.tsx` imported the theme
registry (and with it every theme stylesheet) *before* `contract.css`, so on
equal specificity the contract won on source order. A theme's
`:root[data-theme="…"] .key` and the contract's
`.tb-btn[data-variant="primary"] .key` both score (0,3,0), which means the
obligation below was a promise the stylesheet order quietly broke. The import
moved; themes are last, as the cascade model here always claimed.

**`color-scheme` is now a theme's to set.** A theme may declare
`color-scheme: dark` in its own `:root[data-theme="…"]` block. It is not a
token, but a dark palette under the contract's `color-scheme: light` gets
platform furniture no stylesheet can reach — light scrollbars and a white
rubber-band at the window edge. A light theme changes nothing.

**`.step` reads `--u-radius-lg`** where it had a literal `7px`, so a theme that
squares its corners no longer has to override the class to do it. The default
theme's steps grow 1px rounder; nothing else moves.

**Three colour literals in the contract are theme business**, and a dark theme
must handle all three or lose the element: `.key`'s `background`/`border-color`
(black alphas — invisible on black), `.u-scroll`'s `scrollbar-color` and its
`::-webkit-scrollbar-thumb` background (same), and
`.tb-btn[data-variant="primary"] .key`, whose *white* alphas assume a dark
accent fill and invert on a light one. They stay literal rather than becoming
tokens: a token here is six more names for a value only a dark theme reads,
against one rule in the theme.

**Correction — the metric tokens are not honoured by the graph, so a theme
must not touch them.** v1 lists `--u-row-height` and `--u-lane-*` and says the
graph reads them "so a theme can move nodes but not redraw them". It does not:
`ui/graph-geometry.ts` holds `ROW`, `LANE_INSET`, `LANE_PITCH` and `NODE_R` as
JS constants and the lane SVG is laid out from those, while `.row`'s height
comes from the token. Raise the token and the rows grow while the nodes keep
the old pitch — two pixels of drift per row under Ink & Paper, which shipped
with `--u-row-height: 46px` and has been sliding its nodes off their rows ever
since. Fixed by removing that override; the tokens stay (the CSS side does read
`--u-row-height`) but are off limits until the graph reads them too. The
`--u-lane-*` pair is read by nothing at all today.

**Two `--u-bg-*` tokens must stay plain colours.** The graph strokes its nodes
and lane joins with `--u-bg-window`, and fills an empty node with it; the
timeline strokes the current operation with `--u-bg-timeline`. An SVG paint
attribute takes a colour, not a `linear-gradient()`, so a gradient in either
token is silently dropped and the node rings vanish. Every other `--u-bg-*`
token is read as a CSS `background` and may hold a gradient —
`--u-bg-toolbar` already ships one.

**Gaps recorded, not closed.** The contract gives
`.tb-btn[data-variant="primary"]` a `.key` rule and gives
`.step[data-variant="primary"]` none, because a primary step is a tint by
default and its badge never sits on a fill — a theme that fills it writes that
rule itself. And the graph's lane and node colours are not in the contract at
all: they come from the app's fixed palette in `ui/change-color.ts`, with only
`--u-immutable` themeable. That is layer 3, still outside this contract, and a
dark theme is where it first hurts. `--u-bg-window` also has two jobs: it is the graph pane's
ground *and* the halo a node is stroked with, so a theme whose rows are a
different surface from the pane behind them — Candy Bento floats white cards on
lilac — gets a halo that is right in the gaps between rows and slightly wrong
on the cards. Separating them needs a token for the halo. Lane stroke width is
not a token either, so "fatter lanes" cannot be said in line weight. Nor is
there any hook on the chrome surfaces themselves: the toolbar, sidebar and inspector are unclassed elements
styled inline, so a theme can set their colour through the tokens but has
nowhere to hang a *material* — a frosted-glass theme cannot reach
`backdrop-filter` at all.

## v1.1 — 2026-09-09

Additive. `.pill[data-kind="pr"]` with `data-state` (`open`, `merged`,
`closed`) for pull-request chips in the graph and the stack panel. A v1 theme
that restyles `.pill` keeps working; the chip falls back to the base pill.

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

The same trap has a second form inside the contract itself: a `[data-variant]`
rule that paints a fill must also handle `:disabled`, or an unavailable action
keeps looking available. `.tb-btn` and `.step` now do; a new variant should.
