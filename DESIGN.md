---
name: Oma Beats website
description: A record sleeve you can play, in cream paper, sage equipment, and orange actuation.
colors:
  paper: '#eae7dc'
  ink: '#2c342d'
  muted: '#59614f'
  sage: '#c4cdb6'
  orange: '#b73d1e'
  bright: '#d6512e'
  line: '#c5c7b8'
  dark: '#28322b'
  primary-hover: '#963219'
  white: '#fff'
  pad: '#dce1d2'
  step: '#b0bda0'
  step-on: '#485a3d'
  style-selected: '#d8dfcc'
  instrument-rule: '#9ea991'
typography:
  display:
    fontFamily: 'Barlow Condensed, sans-serif'
    fontSize: 'clamp(72px, 7.7vw, 96px)'
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: '-0.025em'
  headline:
    fontFamily: 'Barlow Condensed, sans-serif'
    fontSize: '64px'
    fontWeight: 600
    lineHeight: 1
    letterSpacing: '-0.025em'
  title:
    fontFamily: 'Barlow, sans-serif'
    fontSize: '25px'
    fontWeight: 600
    letterSpacing: '-0.02em'
  body:
    fontFamily: 'Barlow, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.65
  intro:
    fontFamily: 'Barlow, sans-serif'
    fontSize: '21px'
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'Barlow, sans-serif'
    fontSize: '12px'
    fontWeight: 600
    letterSpacing: '0.06em'
rounded:
  step: '3px'
  style: '4px'
  control: '5px'
  instrument: '14px'
  instrument-mobile: '10px'
spacing:
  step-gap: '5px'
  pad-gap: '7px'
  compact: '12px'
  control: '18px'
  group: '20px'
  section-gap: '30px'
components:
  button-primary:
    backgroundColor: '{colors.orange}'
    textColor: '{colors.white}'
    rounded: '{rounded.control}'
    padding: '17px 24px'
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
  button-play:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.paper}'
    rounded: '{rounded.control}'
    padding: '15px 18px'
  button-play-playing:
    backgroundColor: '{colors.orange}'
    textColor: '{colors.white}'
  style-selector:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.style}'
    padding: '9px 15px'
  style-selector-selected:
    backgroundColor: '{colors.style-selected}'
  tempo-input:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    width: '67px'
    padding: '0'
  instrument:
    backgroundColor: '{colors.sage}'
    textColor: '{colors.ink}'
    rounded: '{rounded.instrument}'
    padding: '30px 34px 20px'
  pad:
    backgroundColor: '{colors.pad}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '9px 8px'
    height: '61px'
  sequencer-step:
    backgroundColor: '{colors.step}'
    rounded: '{rounded.step}'
    padding: '0'
    height: '40px'
  sequencer-step-on:
    backgroundColor: '{colors.step-on}'
---

# Design System: Oma Beats

## Overview

**Creative North Star: "A record sleeve you can play"**

The website expresses Oma Beats as a record sleeve that opens into a working instrument: broad cream paper, a sage control surface, dark olive text, and orange actions. Condensed display lettering creates the expressive scale; quiet body typography leaves room for a dense, usable music interface. The shared brand commitment is the established cream, sage, and orange identity.

This record scopes its normative tokens and component rules to `site/index.html`, `site/style.css`, `site/fonts.css`, and `site/site.js`. The desktop app under `app/` is a separate incumbent surface: it retains Inter/Liberation Sans, monospace readouts, cream gradients, sage LCDs, and its own controls and depth. Do not treat the website's Barlow pairing, size ramp, or exact colors as a migration instruction for the app.

**Key Characteristics:**

- Cream editorial space around a sage instrument.
- Condensed display type paired with readable Barlow controls.
- Orange for emphasis, actions, and active playback.
- Code-drawn music diagrams, SVG icons, and real interactive states.

## Colors

Warm paper and muted equipment greens carry the page; orange supplies a sharp, limited signal. Frontmatter values are normative for the website; component-specific state values are preserved in the sidecar snippets.

### Primary

- **Actuation orange** (`orange`): install action, emphasized headline words, focus on paper, and playing transport.
- **Sounding orange** (`bright`): pad hits, active playhead hits, the brand mark, and selected waveform slices. This is also the app's incumbent orange.

### Secondary

- **Equipment sage** (`sage`): the broad interactive instrument body.
- **Selected sage** (`style-selected`): the chosen demo style, with a visible border.
- **Pad sage** (`pad`), **step sage** (`step`), and **enabled olive** (`step-on`): distinguish playable pads, empty steps, and enabled steps.

### Neutral

- **Cream paper** (`paper`): website canvas and reversed transport text.
- **Olive ink** (`ink`): main text and resting transport.
- **Muted olive** (`muted`): supporting copy on paper.
- **Paper rule** (`line`) and **equipment rule** (`instrument-rule`): separate editorial rows and transport groups.
- **Deep olive** (`dark`): installation section, with cream text and lighter supporting greens.
- **White** (`white`): text on orange controls. **Deep actuation orange** (`primary-hover`) supplies the primary action's hover state.

**The Actuation Rule.** Use orange for a deliberate emphasis, action, or sounding state; keep the broad equipment surface sage.

## Typography

**Display Font:** Barlow Condensed, sans-serif fallback. **Body Font:** Barlow, sans-serif fallback. The install command alone uses the browser's monospace code face. Both Barlow families are self-hosted through `site/fonts.css`; OFL notices accompany the fonts in `site/assets/`. Font synthesis is disabled and font loading uses swap.

The pairing is firm and compact without making the controls decorative. The scale is role-based rather than a single mathematical ratio.

- **Display:** uppercase hero, using the frontmatter display role. At widths up to 850px it becomes 76px; at up to 560px the final cascade uses `clamp(58px, 17vw, 72px)`.
- **Headline:** the base section heading role; installation uses 72px on desktop and 64px below 850px. The feature heading uses 57px below 850px and 60px below 560px. FAQ headings use 44px, then 38px, then 43px at those same breakpoints.
- **Title:** feature row titles. Instrument title is Barlow at 29px, weight 600, with 25px at the mobile breakpoint.
- **Body:** feature prose with a 50ch maximum; FAQ prose is 15px with 1.7 line height and a 70ch maximum.
- **Intro:** hero prose is limited to 30ch; the final mobile value is 17px. Adjacent section intro prose is limited to 37ch on desktop.
- **Label:** functional module labels. Most supporting instrument metadata is 12px; uppercase and tracking identify control groups, not decorative editorial kickers.

**The Two Voices Rule.** Use Barlow Condensed for editorial headings and Barlow for instructions and controls. The instrument title uses Barlow, even though it is an h2.

## Layout

The website container is `min(1320px, calc(100% - 96px))`. Side margins become 32px at 1100px, 20px at 850px, and 16px at 560px. The desktop hero uses `1.4fr 1fr`; editorial feature rows use `1.05fr 1.4fr 190px`. Installation and FAQ use asymmetric two-column grids. Fine 1px rules organize content without putting each feature in a card.

Spacing is contextual: tight 5px step gaps and 7px pad gaps inside equipment; 20–34px control groups and shell padding; generous section separation. The feature section starts with 112px top padding on desktop, 75px below 850px, and 64px below 560px. Do not infer an unimplemented universal spacing scale from these measurements.

At 850px and below, the pad section and feature diagrams are hidden, the instrument becomes one column, and installation stacks. At 560px and below, the hero, feature rows, and FAQ stack; navigation keeps the installation link. The instrument remains useful: its sequence has a 525px minimum width, scrolls within a `min-width: 0` grid child, and exposes a swipe hint. Desktop sequence minimum width is 550px. The page itself must not widen to fit the sequence.

## Elevation & Depth

Paper sections and feature rows are flat. The instrument uses a soft cast shadow plus a shallow inset bottom edge; pads repeat that physical cue at a smaller scale. Enabled sequence steps use inset depth. These are equipment affordances, not hard offset decorative shadows.

- **Instrument shell:** `0 8px 24px #29342218, inset 0 -6px 0 #8b987e`.
- **Pad:** `0 3px 4px #46523924, inset 0 -3px 0 #acb69f`.
- **Enabled step:** `inset 0 -3px 0 #36492b`; a sounding enabled step changes its inset edge to `#ab4225`.

**The Equipment Depth Rule.** Reserve tactile inset edges and soft shadows for the instrument and its playable parts; keep editorial rows flat.

## Shapes

Controls are firm rectangles with gently softened corners. Small sequence cells, selected styles, and primary controls use the separate frontmatter radii; the larger shell has a broader radius that tightens on mobile. Circular marks are limited to status lights and step indicators. Borders are thin and purposeful. Music illustrations use rectangular bars, bank cells, and keyboard geometry; icons use inline SVG strokes, with filled shapes for play and the brand mark.

## Components

### Buttons

The primary installation action is an orange rectangle with white text and an SVG arrow. Its hover darkens; the background transitions over 0.18s. The play control rests in olive ink, uses cream text, and becomes orange while playing. The command-copy button is sage on the dark installation surface. Text actions use underlines rather than a filled container.

All interactive controls receive a 3px orange focus outline with a 5px offset; the dark installation section changes the outline to a lighter orange (`#e89a70`). Disabled buttons use 0.6 opacity and a waiting cursor.

### Style selectors

These are three demo choices, not generic decorative chips. The chosen option has pale sage fill and a thin olive border; its title sits above the genre label. Hover uses a slightly different sage fill. Selection is also exposed with `aria-pressed`.

### Cards / Containers

The instrument is the principal contained surface. Feature explanations are divided rows; the supporting save note is a quiet sage strip. The install command uses a dark inset field with a thin green border. Do not spread the instrument's tactile shadow to these flat editorial containers.

### Inputs / Fields

Tempo is an exposed number input with a transparent background, a thin bottom border, a 29px semibold readout, and BPM beside it. The native volume range takes the orange accent. The website does not establish a general form, error, or validation appearance.

### Navigation

The compact Barlow wordmark combines medium and bold text with a filled orange pad-grid SVG. Navigation uses 15px semibold links with orange hover; the installation link retains an underline rule and downward arrow. At the smallest breakpoint it is the only navigation item shown. The skip link becomes visible on keyboard focus.

### Playable pads and sequencer

Pads show a number and sound name, form a four-column grid, and change sage shade by sound group. A hit turns orange and depresses 2px, with an 0.08s transition. Enabled steps are olive with a small light indicator; the current step receives a warm playhead color and turns bright orange when enabled. State is synchronized to playback after user activation. Functional text labels remain in Barlow.

### Disclosures and motion

FAQ rows use native `details` and `summary`, a fine divider, and an inline SVG chevron that rotates on opening. Motion otherwise serves control feedback; there is no ambient animation. Reduced motion disables transitions, animation, smooth scrolling, and pad displacement while preserving instantaneous state changes.

## Do's and Don'ts

### Do:

- **Do** preserve the cream, sage, and orange brand relationship across surfaces.
- **Do** use the website tokens only within the website scope unless an app change is explicitly requested.
- **Do** use inline SVG icons and code-drawn waveform, pad-bank, and keyboard diagrams.
- **Do** preserve visible focus, accessible control names, and immediate reduced-motion playback indicators.
- **Do** keep the small-screen sequencer horizontally scrollable inside its own track.

### Don't:

- **Don't** introduce decorative kickers or eyebrows as a reusable heading pattern; compact labels belong to actual controls or product metadata.
- **Don't** use orange as an all-over equipment background.
- **Don't** replace working controls with a static mockup or trigger audio automatically.
- **Don't** add raster decoration to this code-led website or substitute glyphs for its SVG icons.
- **Don't** turn the website's exact first-page composition into a rule for every future surface.

Source basis: final website HTML/CSS/JS, local font declarations, the website direction contract, and `app/style.css` for the scope boundary. Unused website declarations such as `--sage-deep` and the removed hero metadata strip are not promoted to tokens or patterns. Incumbent app eyebrows and system typography are not canonized into the website system; the app is outside this documentation pass's migration scope.
