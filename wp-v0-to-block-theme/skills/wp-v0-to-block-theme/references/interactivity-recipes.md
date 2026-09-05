# Rebuilding v0 interactivity with the Interactivity API

v0 interactive widgets (React state) become server-rendered markup + `data-wp-*` directives + a store. The markup renders complete on the server; the API hydrates behavior. This keeps the block-editor preview faithful and avoids shipping a React runtime.

For depth, delegate to the **wp-interactivity-api** skill when installed. This file is the quick recipe set for the common v0 widgets.

## Setup (once per theme)

- Build interactive view scripts as **script modules** with `@wordpress/scripts`.
- Register the module and mark the block/pattern interactive with `data-wp-interactive="mytheme"` on the wrapper.
- Server-render the full markup (all panels present, correct initial `hidden`/`aria` state) so no-JS and first paint are correct.

## Accordion (single-open)

```html
<div data-wp-interactive="mytheme" data-wp-context='{"open":false}'>
  <button
    data-wp-on--click="actions.toggle"
    data-wp-bind--aria-expanded="context.open">
    Question
  </button>
  <div data-wp-bind--hidden="!context.open">
    Answer
  </div>
</div>
```

```js
import { store, getContext } from '@wordpress/interactivity';
store('mytheme', {
  actions: {
    toggle() { getContext().open = !getContext().open; },
  },
});
```

Simple, static accordions with no animation can use **`core/details`** instead — no JS at all.

## Tabs

```html
<div data-wp-interactive="mytheme" data-wp-context='{"active":0}'>
  <div role="tablist">
    <button role="tab"
      data-wp-on--click="actions.select"
      data-wp-bind--aria-selected="state.isActive"
      data-wp-context='{"index":0}'>Tab 1</button>
    <!-- more tabs, each with its own index context -->
  </div>
  <div role="tabpanel" data-wp-bind--hidden="!state.isActive" data-wp-context='{"index":0}'>Panel 1</div>
</div>
```

```js
store('mytheme', {
  state: {
    get isActive() {
      const ctx = getContext();
      return ctx.index === ctx.active; // read parent active via nested context
    },
  },
  actions: {
    select() { getContext().active = getContext().index; },
  },
});
```

Adjust context nesting so panels read the parent's `active`. Keep `aria-selected`, `role`, and keyboard handling (`data-wp-on--keydown`) for accessibility.

## Carousel / slider

- Context holds `current` index and slide count. `data-wp-bind--hidden` (or a transform-based track) shows the active slide.
- Prev/next actions mutate `current` with wrap-around.
- Add `data-wp-on--keydown` for arrow keys and respect `prefers-reduced-motion` before any autoplay.
- If the project already ships a vetted slider block, prefer it over a bespoke build.

## Modal / dialog / mobile menu

- Context `open`; toggle actions on trigger and close controls.
- `data-wp-bind--hidden`/class binding for visibility; trap focus and close on `Escape` (`data-wp-on--keydown`).
- Mobile nav: prefer `core/navigation` (built-in responsive behavior) before a custom build.

## Accessibility checklist

- Correct ARIA (`aria-expanded`, `aria-selected`, `aria-controls`, `role`) bound to state.
- Keyboard operable (Enter/Space/arrows/Escape as appropriate).
- Correct initial server-rendered state (no flash, works without JS where feasible).
- Honor `prefers-reduced-motion` for any animation/autoplay.
