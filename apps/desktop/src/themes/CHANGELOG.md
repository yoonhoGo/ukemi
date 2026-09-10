# Theme contract changelog

The classes and custom properties in `contract.css` are a public API. A theme
written against version *n* must keep working until this file records a
breaking change and the version is bumped.

## v1.4 — 2026-09-10

Additive. `.side-head` may now be a `<summary>` — the sidebar sections fold —
and carries a `.chev` child that the contract turns when the `<details>` is
closed. The contract strips the browser's own marker on `summary.side-head`.
A theme restyling `.side-head` keeps working; one that wants its own fold glyph
overrides `.side-head > .chev`.

## v1.3 — 2026-09-09

Additive. Found the same way v1.2 was, one appearance further along: v1.2 stood
a *theme* on a black ground, and this one stands the **default** theme there.
Nothing is renamed or removed, so a v1 theme keeps working; four tokens are new
and one long-standing lie is retired.

**The default theme has a dark appearance.** `:root { color-scheme: light }`
plus a full light palette was the whole story, because the
`@media (prefers-color-scheme: dark)` block was gated on
`:root[data-theme-follows-system]` — an attribute nothing in the app has ever
set, and whose only occurrence in the repository was that selector. A Mac in
Dark Mode on the "System" theme got a white window. The block now applies to
bare `:root` and redefines every token, `color-scheme` included.

This does not touch a chosen theme. Each of the four sets its tokens on
`:root[data-theme="…"]`, which is (0,2,0) against the contract's (0,1,0), and a
media query contributes nothing to specificity — so `ink`, `acid`, `aurora` and
`candy` win in both appearances exactly as before, and only "System" moves.
Ink & Paper and Candy Bento stay paper-white in Dark Mode on purpose: a chosen
theme is the user's answer, not the system's.

**New — four tokens, and the three literals v1.2 argued for are gone.** v1.2
recorded `.key`'s `background`/`border-color`, `.u-scroll`'s `scrollbar-color`
and its `::-webkit-scrollbar-thumb` as deliberately literal, on the reasoning
that a token there is "six more names for a value only a dark theme reads".
That reasoning does not survive the default theme having a dark appearance —
the values are now read by the contract itself, twice. Added:

- `--u-bg-key` — a key cap's fill.
- `--u-line-key` — its hairline.
- `--u-scrollbar-thumb` — the overlay thumb, in both the standard
  `scrollbar-color` and the WebKit pseudo-element. v1 had 0.2 in one and 0.18
  in the other; one token, one value.
- `--u-duration-fast` — see motion below.

`.tb-btn[data-variant="primary"]:disabled .key` reads the key pair too, since a
disabled primary has lost its fill and its badge is back on ordinary chrome.
`.tb-btn[data-variant="primary"] .key` stays literal, and this time the reason
holds in both appearances: those alphas are painted on `--u-accent`, which is a
saturated fill either way. A theme with a *light* accent still restates them —
Acid Terminal does.

**`--u-text-disabled` is optional, and stays undefined.** It has been
referenced as `var(--u-text-disabled, var(--u-text-tertiary))` since v1 and
defined nowhere, which read as an oversight. It is a hook: defining it in the
contract would put a fourth ink token in every theme with a default value
identical to `--u-text-tertiary` and one reader. Left undefined, the fallback
answers; a theme that wants its disabled ink to differ from its tertiary ink
declares the name and the contract picks it up. Recorded here so it is a hook
rather than an accident.

**The system accent, where WebKit knows it.** `--u-accent` was the literal
`#0a84ff` — which is also the *dark* system blue, so the light appearance was
wearing the wrong one; light is `#007aff`. Both hexes stay as the fallback, and
an `@supports (color: AccentColor)` block replaces the trio with `AccentColor`,
`AccentColorText` and a `color-mix()` of the accent down to `transparent`.
`--u-accent-soft` stays a mix rather than a flat colour because it is painted
over the window, the inspector and a raised sheet alike and has to take the
tint of whichever it lands on; the dark appearance mixes at 20% where light
mixes at 12%, since 12% of anything over `#1e1e1e` is nothing. A theme that
sets its own `--u-accent` is unaffected — `:root[data-theme="…"]` outranks the
`@supports` block's `:root` just as it outranks the palette.

**Motion tokens have call sites now.** `--u-duration` and `--u-ease` were
declared in v1 and read by nothing, which made the `prefers-reduced-motion`
block decorative. `.tb-btn`, `.step`, `.side-item`, `.row`, `.file` and `.pill`
transition the properties that actually change — `background`, `color`,
`box-shadow`, never `all`, and never a position or a size.

The second duration is there because the two kinds of motion here disagree.
Pointer-driven changes want `--u-duration`; selection does not. Selection moves
with the arrow keys, and a held ↓ walks a list faster than 180ms, so at that
length the accent edge is still arriving on a row the caret has left and the
list smears. `--u-duration-fast: 90ms` serves `.row`, `.file`, `.side-item` and
`.pill`. The reduced-motion block zeroes both — a theme that adds a duration
token of its own owes it the same.

**New — a bundled face.** `contract.css` declares `@font-face` for `SUIT`
(variable, `font-weight: 100 900`, `font-display: swap`) from
`./fonts/SUIT-Variable.woff2`, and `--u-font` names it after `"SF Pro Text"`.
Font matching runs per character down the family list, so Latin is found in SF
and never reaches SUIT while Hangul falls through to it — the same mechanism
`ink.css` and `acid.css` already use to name a Korean face, with a face the
repo now ships. The url is relative because the window's CSP is
`font-src 'self' data:` and a remote one would be blocked silently.

Candy Bento and Aurora Glass name `SUIT` ahead of their `"Apple SD Gothic Neo"`
entry. Ink & Paper does not: it is a serif theme and wants a Korean *serif*, so
`"Noto Serif KR"` stays. Acid Terminal does not either: it is mono throughout,
and a proportional Hangul face inside a monospaced row is the texture that
theme exists to avoid.

**`body` has a `line-height`.** It had none, so Korean body text ran at the UA
default of about 1.2 — a Hangul syllable fills its em box where a lowercase
Latin letter uses half of it, so Korean paragraphs had almost no gap between
lines, and components had begun patching it with inline `lineHeight: 1.5`.
`1.45` on `body`. It cannot disturb a contract row: `.tb-btn`, `.side-item`,
`.row`, `.pill`, `.key`, `.step`, `.file` and `.avatar` all set a fixed
`height` and centre their content, so the line box grows inside a box that does
not depend on it. `.diff-line` is the one row with a *minimum* height, and
11.5px × 1.45 is 16.7px against its 18px floor, so single-line diff rows do not
move either; a wrapped one gains leading. `.side-head`, the one unfixed box,
grows about 3px once per sidebar section.

**Gap recorded.** OFL 1.1 §2 wants the licence to travel with the font. Vite
emits only the woff2 the stylesheet references, so `fonts/SUIT-OFL.txt` is in
the repository but not in the built app. `NOTICE` records it; closing it is a
build-side job, next to what `stage-jj.mjs` already does for `LICENSE-jj`.

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
