# DESIGN.md

> agent · pool — a study in shared capital.
> Brutalist mono. Black and white wireframe with status-only accent.
> Every UI generation in this repo honors these rules.

## tokens

```yaml
font:
  primary: "IBM Plex Mono, ui-monospace, SFMono-Regular, monospace"
  weights: [300, 400, 500, 600]   # use 300 for hero numerals, 400 body, 500 status, 600 wordmark
  feature_settings: '"ss02", "zero"'   # slashed zero, alt operators

color:
  ink: "#0A0A0A"          # all text, borders, primary buttons
  paper: "#FAFAF7"        # page background — warm off-white, not pure white
  mute: "#6B6B66"         # secondary text, timestamps, metadata
  faint: "#A8A8A2"        # disabled rows, suspended agents
  approved: "#1F7A3A"     # status pill only — never as fill, never decorative
  denied: "#B0241B"       # status pill only — never as fill, never decorative

space:
  unit: 4
  scale: [4, 8, 12, 16, 24, 32, 48, 64]
  page_gutter: 18
  row_height: 32

border:
  hairline: "1px solid var(--ink)"
  thick: "3px solid var(--ink)"     # section dividers, outer frame
  radius: 0                          # square corners everywhere — no exceptions

type:
  hero_balance: "64px / 1 / 300 / -0.04em"
  wordmark:     "26px / 1 / 600 / -0.02em"
  label_caps:   "10px / 1 / 400 / 0.14em / uppercase"
  body:         "13px / 1.9 / 400"
  meta:         "11px / 1.4 / 400 / mute"
```

## voice & texture

- **Lowercase everywhere.** Wordmark, labels, status pills. The only uppercase is the tracked label-caps token (e.g. `POOL BALANCE · CENTS STORED`).
- **Middots as separators.** `us-east-1 · agent-01 · cap $80 · active`. Never commas in UI.
- **Editorial framing.** Treat the dashboard like a printed zine: wordmark + subtitle (`"a study in shared capital · no. 001"`), footer signature (`"h0 · 2026 · vol. i"`).
- **Numerals are the texture.** Mono digits, slashed zero, large weight contrast. Money always shown as `$X.YY` with two decimals, even when zero.
- **Borders carry the structure.** Square corners, hairline 1px between rows, thick 3px between sections. No shadows. No gradients. No radius.
- **Color is reserved for status.** Approved = green. Denied = red. Nothing else gets color. A button is black-on-white or inverted white-on-black — never colored.
- **ASCII is welcome.** Sparklines, the race diagram, separator rules drawn with `─━│┃` are part of the language.

## patterns

### pool balance (hero)

Top-left of the dashboard. 64px Plex Light. Two decimals at 22px Light, mute color.
Below: ASCII sparkline `▆▅▄▃▂▁▂▃▅▇█` of the last 24 spend amounts, mute color, label `last 24 spends`.

### conflict moment (hero-right)

Top-right, beside the balance. ASCII race diagram (two arrows into a `[ pool ]` box) above the **Run Race** button. The button is inverted: white text, black fill, 2px black border, square, full-width of its column, label `▸ run race  [ 2 × $80 vs $100 ]`.

### counter strip

Single row beneath the hero. Four cells separated by middots:
`spends · approved · denied · 40001 caught`
Each cell: tracked-caps label above, mono 18px number below. Numbers animate up when Run Race fires. No card, no border on individual cells — just the row.

### last-conflict callout

One line beneath the counter strip, mute color, italic-feeling via spacing:
`last 40001 caught · 2.3s ago · agent-02 vs agent-01`
Updates live. When no conflict yet: `no serialization conflicts yet · run race to trigger one`.

### agents row

`region · agent-id · cap $X · ● active` or `○ suspended` (faint color).
Active dot = ink. Suspended ring = mute.
On the right of each active row: `[ suspend ]` as plain underlined mono link, ink color, hover = denied red. Suspended agents show `[ reactivate ]` instead.

### activity row

`HH:MM:SS.mmm · agent-XX · −$X.XX · [ approved ] · region`
Denied rows append the reason in mute: `· insufficient_pool` / `· over_cap` / `· suspended`.
Status pills are bracketed text — never filled chips. Approved = green text. Denied = red text. Fixed-width brackets so columns align: `[ approved ]` and `[ denied   ]` (trailing spaces).

### footer signature

Thick 3px rule, then tracked-caps row spanning the width:
`invariant · balance ≥ 0 · enforced in db` (left) and `h0 · 2026 · vol. i` (right).

## rules for generations

1. Never introduce a new color. If a state needs distinction, use weight, mute, or brackets.
2. Never round a corner.
3. Never use a shadow, gradient, blur, or animation longer than 150ms.
4. Never use a sans-serif font. Everything is IBM Plex Mono.
5. Always render money as integer cents in the database; format only at the edge.
6. Status pills are text in brackets, never background-filled chips.
7. Polling is 1000ms. No skeleton loaders — show the last known value until the next poll lands.
