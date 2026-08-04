---
name: Designally Content Studio
description: A focused editorial production interface for creating and finalizing strategically grounded, on-brand articles.
colors:
  primary: "#f66341"
  primary-hover: "#e14e2d"
  primary-press: "#c03e21"
  primary-soft: "#ffe8e0"
  primary-tint: "#fff4f0"
  background: "#ffffff"
  surface-sunken: "#faf7f4"
  surface-deep: "#f2ede8"
  ink: "#241f1c"
  ink-secondary: "#4a423d"
  ink-muted: "#7a6e66"
  border: "#e6dfd9"
  border-strong: "#c9bfb7"
  success: "#3f9e6c"
  success-ink: "#2c7350"
  warning: "#e8a23c"
  danger: "#dd4747"
  danger-ink: "#b23030"
  danger-hover: "#c53c3c"
  info: "#4a7dd6"
typography:
  display:
    fontFamily: "Gabarito, IBM Plex Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Gabarito, IBM Plex Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Gabarito, IBM Plex Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Instrument Sans, IBM Plex Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Instrument Sans, IBM Plex Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.35
  data:
    fontFamily: "Spline Sans Mono, ui-monospace, SF Mono, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
  4xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.background}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "40px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  chip:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-press}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "24px"
  dock:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    border: "none"
    shadow: "0 10px 30px rgba(36,31,28,.09)"
    padding: "12px 16px 4px"
    minHeight: "84px"
---

# Design System: Designally Content Studio

## Overview

**Creative North Star: "The Editorial Workbench"**

The interface is a practical surface for skilled content work: organized, calm, and clearly made with care. It uses familiar product patterns, measured density, and a restrained brand accent so users can concentrate on the article, the generation decision, and the next stage rather than the interface itself.

The system is intentionally light-only and structurally layered. White work surfaces sit on quiet warm-neutral foundations; full borders define regions, and orange appears only where action, selection, or brand identity needs emphasis. Motion is responsive and brief, communicating state without introducing choreography.

Two surface registers carry that idea. **Working surfaces** — Library, Pipeline, Settings — are dense, bordered, and flat on white: the interface is a tool and stays legible under repetition. **Canvas surfaces** invert the figure and ground for a single act of authoring: the page drops to Draft Bed and one borderless white object floats on it, holding all the attention. Create is the only canvas surface today.

It explicitly rejects the generic AI chatbot, the noisy analytics dashboard, and the over-decorated “futuristic AI” tool. Content production—not AI spectacle—is the visual subject.

**Key Characteristics:**

- Restrained orange used for primary action and current state
- Warm, readable neutrals with strong text contrast
- Familiar controls with refined proportions and consistent states
- Editorial type hierarchy paired with mono treatment for operational data
- Structural borders and tonal layers before decorative elevation, on every surface but the canvas
- A single lifted working object on canvas surfaces, with its results in the ordinary bordered vocabulary below

## Colors

The palette combines a vivid editorial orange with warm brown-leaning neutrals that make long-form content comfortable to read.

### Primary

- **Proofing Orange** (`primary`): reserved for the primary action, current step, focused control, and the smallest meaningful brand signals.
- **Press Orange** (`primary-hover`, `primary-press`): interaction states that deepen rather than brighten, keeping controls legible.
- **Markup Wash** (`primary-soft`, `primary-tint`): selected navigation, badges, and low-emphasis brand context.

### Neutral

- **Clean Sheet** (`background`): the default page and working surface.
- **Draft Bed** (`surface-sunken`, `surface-deep`): secondary navigation, disabled controls, grouped regions, subtle hierarchy, and the full page background of a canvas surface.
- **Editorial Ink** (`ink`, `ink-secondary`, `ink-muted`): headings, body copy, and supporting metadata in descending emphasis.
- **Rule Line** (`border`, `border-strong`): dividers, field outlines, and container boundaries.

### Tertiary

- **Approval Green**, **Review Amber**, **Rejection Red**, and **Information Blue** (`success`, `warning`, `danger`, `info`): semantic state only. Pair every color with text, an icon, or both.

**The One-Marker Rule.** Orange is a proofing mark, not wallpaper. It must remain rare enough that the next action and current state are immediately obvious.

**The Ink-First Rule.** Supporting text uses `ink-muted`; essential instructions and values use `ink-secondary` or `ink`. Never reduce hierarchy by lowering contrast below WCAG 2.2 AA.

## Typography

**Display Font:** Gabarito, falling back to IBM Plex Sans Thai and system sans-serif  
**Body Font:** Instrument Sans, falling back to IBM Plex Sans Thai and system sans-serif  
**Label/Mono Font:** Gabarito for controls; Spline Sans Mono for counts and aligned operational data

**Character:** Gabarito gives headings and actions an approachable editorial confidence; Instrument Sans stays quiet during reading and form work. Thai text must fall through to IBM Plex Sans Thai without losing hierarchy or density.

### Hierarchy

- **Headline** (700, 28px, 1.15): major library and workflow headings.
- **Title** (700, 22px, 1.15): page headers, stage titles, and major panel headings.
- **Body** (400, 16px, 1.6): instructions, form content, and interface prose; explanatory text should remain within 65–75 characters per line.
- **Label** (600, 14px, 1.35): buttons, fields, tabs, and compact controls.
- **Data** (400, 13px, 1.35): counts and aligned numeric values with tabular figures.

- **Canvas Display** (700, 40px, 1.1, `-0.02em`): the single headline on a canvas surface, stepping down to Headline below `640px`.

**The Interface-Type Rule.** Product labels remain compact and fixed-size. Fluid display typography is forbidden inside the authenticated application shell — Canvas Display is a discrete rung on the ramp with a discrete breakpoint, never a `clamp()`.

**The Two-Tone Headline.** A canvas headline may split its own line by weight of colour, setting the framing clause in `ink-secondary` and the operative phrase in `ink`, so the eye lands on the question rather than reading left to right through the setup. The split is a step, never a drop: `ink-muted` is for supporting text beside a headline, not for half of one, and using it here reads as washed out rather than as hierarchy. This is the only sanctioned decoration on a headline — no kicker, no eyebrow, no badge, no gradient.

**The Bilingual Rhythm Rule.** Thai and English must retain equal visual authority; never shrink Thai text or tighten its line-height to force matching geometry.

## Elevation

Elevation is structural almost everywhere: full borders and tonal surface changes establish hierarchy at rest, and shadows stay restrained. The one sanctioned exception is the **canvas surface** — a page whose entire job is a single act of authoring, where the working object is lifted off a warm bed instead of outlined on white.

### Shadow Vocabulary

- **Workbench Surface** (`0 1px 2px rgba(36,31,28,.05), 0 4px 12px rgba(36,31,28,.06)`): the maximum resting card shadow inside bordered layouts, paired with a quiet border.
- **Canvas Lift** (`0 10px 30px rgba(36,31,28,.09)`, deepening to `0 14px 36px rgba(36,31,28,.13)` on focus): borderless white surfaces resting on Draft Bed. Canvas surfaces only.
- **Popover Lift** (`0 4px 8px rgba(36,31,28,.08), 0 12px 32px rgba(36,31,28,.12)`): menus, dialogs, and other temporary layers only.
- **Focus Halo** (`0 0 0 3px #ffd0c2`): keyboard focus and field focus; never decorative.

**The Structural-First Rule.** Inside bordered layouts — Library, Pipeline, Settings — use surface tone and borders before shadow. If a static card looks detached from the page, the shadow is too strong.

**The Canvas Exception.** A canvas surface inverts that order: the page takes Draft Bed, its working objects take Clean Sheet with no border, and Canvas Lift separates them. This is only legitimate when the page is a single authoring act with one object of attention. It is not a licence to drop borders elsewhere, and a canvas page still uses the ordinary bordered vocabulary for anything below the fold that is a list, a result, or a form.

**Known gap.** The Create composer currently signals focus by deepening Canvas Lift rather than applying the Focus Halo, and its textarea suppresses the native outline. That does not meet the Focus Halo rule or WCAG 2.2 AA focus appearance, and it is recorded here as an open item rather than as sanctioned behavior.

## Components

Components are refined and restrained: predictable at first glance, precise under repeated use.

### Buttons

- **Shape:** full pill for actions (`999px`), 40px default height, 20px horizontal padding.
- **Primary:** Proofing Orange with white text; one clear primary action per local task region.
- **Hover / Focus:** deepen to Press Orange in 120ms; focus uses the three-pixel Focus Halo; active state scales to 98%.
- **Secondary / Ghost:** transparent or sunken backgrounds with Editorial Ink; inactive controls never compete with the primary action.
- **Outline:** a hairline on the Rule Line — the same weight as a card's border, never heavier. It is a hint at the shape, not the thing that identifies the control; the label and the hover fill do that work. A secondary action should never draw the eye by outline weight alone.
- **Outlines on a tinted fill** take the next step of that fill's own ramp, not the neutral Rule Line — the same relationship the Rule Line has to white. A warm-grey hairline around an orange wash lands at lower contrast than the neutral outline it is meant to match, and reads as dirt rather than as a rule.

### Chips

- **Style:** 24–32px pill, compact Gabarito label, soft orange or neutral tonal background.
- **State:** selected chips use Markup Wash and Press Orange text; semantic chips use their named status pair and always include readable wording.

### Cards / Containers

- **Corner Style:** gently curved (`16px`); `24px` for the large containers on a canvas surface.
- **Background:** Clean Sheet over Clean Sheet or Draft Bed; nested cards are prohibited.
- **Shadow Strategy:** Workbench Surface only when the container functions as a distinct working object. On a canvas surface, Canvas Lift replaces both the border and the shadow.
- **Border:** one-pixel Rule Line around the full perimeter, except on canvas surfaces where the lift does that work.
- **Internal Padding:** 16px for compact groups, 24px for primary panels, 32px only for spacious stage shells.

### Composer Dock

The Create page's single input. One borderless Clean Sheet object on Draft Bed, holding a free-text field above a control row, with generated results — and the search that produces them — rendering below it in the ordinary bordered vocabulary.

- **Container:** `16px` radius, no border, Canvas Lift, `position: relative`.
- **Field:** auto-growing textarea, `84px` minimum and `320px` maximum height, transparent background, no border or outline. Beyond the maximum it scrolls, and an expand control appears at the top-right to release the cap.
- **Masked top edge:** the field's viewport carries `12px` of top padding and a Clean Sheet mask across that band, so scrolled text disappears cleanly instead of colliding with the dock's rounded top.
- **Control row:** direction chip at the left, then generate-ideas and submit at the right. `8px` above and at the sides, `10px` below. Both right-hand actions are `40px` tall on the full pill radius.
- **Direction chip:** `36px` pill with `8px` inner padding and no outline, taking a Draft Bed fill only on hover and while its menu is open. A chosen direction is shown in full Editorial Ink against the muted default — the way a select distinguishes a value from its placeholder — and never in the accent. Opens a pillar → direction drill-down menu at Popover Lift.
- **Generate:** a Markup Wash pill with a Press Orange label and an outline one ramp step past its own fill. It goes properly `disabled` the moment the editor writes something, taking the standard disabled fade — the ideas path is off the table, and a control that is off the table should say so rather than merely go quiet. The wash is what gives the orb a ground: at outline weight the orb reads as a stray dot, and as one object with the pill it reads as the live control. Icon-only below `640px`, labelled above it.
- **The orb:** `26px` at half speed, rendered in Proofing Orange through the brand ramp — near dots at Press Orange, far dots lightening toward `#ffa78f`. Slow enough to read as ambient rather than as a spinner reporting progress. It runs continuously, fading with its button rather than stopping — availability is the button's job to report, not the orb's. It idles when off-screen or on a hidden tab, and falls back to a single frame under reduced motion.
- **Leading marks in a pill** sit concentric with the pill's end cap, not on a flat side inset: `padding-left = height/2 − mark/2 − border`. A circular mark against a curved edge has no single "left gap" to match, so anything else reads as left-heavy no matter how the number was chosen.
- **Submit:** `40px` circle carrying a send icon. A neutral outline at rest, held at full strength rather than the global disabled fade so it sits at exactly the weight of the generate pill beside it. It takes the Proofing Orange fill the moment the field has content, and swaps to a spinner while the article is created. Icon-only, so it always carries an `aria-label`.
- **Placement:** vertically centered in the viewport, and the only thing on it. Asking for ideas replaces the whole composer — heading included — with the search and then its results; the page never shows both at once.

**The Dock Accent Rule.** The dock has two states, and the accent hands off between them at exactly one moment. **At rest** the live path is asking for ideas, so generate carries Markup Wash and a moving orb while submit sits as a bare outline. **The first keystroke swaps them**: submit takes the saturated Proofing Orange fill because it is now the action that creates the article, and generate goes disabled because that path is no longer on the table. Only ever one accent at full strength, and it sits on whichever action the editor's own input has made live. Setting a direction never takes the accent in either state; a preference is not an accomplishment, and an accent spent on a setting is an accent unavailable to the action.

**The Level-Rest Rule.** Controls that are unavailable only because the editor has not acted yet are held at full strength, not at the global disabled fade — submit at rest is an available-looking option, not a broken one. The fade is reserved for a control the editor's own input has genuinely ruled out. Emphasis says which path is live; the fade says which path has closed.

**The Single-Object Rule.** The dock is the only lifted object above the fold. Anything the dock produces — idea lists, errors, results — belongs to the normal bordered system beneath it.

**The Editorial Index.** A list the editor must choose from is set as a contents page, not as a grid of equal cards: one weighted lead entry carrying the full case, then a ruled list of the rest, separated by Rule Lines and typographic weight rather than by containers. Equal cards flatten a decision into eight identical objects, which is the opposite of hierarchy.

**The Row-Is-The-Target Rule.** When every item in a list carries the same single action, the row is the control and the repeated button goes. One trailing arrow marks the affordance and displaces on hover. A list of eight rows each ending in the same button is eight copies of one instruction.

**Hover fills overhang; content does not.** A row's hover fill is pulled wider than the text it wraps and carries a radius, so it reads as a highlight behind the row. A fill that stops exactly on the content edge and squares off against the Rule Lines reads as a slab cut out of the list. The text keeps the container's left edge either way — only the fill overhangs.

**The Whole-Payload Rule.** If the system generated it, carried it, and will act on it, the editor sees it before deciding. Research that reaches the draft but never reaches the screen is a decision made blind.

**The Horizon Rule.** The orbiting-source globe is a horizon composition: its sphere is centred on its own bottom edge, so the lower half is clipped by design. That clip needs somewhere to land. Give it the dissolve of a `mask-image` gradient rather than a card — a container around it turns a full-bleed stage into a widget, and leaving the clip bare turns it into a broken image.

**Centring is against the viewport, not the container.** A stage that replaces the composer centres on the same line the composer used: `50svh − 2rem` while the mobile bar is present, `50svh` from `lg` up. That means filling the visible height (`100svh − 4rem`, then `100svh`) and cancelling any surrounding padding — padding left in place counts as content and pushes the stage upward. A partial height with `justify-center` centres against itself and lands high on the screen, which is the most common way this goes wrong.

**The No-Dead-End Rule.** Whenever a canvas surface replaces its composer with results, those results must carry every route onward the composer was providing — here, a fresh set of ideas and a way back to writing your own. A screen that took away the way in owes the way out.

**The Two-Gutter Rule.** The dock runs on a `16px` text gutter and an `8px` control gutter, and every value follows from those two. Control *ink* — the chip's icon, the submit glyph — sits on the `16px` line so it aligns with the field's text; only the rounded shapes behind them overhang to `8px`. Vertical insets are set optically, not numerically: the field's top padding is `12px` because line-height already contributes roughly `6px` of half-leading above the first cap, and a literal `16px` there would read as a third too much.

### Inputs / Fields

- **Style:** 44px height, Clean Sheet background, one-pixel Rule Line, 12px corner radius, 16px horizontal padding.
- **Focus:** border changes to Proofing Orange with the Focus Halo.
- **Error / Disabled:** error uses Rejection Red plus explanatory text; disabled uses Draft Bed and muted ink without removing the label.

### Navigation

- The side navigation uses Clean Sheet, a right Rule Line, and compact 44px rows, ordered Create → Library → Settings. Active destinations use Markup Wash, Press Orange text, and an orange icon; inactive destinations remain neutral until hover.
- It is collapsible between `240px` and `80px`, animating width over 200ms. Collapsed, rows center a 20px icon and keep their label available to assistive technology and as a tooltip. The toggle is a circular Clean Sheet button straddling the right Rule Line. Canvas surfaces open with the navigation collapsed so the working object holds the page.
- The six-stage stepper is horizontally scrollable on narrow screens. Current, completed, available, and locked steps must remain visually distinct without relying on color alone.

### Generation Workbench

Model, ratio, reference, variation, prompt, and result controls must read as one progressive task rather than independent cards. Capability-dependent controls disappear or become explicitly unavailable.

## Do's and Don'ts

### Do:

- **Do** use Proofing Orange only for primary action, current selection, focus, and small brand signals.
- **Do** preserve the same button, input, card, badge, and navigation vocabulary across Library, New Content, Pipeline, and Settings.
- **Do** use full borders, tonal grouping, labels, and icons to communicate structure and status — and reserve the borderless Canvas Lift for a canvas surface's single working object.
- **Do** keep motion between 120–200ms, tied to hover, focus, expansion, loading, and state change, with reduced-motion support. The composer dock's orb is the single sanctioned exception: it runs unprompted for as long as the composer is empty, because being alive is the point, and it is the only such animation in the product. Even it stops once the editor has written something.
- **Do** maintain WCAG 2.2 AA contrast and equal typographic care for Thai and English.

### Don't:

- **Don't** make the interface resemble a generic AI chatbot. The composer dock is an input affordance, not a conversation: no message transcript, no turn-taking, no assistant persona, no scrollback. It takes one turn and renders structured results below itself.
- **Don't** make it a noisy analytics dashboard; metrics support decisions and never dominate the content task.
- **Don't** use an over-decorated “futuristic AI” aesthetic, neon glow, decorative gradients, or glassmorphism.
- **Don't** introduce nested cards, colored side-stripe borders, gradient text, or decorative grids. Wide soft shadows are permitted only as Canvas Lift on a canvas surface's working object; anywhere else they remain ghost-card decoration.
- **Don't** invent novel controls for standard actions or use motion that does not communicate state.
- **Don't** use color alone for brand-review findings, warning, error, progress, or provider availability.
