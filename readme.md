# Yousef Eddin — Portfolio Design System & Style Guide

> Reference doc for maintaining visual and structural consistency across all pages of [yousefedd.in](https://yousefedd.in).

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Color Tokens](#color-tokens)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Component Patterns](#component-patterns)
6. [Naming Conventions](#naming-conventions)
7. [Page Templates](#page-templates)
8. [Do's and Don'ts](#dos-and-donts)

---

## Project Structure

```
/
├── index.html              # Home / hero page
├── projects.html           # Project hub
├── styles.css              # Global design tokens & shared components
├── site.js                 # Shared behaviors (nav, reveal, ripple, typewriter)
├── Yousef_Résumé.pdf
│
├── blog/
│   ├── index.html          # Blog listing
│   ├── blog.css            # Blog-specific styles (imports tokens from styles.css)
│   └── posts/
│       ├── shows-2026.html
│       └── new-games-2026.html
│
├── gym-dashboard/
│   ├── index.html
│   ├── dashboard.css       # Dashboard-specific styles
│   └── dashboard.js        # Data pipeline + SVG chart rendering
│
└── tft-team-search/
    ├── index.html
    ├── styles.css          # TFT-specific styles
    └── app.js
```

**Rule:** Every sub-page loads `../styles.css` (or `../../styles.css`) first, then its own page-specific CSS. Never redefine design tokens in a sub-page stylesheet — override them if absolutely necessary, but this should be rare.

---

## Color Tokens

All colors are defined as CSS custom properties in `styles.css` and must be used by reference. Never hardcode hex values directly in component styles.

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#fdfcfb` | Page background base |
| `--text` | `#232336` | Body text, headings |
| `--muted` | `#676788` | Secondary text, labels, metadata |
| `--panel` | `#ffffff` | Cards, panels, modals |
| `--brand` | `#6c63ff` | Primary color — headings, links, CTAs, chart accents |
| `--accent` | `#ff7ac0` | Hover states, gradient endpoints, badges |
| `--highlight` | `#5ed0bd` | Success, streak, "done" states, timeline dots |

### Semantic Usage

- **`--brand`** is the dominant active color. Use it for interactive elements, section titles, and data callouts.
- **`--accent`** is for motion — hover transformations, gradient endings, and energetic badges. Never use it as a static text color.
- **`--highlight`** signals completion or positive states (finished games, on-time delivery, streaks).
- **`--muted`** handles all supporting text: dates, tags, meta labels. Keep contrast accessible — don't use it for critical information.

### Shadows

```css
--shadow-sm: 0 2px 8px rgba(35, 35, 54, 0.06);   /* Subtle lift — list items, small elements */
--shadow:    0 10px 24px rgba(35, 35, 54, 0.08);  /* Default card elevation */
--shadow-lg: 0 22px 48px rgba(108, 99, 255, 0.18); /* Hover state elevation, hero elements */
```

Use `--shadow` by default on cards. Apply `--shadow-lg` only on `:hover` or as a featured-element marker.

### Gradients

The standard brand gradient runs `var(--brand)` → `var(--accent)`, used at `120deg` for badges and `90deg` for horizontal bars. The secondary gradient adds `var(--highlight)` as a third stop for the timeline and footer border.

```css
/* Standard brand gradient */
background: linear-gradient(120deg, var(--brand), var(--accent));

/* Three-stop gradient (timeline, footer accent line) */
background: linear-gradient(to bottom, var(--brand), var(--accent), var(--highlight));
```

---

## Typography

### Font Stack

```css
font-family: 'Poppins', 'Inter', system-ui, -apple-system, Segoe UI, sans-serif;
```

Both `Poppins` (headings, UI labels) and `Inter` (body copy where needed) are loaded from Google Fonts on every page. The weights in use are `400`, `600`, `700`, and `800`.

### Type Scale

| Role | Size | Weight | Token/Context |
|---|---|---|---|
| Brand name (header) | `1.55rem` | 800 | `.brand__title` |
| Page/section title | `clamp(1.8rem, 3vw, 2.4rem)` | 800 | `.section__title` |
| Post/hero heading | `clamp(1.8rem, 3.5vw, 2.6rem)` | 800 | `.blog-post-header h2` |
| Card title | `1.3–1.4rem` | 800 | `.card__head h3`, `.review-card__title` |
| Subsection heading | `1.05–1.1rem` | 700 | `.review-card__section h4`, `.timeline__item h3` |
| Body copy | `0.95–1.02rem` | 400 | Paragraphs |
| Meta / labels | `0.85–0.88rem` | 600 | Dates, tags, subtitles |
| Micro / badges | `0.68–0.82rem` | 700–800 | Pill badges, status tags |

### Letter Spacing

Apply `letter-spacing: -0.02em` on display headings (800 weight, large size). Use `letter-spacing: 0.04–0.08em` on all-caps micro labels and badge text.

---

## Spacing & Layout

### Core Variables

```css
--radius:    18px;   /* Cards, large panels */
--radius-sm: 12px;   /* Pills, small elements, intro blocks */
--gap:       clamp(18px, 2.4vw, 28px);  /* Grid gap, section spacing */
--w:         min(1240px, 94vw);          /* Max content width */
```

### Section Rhythm

Sections use `padding: clamp(28px, 4vw, 56px) 0`. Alternate sections get `background: #fefaff` via `.section--alt`. Every section title block has `margin-bottom: clamp(1.25rem, 2vw, 2rem)`.

### Card Grid

```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--gap);
}
```

Cards stack to a single column at `520px` and below.

### Breakpoints

| Breakpoint | Behavior |
|---|---|
| `≤ 1000px` | Hero stats grid: 5 → 3 columns |
| `≤ 900px` | TFT two-column layout → single column |
| `≤ 860px` | Intro grid → single column; image moves above text |
| `≤ 820px` | Nav collapses to hamburger |
| `≤ 640px` | Dashboard hero stats → 2 columns; filter row stacks |
| `≤ 520px` | Cards → single column; footer contact → stacked |
| `≤ 400px` | Dashboard hero stats → 1 column |

---

## Component Patterns

### Cards

All cards follow this structure:

```html
<article class="card [card--featured | card--capstone | card--wip]">
  <div class="card__head"><h3>Title</h3></div>
  <p class="card__blurb">Short description.</p>
  <ul class="card__bullets">
    <li><strong>Label:</strong> Detail.</li>
  </ul>
  <div class="card__links">
    <a class="btn btn--sm" href="#">Primary CTA</a>
    <a class="btn btn--sm btn--ghost" href="#">Secondary</a>
  </div>
  <div class="card__meta">
    <span>Tag</span>
  </div>
</article>
```

Cards have a `::before` pseudo-element for the hover gradient border reveal and a `::after` for badges (`Featured`, `Capstone`, `WIP`).

**Card modifier summary:**

| Modifier | Border | Badge |
|---|---|---|
| `card--featured` | Brand→accent gradient | `Featured` (brand gradient) |
| `card--capstone` | Highlight→brand gradient | `Capstone` (teal gradient) |
| `card--wip` | — | `WIP` (orange gradient, top-right) |

### Buttons

```html
<a class="btn">Primary</a>
<a class="btn btn--ghost">Outlined</a>
<a class="btn btn--sm">Small</a>
<a class="btn btn--sm btn--ghost">Small outlined</a>
```

Buttons always have `overflow: hidden` for the ripple effect driven by `site.js`. Never remove this.

### Review Cards (Blog)

```html
<div class="review-card [review-card--pending]">
  <h3 class="review-card__title">Title</h3>
  <p class="review-card__meta">Status / date</p>
  <div class="review-card__section">
    <h4>Section heading</h4>
    <p>Content.</p>
  </div>
  <div class="star-rating">
    <!-- filled stars -->
    <span class="star-rating__star star-rating__star--filled">★</span>
    <!-- empty stars -->
    <span class="star-rating__star">★</span>
    <span class="rating-badge">4 / 5</span>
  </div>
</div>
```

Pending (in-progress) cards use `review-card--pending` which applies dashed borders, reduced opacity, and removes the gradient top stripe.

### Game / Show List Items

```html
<ul class="game-list">
  <li class="game-list__item game-list__item--done">
    <span class="game-list__icon">✓</span>
    <span>Title</span>
    <span class="game-list__status">Finished</span>
  </li>
  <li class="game-list__item game-list__item--pending">
    <span class="game-list__icon"></span>
    <span>Title</span>
    <span class="game-list__status">To play</span>
  </li>
</ul>
```

`--done` items get a `--highlight` left border. `--pending` items use a muted, lower-opacity border.

### Scroll Reveal

Every meaningful section element should carry `data-reveal`:

```html
<div data-reveal>...</div>           <!-- fade up (default) -->
<div data-reveal="left">...</div>    <!-- slide from left -->
<div data-reveal="right">...</div>   <!-- slide from right -->
<div data-reveal="fade">...</div>    <!-- fade only, no translation -->
```

`site.js` uses `IntersectionObserver` and staggers delays via `--reveal-delay`. Elements animate in only once. Respects `prefers-reduced-motion`.

### WIP Notice (Post Pages)

```html
<span class="wip-notice">Work in Progress — more entries coming</span>
```

Place immediately after the back link, before the post header. Never use the `WIP` card badge on individual post pages — use `wip-notice` instead.

---

## Naming Conventions

The codebase uses **BEM-lite**: a block class with double-underscore element modifiers and double-dash state modifiers.

```
.block
.block__element
.block__element--modifier
.block--modifier
```

Examples: `.game-list__item--done`, `.stat-card--streak`, `.review-card--pending`, `.btn--ghost`, `.btn--sm`.

**Page-scoped styles** go in the page's own CSS file (e.g., `blog.css`, `dashboard.css`). Never add page-specific rules to `styles.css`. Shared patterns only live in `styles.css`.

---

## Page Templates

### Standard Page Shell

Every page must include, in order:

1. `<link rel="stylesheet" href="[path]/styles.css" />` — always first
2. Page-specific CSS — only if needed
3. `<script src="[path]/site.js" defer></script>` — always last before `</body>`

The header, nav, and footer HTML are identical across all pages — keep them in sync manually. The only differences are `aria-current="page"` on the active nav link and the relative path depth for `href` attributes.

### Blog Post Page Checklist

- Back link: `<a href="../index.html" class="blog-back-link">← Back to Blog</a>`
- WIP notice (if applicable): `<span class="wip-notice">...</span>`
- Post header with `h2#post-heading`, `.blog-date`, `.blog-tags`
- Intro block: `<div class="blog-intro">`
- Tracker list: `<ul class="game-list">` with `--done` / `--pending` items
- Review cards in completion order, pending cards at the bottom with `review-card--pending`

---

## Do's and Don'ts

**Colors**
- ✅ Always reference `var(--brand)`, `var(--accent)`, etc.
- ❌ Never hardcode `#6c63ff` or any palette hex in component CSS.
- ❌ Never redefine `:root` tokens in sub-page stylesheets.

**Shadows**
- ✅ Use `--shadow` on resting cards, `--shadow-lg` on hover.
- ❌ Don't stack both on the same state.

**Typography**
- ✅ Use `clamp()` for responsive heading sizes.
- ✅ Use `font-weight: 800` for display headings, `700` for subheadings, `600` for labels.
- ❌ Don't use weights outside `400`, `600`, `700`, `800` — they aren't loaded from Google Fonts.

**Spacing**
- ✅ Use `var(--gap)` for grid gaps; use `var(--radius)` and `var(--radius-sm)` for border radii.
- ❌ Don't introduce one-off border-radius values like `8px` or `6px` outside of SVG chart elements.

**Animations**
- ✅ Always pair motion with `@media (prefers-reduced-motion: reduce)` fallbacks.
- ✅ Use `var(--ease-out)` (`cubic-bezier(.22, .61, .36, 1)`) for all transitions.
- ❌ Don't add `transition: all` — be explicit about properties.

**Components**
- ✅ New blog entries follow the review card + game list pattern in `blog.css`.
- ✅ New projects follow the card structure with `card__head`, `card__blurb`, `card__bullets`, `card__links`, `card__meta`.
- ❌ Don't create one-off inline styles for layout — add a class and document it here.

---

*Last updated: April 2026*