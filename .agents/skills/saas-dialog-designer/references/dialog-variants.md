# Dialog Variants — Implementation Notes

## 1. Input + Result (Hybrid) Dialog
*Used by: JD Tailor, Keyword Match, Inject Keywords, Inject Skills, ATS Score*

The most common pattern. Fixed-top holds the form; scrollable body holds the AI result.

**Fixed-top budget checklist:**
- Header row (icon + title + badge): ~56px
- Optional warning banner: ~52px
- Form card or textarea: 130–220px (bounded)
- CTA row: ~44px
- Gaps (space-y-4): ~16px × 3 = 48px
- Padding (pt-6 pb-5): ~44px
- **Total: ~430px max** — well within 88vh on a 900px screen

**Scrollable body content:**
- Empty state (dashed border card)
- Score ring + summary card
- Section breakdown bars
- Keyword grids (two-column, present/missing)
- Strengths/weaknesses (two-column)
- Suggestion list (numbered)
- Action row (Fix with X / Inject Keywords / Done)

## 2. Form-Only Dialog
*Used by: Full Resume Rewrite*

Fixed-top has all form content. Scrollable body shows an empty/info state when idle, success confirmation after completion.

**Pattern:**
```
Fixed top:   header + inputs (role/company/seniority) + CTA + done banner
Scroll body: empty state illustration OR post-rewrite summary of changed sections
```

**Key rule:** The done/success state should move to the scrollable body (not stay in fixed-top) if it has significant content. A one-line success confirmation can stay in fixed-top.

## 3. Analysis-Only Dialog
*Used by: ATS Score*

Closest to a dashboard panel inside a dialog. The fixed-top is compact (header + score ring + scan button). The scrollable body is content-heavy (section scores, strengths, weaknesses, missing keywords, suggestions).

**Score ring sizing:** Keep the SVG at 80×80. Larger rings push the fixed-top past budget.

**Section score bars:** Use `divide-y divide-border` rows, not cards per row. Keeps the list compact and scannable.

## 4. Confirm Dialog
*Used by: destructive actions, credit-consuming actions with no preview*

Narrow width (`max-w-lg`). No scrollable body needed. Single fixed zone with:
- Icon + title
- Description + credit cost
- CTA row (Cancel | Confirm)

Do NOT use the three-zone shell for confirm dialogs — they are too simple. Use plain `DialogContent` with `p-6` and shadcn's `DialogHeader`/`DialogFooter`.

## 5. Preview Dialog
*Used by: Cover Letter, generated document preview*

Wide (`max-w-[840px]`). Fixed-top: header + metadata. Scrollable body: full generated text in a `font-serif` or `font-mono` prose container with `whitespace-pre-wrap`.

**Copy/download actions:** Use a sticky footer (`shrink-0 border-t px-8 py-4 bg-background flex items-center justify-end gap-3`) instead of putting actions at the bottom of the scrollable body — they will scroll out of view for long documents.

```
div.flex.flex-col.h-[88vh].overflow-hidden.rounded-xl
├── div.shrink-0  [HEADER]
├── div.flex-1.min-h-0.overflow-y-auto  [DOCUMENT TEXT]
└── div.shrink-0.border-t  [STICKY FOOTER WITH COPY/DOWNLOAD]
```
