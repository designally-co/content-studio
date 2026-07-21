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
---

# Design System: Designally Content Studio

## Overview

**Creative North Star: "The Editorial Workbench"**

The interface is a practical surface for skilled content work: organized, calm, and clearly made with care. It uses familiar product patterns, measured density, and a restrained brand accent so users can concentrate on the article, the generation decision, and the next stage rather than the interface itself.

The system is intentionally light-only and structurally layered. White work surfaces sit on quiet warm-neutral foundations; full borders define regions, and orange appears only where action, selection, or brand identity needs emphasis. Motion is responsive and brief, communicating state without introducing choreography.

It explicitly rejects the generic AI chatbot, the noisy analytics dashboard, and the over-decorated “futuristic AI” tool. Content production—not AI spectacle—is the visual subject.

**Key Characteristics:**

- Restrained orange used for primary action and current state
- Warm, readable neutrals with strong text contrast
- Familiar controls with refined proportions and consistent states
- Editorial type hierarchy paired with mono treatment for operational data
- Structural borders and tonal layers before decorative elevation

## Colors

The palette combines a vivid editorial orange with warm brown-leaning neutrals that make long-form content comfortable to read.

### Primary

- **Proofing Orange** (`primary`): reserved for the primary action, current step, focused control, and the smallest meaningful brand signals.
- **Press Orange** (`primary-hover`, `primary-press`): interaction states that deepen rather than brighten, keeping controls legible.
- **Markup Wash** (`primary-soft`, `primary-tint`): selected navigation, badges, and low-emphasis brand context.

### Neutral

- **Clean Sheet** (`background`): the default page and working surface.
- **Draft Bed** (`surface-sunken`, `surface-deep`): secondary navigation, disabled controls, grouped regions, and subtle hierarchy.
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

**The Interface-Type Rule.** Product labels remain compact and fixed-size. Fluid display typography is forbidden inside the authenticated application shell.

**The Bilingual Rhythm Rule.** Thai and English must retain equal visual authority; never shrink Thai text or tighten its line-height to force matching geometry.

## Elevation

Elevation is structural. Full borders and tonal surface changes establish hierarchy at rest; shadows are restrained and reserved for surfaces that genuinely float above content.

### Shadow Vocabulary

- **Workbench Surface** (`0 1px 2px rgba(36,31,28,.05), 0 4px 12px rgba(36,31,28,.06)`): the maximum resting card shadow, paired with a quiet border.
- **Popover Lift** (`0 4px 8px rgba(36,31,28,.08), 0 12px 32px rgba(36,31,28,.12)`): menus, dialogs, and other temporary layers only.
- **Focus Halo** (`0 0 0 3px #ffd0c2`): keyboard focus and field focus; never decorative.

**The Structural-First Rule.** Use surface tone and borders before shadow. If a static card looks detached from the page, the shadow is too strong.

## Components

Components are refined and restrained: predictable at first glance, precise under repeated use.

### Buttons

- **Shape:** full pill for actions (`999px`), 40px default height, 20px horizontal padding.
- **Primary:** Proofing Orange with white text; one clear primary action per local task region.
- **Hover / Focus:** deepen to Press Orange in 120ms; focus uses the three-pixel Focus Halo; active state scales to 98%.
- **Secondary / Ghost:** transparent or sunken backgrounds with Editorial Ink; inactive controls never compete with the primary action.

### Chips

- **Style:** 24–32px pill, compact Gabarito label, soft orange or neutral tonal background.
- **State:** selected chips use Markup Wash and Press Orange text; semantic chips use their named status pair and always include readable wording.

### Cards / Containers

- **Corner Style:** gently curved (`16px`).
- **Background:** Clean Sheet over Clean Sheet or Draft Bed; nested cards are prohibited.
- **Shadow Strategy:** Workbench Surface only when the container functions as a distinct working object.
- **Border:** one-pixel Rule Line around the full perimeter.
- **Internal Padding:** 16px for compact groups, 24px for primary panels, 32px only for spacious stage shells.

### Inputs / Fields

- **Style:** 44px height, Clean Sheet background, one-pixel Rule Line, 12px corner radius, 16px horizontal padding.
- **Focus:** border changes to Proofing Orange with the Focus Halo.
- **Error / Disabled:** error uses Rejection Red plus explanatory text; disabled uses Draft Bed and muted ink without removing the label.

### Navigation

- The fixed 240px side navigation uses Clean Sheet, a right Rule Line, and compact 40px rows. Active destinations use Markup Wash, Press Orange text, and an orange icon; inactive destinations remain neutral until hover.
- The six-stage stepper is horizontally scrollable on narrow screens. Current, completed, available, and locked steps must remain visually distinct without relying on color alone.

### Generation Workbench

Model, ratio, reference, variation, prompt, and result controls must read as one progressive task rather than independent cards. Capability-dependent controls disappear or become explicitly unavailable.

## Do's and Don'ts

### Do:

- **Do** use Proofing Orange only for primary action, current selection, focus, and small brand signals.
- **Do** preserve the same button, input, card, badge, and navigation vocabulary across Library, New Content, Pipeline, and Settings.
- **Do** use full borders, tonal grouping, labels, and icons to communicate structure and status.
- **Do** keep motion between 120–200ms, tied to hover, focus, expansion, loading, and state change, with reduced-motion support.
- **Do** maintain WCAG 2.2 AA contrast and equal typographic care for Thai and English.

### Don't:

- **Don't** make the interface resemble a generic AI chatbot; generation belongs inside the guided editorial workflow.
- **Don't** make it a noisy analytics dashboard; metrics support decisions and never dominate the content task.
- **Don't** use an over-decorated “futuristic AI” aesthetic, neon glow, decorative gradients, or glassmorphism.
- **Don't** introduce nested cards, colored side-stripe borders, gradient text, decorative grids, or wide ghost-card shadows.
- **Don't** invent novel controls for standard actions or use motion that does not communicate state.
- **Don't** use color alone for brand-review findings, warning, error, progress, or provider availability.
