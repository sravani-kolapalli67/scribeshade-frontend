# Radix / shadcn Dialog — Known Gotchas

## 1. `overflow-hidden` on `DialogContent` clips inner scroll zones

**Problem:** shadcn's `DialogContent` uses Radix's `DialogPrimitive.Content`, which is `position: fixed`. If you add `overflow-hidden` to the `DialogContent` className, it becomes the scroll ancestor for its children — but because its height is governed by Radix's `fixed` positioning (not by CSS height), the clipping happens before `overflow-y-auto` on an inner child can activate.

**Symptom:** Scrollable body appears to have the right classes but never actually scrolls. Content is just clipped.

**Fix:** Put `overflow-hidden` on an inner `div` wrapper that has a concrete height:

```tsx
// ❌ Wrong
<DialogContent className="overflow-hidden flex flex-col max-h-[88vh]">
  <div className="flex-1 overflow-y-auto">  {/* never scrolls */}

// ✅ Correct
<DialogContent className="p-0 gap-0">
  <div className="flex flex-col h-[88vh] overflow-hidden rounded-xl">
    <div className="shrink-0">...</div>
    <div className="flex-1 min-h-0 overflow-y-auto">...</div>  {/* scrolls ✓ */}
  </div>
</DialogContent>
```

## 2. `max-h` does not give flex children a reference height

**Problem:** `max-height: 88vh` is a clamp. CSS flex sizing resolves `flex: 1` against the parent's computed `height` property. If `height` is `auto` (the default), `flex-1` children get `height: auto` and `overflow-y-auto` never has a concrete container to overflow against.

**Symptom:** Dialog grows taller than the viewport instead of scrolling.

**Fix:** Use `h-[88vh]` (sets `height: 88vh`) not `max-h-[88vh]` on the flex container.

```tsx
// ❌ max-h only — flex-1 children can't resolve their height
<div className="flex flex-col max-h-[88vh]">

// ✅ concrete height — flex-1 has a reference to size against
<div className="flex flex-col h-[88vh]">
```

## 3. `min-h-0` is required on flex scroll children

**Problem:** Flex items default to `min-height: auto`, which means they will expand to fit their content rather than shrink to allow `overflow-y-auto` to activate.

**Symptom:** The scrollable body expands to show all content, pushing the dialog beyond `h-[88vh]`.

**Fix:** Always add `min-h-0` alongside `flex-1 overflow-y-auto`:

```tsx
<div className="flex-1 min-h-0 overflow-y-auto">
```

## 4. shadcn `DialogContent` base class is `grid`, not `flex`

shadcn's default `DialogContent` applies `grid` as a base class. If you try to add `flex flex-col` via `cn()`, `tailwind-merge` resolves the conflict correctly (last write wins), so `flex` will override `grid`. However, relying on this is fragile if the shadcn version changes.

**Safer pattern:** Never put flex layout on `DialogContent`. Instead, wrap children in an inner div with the flex layout. This is also why `overflow-hidden` works better on the inner div.

## 5. The close button `X` from shadcn

shadcn's `DialogContent` renders a close button at `absolute top-2 right-2` by default. Because the inner wrapper has `overflow-hidden rounded-xl`, the absolute-positioned close button (which is a direct child of `DialogPrimitive.Content`, not the inner wrapper) will render correctly above the rounded corners.

If the close button appears clipped, it means `overflow-hidden` has been applied to `DialogContent` rather than the inner wrapper — move it.

## 6. Radix dialog animation and `transform`

Radix applies `data-open:animate-in data-open:zoom-in-95` etc. via CSS data attributes. These use CSS transforms. If the dialog content uses `position: sticky` internally (e.g., a sticky header inside the scroll body), the transform on the outer element creates a new stacking context that breaks `position: sticky`.

**Fix:** Do not use `position: sticky` inside dialogs. Use the fixed-top / scrollable-body flex pattern instead — it achieves the same result without stacking context issues.

## 7. `p-4` default padding on `DialogContent`

shadcn's default `DialogContent` has `p-4`. Always override this with `p-0` when using the three-zone shell pattern, otherwise padding will gap between the `DialogPrimitive.Content` boundary and the inner `overflow-hidden` wrapper, leaving a visible gap.

```tsx
<DialogContent className="p-0 gap-0 ...">
```
