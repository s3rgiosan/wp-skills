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
<div data-wp-interactive="mytheme">
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
    active: 0,
    get isActive() {
      return getContext().index === store('mytheme').state.active;
    },
  },
  actions: {
    select() { store('mytheme').state.active = getContext().index; },
  },
});
```

The shared `active` index lives in global `state`, not per-block `context` — each tab/panel has its own context chain off the ancestor, so a value written into shared context only shadows one branch and siblings never see the update. Only `index` stays in local context. Keep `aria-selected`, `role`, and keyboard handling (`data-wp-on--keydown`) for accessibility.

## Carousel / slider

- Context holds `current` index and slide count. `data-wp-bind--hidden` (or a transform-based track) shows the active slide.
- Prev/next actions mutate `current` with wrap-around.
- Add `data-wp-on--keydown` for arrow keys and respect `prefers-reduced-motion` before any autoplay.
- If the project already ships a vetted slider block, prefer it over a bespoke build.

## Modal / dialog / mobile menu

- Context `open`; toggle actions on trigger and close controls.
- `data-wp-bind--hidden`/class binding for visibility; trap focus and close on `Escape` (`data-wp-on--keydown`).
- Mobile nav: prefer `core/navigation` (built-in responsive behavior) before a custom build.

## Cross-region state (control here, target elsewhere)

A control in one block driving a target in another (a header-search toggle in the utility bar opening a panel below the main nav; a mega-menu; a drawer) does **not** require nesting the two. The Interactivity store is global **per namespace**: give both the control and the target the same `data-wp-interactive="mytheme"` and bind them to the same `state`, wherever each sits in the DOM.

```html
<!-- toggle, in one block/region -->
<button data-wp-interactive="mytheme" data-wp-on--click="actions.toggleSearch">Search</button>

<!-- panel, in a different block/region -->
<div data-wp-interactive="mytheme" data-wp-bind--hidden="!state.searchOpen"> … </div>
```

```js
const { state } = store('mytheme', {
  state: { searchOpen: false },
  actions: { toggleSearch() { state.searchOpen = !state.searchOpen; } },
});
```

Use global `state` (not per-block `context`) for anything two regions share.

## Accessibility checklist

- Correct ARIA (`aria-expanded`, `aria-selected`, `aria-controls`, `role`) bound to state.
- Keyboard operable (Enter/Space/arrows/Escape as appropriate).
- Correct initial server-rendered state (no flash, works without JS where feasible).
- Honor `prefers-reduced-motion` for any animation/autoplay.
