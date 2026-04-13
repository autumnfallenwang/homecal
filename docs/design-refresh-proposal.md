# HomeCal Web — Design Refresh Proposal

**Status**: Draft for review — not yet planned or scheduled.
**Scope**: `apps/web` only (iOS app tracked separately).
**Goal**: Move HomeCal from "functional shadcn default" to a distinctive, modern family calendar that feels calm, legible, and a little bit joyful — without losing the density a real family schedule needs.

---

## 1. Current state (one-paragraph summary)

HomeCal already runs on a strong foundation: Tailwind v4, shadcn/ui (new-york), OKLch color tokens, full dark mode, Month/Week/Day views, a quick-add popover with voice + image OCR + iCal import, and member filtering. But the visual language is the shadcn default — system fonts, neutral grays, 1px borders, `shadow-xs`, tight pills. The header is crowded on narrow screens, the month grid is cramped (`min-h-24`, max 3 pills per day), event pills lack hierarchy, and there's no visible "today" anchor. It reads as "a calendar built with shadcn" rather than "HomeCal."

See `apps/web/src/app/globals.css` for tokens and `apps/web/src/components/calendar/*` for the views referenced below.

---

## 2. Aesthetic direction (pick one before we plan)

I want us to commit to ONE of these before turning this into tasks. Each is internally consistent; mixing them will produce slop.

### Option A — **"Warm Editorial"** (recommended)
Think *Kinfolk* meets Fantastical. A serif display face for dates and headings, a clean humanist sans for body, cream/paper background in light mode, deep ink in dark mode, one warm accent (terracotta or ochre). Generous whitespace. Subtle paper grain texture. Members are distinguished by tinted *backgrounds* on their events rather than colored dots — the calendar becomes a collage.

- **Why it fits**: HomeCal is a *home* calendar — domestic, personal, lived-in. Editorial warmth signals "this is your family's space," not "enterprise SaaS."
- **Typography**: `Fraunces` (variable serif, optical sizing) for display + `Inter Tight` or `Geist` for UI. Tabular numerals for times.
- **Color (light)**: bg `oklch(0.98 0.01 80)` (warm paper), fg `oklch(0.2 0.02 40)` (ink), accent `oklch(0.62 0.15 45)` (terracotta).
- **Color (dark)**: bg `oklch(0.16 0.01 60)` (deep walnut), fg `oklch(0.94 0.01 80)`, accent brightens to `oklch(0.72 0.17 55)`.
- **Texture**: subtle SVG noise overlay (5% opacity) on the app background only.
- **Motion**: slow, confident — 400ms ease-out for view transitions, staggered fade-in on day cells (30ms stagger across the grid).

### Option B — **"Brutalist Utility"**
Mono display face (JetBrains Mono or Departure Mono), hairline 1px grid lines everywhere, no rounded corners, black/white with a single electric accent (lime `oklch(0.88 0.25 130)` or hot pink). Dense, dashboard-like. Times are huge. Empty space is not decorated.

- **Why it fits**: families who want information, not decoration. Feels like a Swiss train schedule.
- **Risk**: can feel cold for a home app — mitigated by warmth in microcopy and hover states.

### Option C — **"Soft Modernist"**
Pastel gradients (not purple), rounded `2xl` corners, large type, airy. Similar to Linear's warmer cousin. One soft gradient background per member color.

- **Why it fits**: safest of the three; high broad appeal; least distinctive.

**My recommendation: A (Warm Editorial).** B is more striking but may alienate non-designer family members. C is pleasant but you'll see it in 200 other apps. Confirm or redirect before we plan.

---

## 3. Concrete problems + proposed fixes

Grouped by surface. Every item cites the file so we can turn them into tasks cleanly.

### 3.1 Typography & tokens (`globals.css`)
- **Problem**: no `next/font` import; falls back to system UI fonts. This is the single biggest reason the app "looks AI-generated."
- **Fix**: load `Fraunces` + `Inter Tight` via `next/font/google` in `app/layout.tsx`, expose as `--font-display` / `--font-sans` CSS vars, apply `font-feature-settings: "tnum","ss01"` globally so time columns align.
- **Token additions**: `--radius-event: 6px`, `--shadow-card: 0 1px 0 rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.12)`, `--grain-url: url(/textures/grain.svg)`.

### 3.2 Header (`calendar-header.tsx`)
- **Problem**: logo + view toggle + prev/next + title + quick-add + user name + 4 icon buttons all on one row. Collapses ugly on narrow screens.
- **Fix**: split into two rows.
  - **Row 1 (brand row)**: logo left, user avatar + menu right. Menu consolidates settings/admin/export/logout behind one click (shadcn `DropdownMenu`).
  - **Row 2 (calendar toolbar)**: left-aligned title in the display serif (e.g., "April 2026" at 28px), right-aligned segmented view toggle + prev/Today/next. Add the missing **Today** button.
- **Motion**: title crossfades + slides 8px when the month changes.

### 3.3 Month grid (`month-grid.tsx`, `day-cell.tsx`)
- **Problem**: `min-h-24` is too short on desktop, cells are cramped, max 3 pills with a terse "+N" overflow, "today" isn't visually anchored.
- **Fix**:
  - Responsive cell height: `min-h-28 md:min-h-32 xl:min-h-40`.
  - **Today cell**: thick left accent bar in the accent color (not a full background fill — fills fight with event colors).
  - **Weekend columns**: 1-step warmer background tint (editorial option) or hairline top border (brutalist option).
  - **Out-of-month days**: 50% opacity, not hidden — preserves grid rhythm.
  - **Date numeral**: display serif, 16px, top-right, tabular. Today's numeral is the accent color + bold.
  - **Overflow pill**: replace "+N more" with a subtle chip `"+3"` that opens a Popover listing the hidden events with full detail — no dialog hop.

### 3.4 Event pills (`event-pill.tsx`, `week-event-block.tsx`)
- **Problem**: pills use `20% opacity` of assignee color on a neutral background, which produces muddy low-contrast pastels that fail WCAG in dark mode and wash out in light mode. Recurring events only get a "↻" glyph.
- **Fix**:
  - Two-tone system: solid 12% tint background + 100% saturation 2px left border in the assignee color. Guarantees contrast and gives multi-assignee events a clear stacked-border look.
  - **Hierarchy**: all-day events span full width at the top of the cell with a different shape (pill → flag). Timed events are rectangles with a small time prefix (`7:30a Swim`). Private events use a lock glyph + desaturated fill.
  - **Recurring**: tiny dotted underline on the title (cheaper than the ↻ glyph and survives truncation).
  - **Hover**: 1px outline in fg color + scale(1.01) + reveal full title if truncated.

### 3.5 Week/Day views (`week-grid.tsx`, `day-grid.tsx`)
- **Problem**: time gutter is fixed 60px; overlapping events use a column algorithm but lack visual separation between columns.
- **Fix**:
  - Time gutter labels in display serif, right-aligned, `--font-feature-settings: "tnum"`, `6:00` → `6` (strip `:00` to reduce noise — a Fantastical move).
  - Current-time line: 1px accent-colored line spanning the day, with a small filled circle in the gutter. Pulses subtly (2s).
  - Overlap columns: add a 1px inner shadow on each event block so stacked events read as cards, not a blob.
  - Scroll target: snap to `7am` on mount is fine, but also scroll to current time on "today."

### 3.6 Quick-add popover (`quick-add-popover.tsx`)
- **Problem**: works well mechanically; visually it's a plain list of `Button` rows with no affordance for the "smart" nature of the input.
- **Fix**:
  - Lead with a single large input: *"What's happening?"* in the display serif as placeholder. Enter submits to the parser.
  - Input mode row beneath: four circular icon buttons (type/voice/image/ics) with a subtle active state.
  - Voice: animate a 3-bar equalizer from the mic when recording (replaces the `MicOff` pulse).
  - Loading: skeleton of the prefilled event card appears inside the popover *before* the dialog opens — feels instant even when parsing takes 2s.

### 3.7 Member filter sidebar (`member-filter.tsx`)
- **Problem**: hidden under `lg`, which kills discoverability on tablets. Dots are tiny.
- **Fix**:
  - On `<lg`, collapse into a horizontal chip row above the grid — still visible, still tappable.
  - Replace colored dots with *avatar initials* in the member's color (circle, 24px, display serif). Checked = full color, unchecked = 1px outlined empty circle.
  - Add a "Only me" / "Everyone" quick toggle pair at the top.

### 3.8 Event dialog (`event-dialog.tsx`)
- **Problem**: long scrolling form, dense.
- **Fix**:
  - Two-column layout on `md+`: left = title/time/location/assignees, right = notes/reminders/recurrence/privacy. On mobile, collapses to one column.
  - Title input uses the display serif at 24px — it's the one field users care about, so let it feel important.
  - Assignee multi-select becomes a row of avatar chips (same component as sidebar) — tap to toggle.
  - Reminder presets become a segmented control, not a dropdown.
  - Save button is sticky to the bottom of the dialog on mobile.

### 3.9 Loading & empty states
- **Problem**: skeletons are sparse; empty calendar cells look identical to loading cells.
- **Fix**:
  - Grid skeleton matches the real grid (42 cells with shimmering date numerals).
  - Empty day on hover: faint "+" appears centered — affordance for click-to-create.
  - First-run empty calendar shows a single illustration (hand-drawn line art of a kitchen calendar) with "Add your first event" CTA.

### 3.10 Accessibility & polish
- Focus rings: keep the 3px ring but switch to the accent color so keyboard nav is visible on both themes.
- Reduced motion: wrap all staggered animations in `@media (prefers-reduced-motion: no-preference)`.
- Tabular numerals everywhere a time or date appears.
- Ensure 4.5:1 contrast on event pills in *both* themes — current 20% opacity fills fail this.

---

## 4. What I'm intentionally NOT proposing
- No framework change — Tailwind v4 + shadcn stays.
- No new dependencies beyond `next/font` (already available) and optionally `motion` for React transitions.
- No change to the data model, API, or keyboard shortcuts.
- No redesign of `/admin` in this pass — it's internal, low traffic; batch it later.
- No mobile-specific nav bar (bottom tabs) — the iOS app covers that case.

---

## 5. Open questions for the review

1. **Aesthetic direction**: A, B, or C? (I recommend A.)
2. **Font licensing**: Fraunces + Inter Tight are both OFL / free via Google Fonts — OK to pull at runtime, or prefer self-hosted?
3. **Scope of the first pass**: ship everything in §3 as one big refresh, or split into (a) tokens + header + month grid first, (b) week/day + pills second, (c) popover + dialog polish third?
4. **Dark mode default**: currently light-first. Warm Editorial dark mode is where this design shines — should we default new users to dark?
5. **Illustration budget**: §3.9 empty state needs one piece of custom line art. Commission, generate, or skip?
6. **"Today" button placement**: between prev/next (Fantastical) or separate (Google Calendar)?

---

## 6. Next steps

1. Review this doc, pick an aesthetic, answer the open questions.
2. I turn the accepted items into a phased plan in `docs/design-plan.md` and tasks in `docs/progress.md`.
3. Implement phase-by-phase with browser verification after each phase (per CLAUDE.md).

---

## 7. Addendum — "Today" view (decided)

A new glance-first surface distinct from the existing editing "Day" view. Its job: a calm, readable snapshot of what's happening *right now* and *next*. Think kitchen tablet, morning coffee, partner checking partner's day. Read-optimized, not input-optimized.

### 7.1 Layout — "Morning Paper"
Editorial two-column spread, full-bleed hero at the top.

- **Hero header**: `Sunday` in Fraunces italic 32px, `April 12` in Fraunces display at ~128px on desktop (`clamp(72px, 11vw, 144px)`), tiny terracotta "today" tag. Subline below in Fraunces italic: *"five events · first at 10:00a"*.
- **Left column (≈60%)** — **vertical timeline**:
  - Fraunces italic time markers in a narrow gutter (hours visible in the event range only — not a 24h wall of labels).
  - Each event is a card: assignee avatar chip row, title in Inter Tight 18px, time range in tabular numerals, location if set.
  - **Past events**: 50% opacity, no accent border.
  - **Current event**: filled card with 2px terracotta border + a pulsing **NOW** pill (animation respects `prefers-reduced-motion`).
  - **Future events**: standard warm editorial card, left-border in assignee color.
  - **Current-time line**: 1px terracotta across the timeline at `serverNow`.
  - **"Earlier today (N)" collapsed row**: events that ended >2h ago auto-collapse into an expandable chevron row at the top so by evening the page isn't drowning in stale items.
- **Right column (≈40%)** — **glance rail**:
  - **"Next up"** callout card — the single biggest useful thing on the page. Fraunces italic *"Next up"* label + event title + relative time ("in 42 minutes"). Terracotta accent border.
  - **Event count chip**: *"5 events today · 2 for you"*.
  - **Member filter chips**: same avatar-chip component as the month-view member filter. Default = **Just me** on every session load (no sticky memory — it's the right glance 90% of the time). "Everyone" / "Just me" quick toggle pair at the top.
  - **Tomorrow teaser**: a compact row — *"Tomorrow · 4 events · Monterey trip begins"* — tap to jump into the Day view.
  - **Reserved slot** at the bottom of the rail for future weather / chores / waiting-on widgets. Leave the space; don't populate it in v1.
- **Empty state**: no events today → *"Nothing on the books. Enjoy the day."* in Fraunces italic centered in the timeline column, with a small inline SVG sun. Glance rail still shows the Tomorrow teaser so the page isn't dead.

### 7.2 Interactions
- **Tap an event** → read-only detail popover (title, full time, assignees, location, notes). "Edit" button inside opens the existing `EventDialog` for consistency — not a new edit surface.
- **No click-to-create** on the timeline — creation still lives in the header "+ New event" quick-add. Today is a *display* view; mixing in creation muddies the purpose.
- **Member chips** toggle instantly (no save button); state is session-only, resets to **Just me** on each visit.
- **Scroll**: the page fits in one viewport on desktop for typical days; only scrolls when >8 events. Hero header sticks to the top with a compressed form when scrolled.

### 7.3 Placement in the view toggle
Add a fourth segment to the existing `[Day][Week][Month]` toggle → `[Today][Day][Week][Month]`. **Today becomes the default view on calendar load** (replacing Month). Users who prefer Month can still pick it and their choice persists per session via localStorage, but a fresh visit always starts on Today.

### 7.4 Backend
One new endpoint to keep the page fast and avoid client-side timezone logic:

- **`GET /api/events/today?tz=America/Los_Angeles&userIds=a,b,c`** →
  ```json
  {
    "serverNow": "2026-04-12T18:32:10Z",
    "today": [ /* events overlapping the user's local day, filtered by userIds if given */ ],
    "tomorrow": { "count": 4, "firstTitle": "Swim practice", "hasMultiDayStart": true }
  }
  ```
  - `tz` is required so the server can compute the correct local-day window.
  - `userIds` is optional; when present, filters to events where at least one assignee is in the set. When omitted, returns all events visible to the requesting user.
  - `tomorrow.hasMultiDayStart` flags when a multi-day event (like "Monterey trip") begins tomorrow — used to generate a richer teaser string.
  - Reuses the existing visibility rules (private events still hidden from non-assignees).

No schema changes. No other API touches.

### 7.5 Decisions locked
| Question | Decision |
|---|---|
| Layout | Morning Paper (timeline + glance rail) |
| Placement | 4th toggle segment; **default landing view** |
| Member default | **Just me** every session; no sticky memory |
| Past events | Faded, auto-collapse >2h old into "Earlier today" row |
| Tap behavior | Read-only detail popover with "Edit" button → existing dialog |
| Create from Today | No — display surface only; use header quick-add |
| Ambient extras (weather/chores) | Out of v1; reserve rail space only |
| Backend | New `GET /api/events/today` endpoint, no schema changes |
