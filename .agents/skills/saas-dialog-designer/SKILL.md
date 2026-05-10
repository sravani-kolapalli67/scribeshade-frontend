---
name: saas-dialog-designer
description: >
  Premium B2B SaaS dialog and modal redesign skill. Use when: fixing broken dialog scroll, redesigning AI tool modals, making dialog textareas scroll-safe, improving modal layout for desktop productivity, creating sticky header/footer in dialogs, fixing overflow issues in shadcn/ui Dialog, improving form field spacing/hierarchy inside modals, making result panels readable inside dialogs, auditing and fixing dialog UX in React + Tailwind + shadcn/ui. Triggers on: broken dialog, modal scroll, textarea overflow, sticky header, dialog too narrow, cramped form, modal UX, dialog system, scroll-safe modal, shadcn Dialog fix.
argument-hint: 'Describe the dialog problem or paste the current component code'
---

# SaaS Dialog Designer

Senior product designer + senior frontend UI engineer persona. Fixes, redesigns, and implements premium scroll-safe dialog/modal systems for B2B SaaS products using React + TypeScript + Tailwind CSS + shadcn/ui.

## When to Use

- A dialog scrolls as one uncontrolled region instead of having a stable header/footer
- A textarea expands infinitely when the user pastes long content
- A dialog feels narrow, cramped, or mobile-like on desktop
- Form fields inside a modal have weak spacing or poor hierarchy
- Result panels overflow or hide action buttons below a broken scroll
- `overflow-hidden` on `DialogContent` is clipping inner scroll containers
- Need a consistent modal shell across multiple AI tools or features
- Need to audit and fix any React + shadcn/ui modal component

---

## Audit Checklist

Before any fix, audit the current dialog on these axes:

| Axis | Check |
|---|---|
| Width | Is it desktop-appropriate (≥ 640px for forms, ≥ 760px for AI/result dialogs)? |
| Height | Does `max-h` / `h` bound the dialog within the viewport? |
| Scroll zone | Is one concrete zone scrollable, or does the whole thing scroll? |
| Header stability | Does the header/title stay fixed when body scrolls? |
| Footer stability | Do CTA buttons stay reachable without scrolling? |
| Textarea | Does it have both `min-h` AND `max-h` with `overflow-y-auto`? |
| Result panels | Are long result lists bounded and scrollable in their own region? |
| `overflow-hidden` placement | Is it on the inner wrapper, not on `DialogContent` itself? |
| Concrete height | Does the flex parent have `h-[Nvh]` not just `max-h-[Nvh]`? |

---

## Required Output Format

When asked to fix or redesign a dialog, always respond in this order:

1. **UX problems** — What is broken and why it hurts usability
2. **Design goals** — What the fixed version must achieve
3. **Layout strategy** — Component tree and flex roles
4. **Scroll strategy** — Which zone scrolls, which zones are fixed
5. **Spacing and hierarchy decisions** — Padding, gap, typography scale
6. **Component architecture** — Reusable shell + panel pattern
7. **Tailwind/shadcn implementation** — Actual class decisions with reasoning
8. **Final code** — Complete, production-ready React + TypeScript + Tailwind
9. **Why this is better UX** — One-paragraph summary

---

## Core Layout Pattern

Every dialog uses this three-zone shell. Never deviate from this structure:

```
DialogContent  (no flex, no overflow — let Radix position freely)
└── div.flex.flex-col.h-[88vh].overflow-hidden.rounded-xl   ← bounded container
    ├── div.shrink-0  [FIXED TOP]    ← header + inputs + CTA
    │     px-8 pt-6 pb-5 space-y-4 border-b border-border/60
    │     bg-background
    │
    └── div.flex-1.min-h-0.overflow-y-auto  [SCROLLABLE BODY]
          px-8 py-5 space-y-4
          bg-slate-50/60
```

### Critical rules

- `overflow-hidden` must live on the **inner wrapper div**, NOT on `DialogContent`. Placing it on `DialogContent` interferes with Radix's `fixed` positioning and clips the inner scroll zone before it activates.
- `flex-1 overflow-y-auto` only activates when the parent has a **concrete height** (`h-[88vh]`), not just `max-height`. `max-h` is a clamp; it does not give flex children a reference height to size against.
- `min-h-0` on the scrollable body is required. Without it, a flex child defaults to `min-height: auto`, preventing proper shrinking and making `overflow-y-auto` inert.
- The fixed-top zone must be `shrink-0`. Never put dynamic result content inside it.

### Tailwind shell

```tsx
function AiDialogShell({ open, onClose, children }: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[760px] w-full p-0 gap-0">
        <div className="flex flex-col h-[88vh] overflow-hidden rounded-xl">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Panel root (returned by every panel component)

```tsx
<div className="flex flex-col flex-1 min-h-0">

  {/* ── FIXED TOP ── */}
  <div className="shrink-0 bg-background px-8 pt-6 pb-5 space-y-4 border-b border-border/60">
    {/* icon + title + badge */}
    {/* optional warning banner */}
    {/* form inputs / textarea */}
    {/* primary CTA + inline error */}
  </div>

  {/* ── SCROLLABLE BODY ── */}
  <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/60 px-8 py-5 space-y-4">
    {result ? <ResultContent /> : <EmptyState />}
  </div>

</div>
```

---

## Textarea Rules

All textareas in a dialog fixed-top zone MUST have both bounds:

```tsx
<Textarea
  className={cn(
    "border-none rounded-none resize-none text-sm bg-background",
    "focus-visible:ring-0 focus-visible:ring-offset-0",
    "px-5 py-4 placeholder:text-muted-foreground/40 leading-relaxed",
    "min-h-[130px] max-h-[200px] overflow-y-auto"  // ← BOTH required
  )}
/>
```

**Recommended bounds by content type:**

| Panel type | min-h | max-h |
|---|---|---|
| JD input (with form card above) | 130px | 200px |
| JD input (minimal fixed-top) | 150px | 220px |
| Skills / optional JD | 100px | 160px |
| Keyword match / analysis | 140px | 190px |

Never use `resize` (vertical or both) — it breaks the fixed-top budget.

---

## Dialog Width Guidelines

| Dialog type | Width |
|---|---|
| Simple confirm / short form | `max-w-lg` (512px) |
| Standard AI tool (inputs + result) | `max-w-[760px]` |
| JD Tailor / Cover Letter (large text) | `max-w-[840px]` |
| Analytics / split-layout result | `max-w-[900px]` |

---

## Typography Scale

| Role | Tailwind classes |
|---|---|
| Panel title | `text-lg font-bold tracking-tight` |
| Section label | `text-xs font-bold uppercase tracking-widest text-muted-foreground` |
| Body / helper | `text-sm text-muted-foreground leading-relaxed` |
| Meta / timestamp | `text-[11px] text-muted-foreground` |
| Chip / tag | `text-[11px] font-medium` |
| Score / metric | `text-2xl font-black tabular-nums` |

---

## Credit Badge Pattern

Always lowercase. Always consistent:

```tsx
// Free tool
<span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide border
  bg-emerald-100 text-emerald-700 border-emerald-200/60">
  Free
</span>

// Paid tool
<span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide border
  bg-violet-100 text-violet-700 border-violet-200/60">
  {cost} credits
</span>
```

---

## Empty State Pattern

Use for the scrollable body when no result exists yet:

```tsx
<div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
  <div className="mx-auto h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
    <Icon className="h-4 w-4 text-slate-400" />
  </div>
  <p className="text-[13px] font-semibold text-slate-700">Descriptive title</p>
  <p className="text-[11.5px] text-slate-500 mt-1.5 leading-relaxed max-w-sm mx-auto">
    What the user should do next
  </p>
</div>
```

---

## Color System per Tool

| Tool | Accent | Icon bg | Badge bg |
|---|---|---|---|
| ATS Score | emerald | `bg-emerald-100` | `bg-emerald-100 text-emerald-700` |
| JD Tailor | violet | `bg-violet-100` | `bg-violet-100 text-violet-700` |
| Full Rewrite | violet | `bg-violet-100` | `bg-violet-100 text-violet-700` |
| Inject Skills | emerald | `bg-emerald-100` | `bg-emerald-100 text-emerald-700` |
| Inject Keywords | amber | `bg-amber-100` | `bg-amber-100 text-amber-700` |
| Keyword Match | blue | `bg-blue-100` | `bg-blue-100 text-blue-700` |
| Cover Letter | indigo | `bg-indigo-100` | `bg-indigo-100 text-indigo-700` |
| Enhance Section | slate | `bg-slate-100` | `bg-slate-100 text-slate-700` |

---

## Interaction States

| State | Treatment |
|---|---|
| Default | Full opacity, CTA enabled/disabled by validation |
| Loading | Spinner in CTA label + label changes to "Running…". Scrollable body shows skeleton rows. Fixed top remains interactive. |
| Success | Green banner in fixed-top OR results card in scrollable body. CTA may change to "Regenerate". |
| Error | Red inline row under CTA with `AlertTriangle` icon. No toast reset needed — user can retry immediately. |
| Insufficient credits | Specific message: "Need N credits. Top up to continue." Optionally link to billing. |
| Invalid input | CTA disabled + red border on field + `text-[11px] text-destructive` hint. No toast. |
| Stale result | Amber dot or text next to last-checked timestamp. |

---

## Anti-Patterns (Never Do)

```tsx
// ❌ overflow-hidden on DialogContent — clips Radix positioning
<DialogContent className="overflow-hidden flex flex-col max-h-[88vh]">

// ❌ max-h only — flex children can't compute height from a clamp
<div className="flex flex-col max-h-[88vh]">
  <div className="flex-1 overflow-y-auto">  {/* never activates */}

// ❌ result content inside shrink-0 — fixed top grows with results
<div className="shrink-0">
  <Textarea />
  <Button />
  {result && <ResultCard />}  {/* breaks fixed zone */}
</div>

// ❌ textarea without max-h — explodes on long paste
<Textarea className="min-h-[200px] resize-none" />

// ❌ missing min-h-0 — flex child won't shrink
<div className="flex-1 overflow-y-auto">  {/* needs min-h-0 */}
```

---

## Reference Files

- [./references/dialog-variants.md](./references/dialog-variants.md) — Per-dialog-type implementation notes
- [./references/radix-pitfalls.md](./references/radix-pitfalls.md) — Radix/shadcn Dialog known gotchas
