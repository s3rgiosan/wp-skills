# Rebuilding v0 interactivity with the Interactivity API

v0 interactive widgets (React state) become server-rendered markup + `data-wp-*` directives + a store. The markup renders complete on the server; the API hydrates behavior. This keeps the block-editor preview faithful and avoids shipping a React runtime.

For depth, delegate to the **wp-interactivity-api** skill when installed. This file is the quick recipe set for the common v0 widgets. The inline `data-wp-context='{…}'` string shown in the recipes below is the client-only shorthand; when the initial value comes from the server, prefer `wp_interactivity_data_wp_context()` instead (see Setup).

## Setup (once per theme)

- Build interactive view scripts as **script modules** with `@wordpress/scripts`.
- These recipes are pattern-scoped PHP files with no `block.json`, so the `viewScriptModule` field doesn't apply. Register and enqueue the module by hand with `wp_register_script_module()` + `wp_enqueue_script_module()`, hooked so it loads where the pattern renders:

  ```php
  add_action( 'wp_enqueue_scripts', function () {
      wp_register_script_module(
          'mytheme/accordion',
          get_theme_file_uri( 'assets/js/accordion.js' ),
          array( '@wordpress/interactivity' ),
          wp_get_theme()->get( 'Version' )
      );
      wp_enqueue_script_module( 'mytheme/accordion' );
  } );
  ```

- Mark the block/pattern interactive with `data-wp-interactive="mytheme"` on the wrapper.
- Server-render the full markup (all panels present, correct initial `hidden`/`aria` state) so no-JS and first paint are correct.
- Seed server-rendered initial values from PHP rather than hard-coding them as `data-wp-context` JSON strings: `wp_interactivity_state( 'mytheme', [...] )` for shared state, and `wp_interactivity_data_wp_context( [...] )` to emit the `data-wp-context` attribute from pattern PHP:

  ```php
  <?php wp_interactivity_state( 'mytheme', array( 'active' => 0 ) ); ?>
  <div
    data-wp-interactive="mytheme"
    <?php echo wp_interactivity_data_wp_context( array( 'open' => false ) ); ?>
  >
  ```

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

## Repeated items (data-wp-each)

The tabs and carousel recipes above hand-duplicate markup per item. A list actually driven by state or context (search results, a repeated card row) should use `data-wp-each` on a `<template>` instead:

```html
<ul
  data-wp-interactive="mytheme"
  data-wp-context='{"items":[{"id":1,"label":"One"},{"id":2,"label":"Two"}]}'
>
  <template data-wp-each--item="context.items" data-wp-each-key="context.item.id">
    <li data-wp-text="context.item.label"></li>
  </template>
  <!-- Server-rendered copies, marked for hydration -->
  <li data-wp-each-child>One</li>
  <li data-wp-each-child>Two</li>
</ul>
```

- `data-wp-each` only iterates when placed on a `<template>` element.
- The item variable defaults to `context.item`; naming the directive `data-wp-each--<name>` (e.g. `data-wp-each--item`) exposes it as `context.<name>` instead — useful when one `data-wp-each` nests inside another.
- `data-wp-each-key`, on the same `<template>`, names the per-item identity (a property path such as `context.item.id`) so re-renders reconcile items instead of re-mounting all of them.
- For the server-rendered, no-JS-correct markup, emit the real `<li>` elements once per item outside the `<template>`, each marked `data-wp-each-child` — that's what the Interactivity API hydrates against on first load.

## Directive quick-reference

Directives used above, plus others the recipes don't otherwise reach for:

- `data-wp-class--<name>` — toggle a CSS class based on a boolean expression.
- `data-wp-style--<property>` — set an inline style property from an expression.
- `data-wp-on-window--<event>` / `data-wp-on-document--<event>` — attach an event listener to `window`/`document` instead of the element, removed automatically when the element unmounts.
- `data-wp-watch` — run a callback on init and again whenever a value it reads changes; for effects and imperative DOM updates no other directive covers.
- `data-wp-init` — run a callback once when the element is created; it can return a cleanup function to run on removal.
- `data-wp-run` — run a callback during the element's render execution, with access to hooks like `useState`/`useEffect` for more involved reactive logic.
- `data-wp-each` / `data-wp-each-key` — render a list from an array (see above).

## Modal / dialog / mobile menu

- Context `open`; toggle actions on trigger and close controls.
- `data-wp-bind--hidden`/class binding for visibility.
- Trap focus within the open dialog (cycle Tab/Shift+Tab inside it) and return focus to the trigger element on close.
- Mark background content `inert` (or `aria-hidden="true"` as a fallback) while the dialog is open, so it's excluded from tab order and assistive tech.
- Close on `Escape` (`data-wp-on--keydown`) and on overlay click, both calling the same close action as the visible close control.
- Restore body scroll on close (undo whatever locked it while open).
- See the **wp-interactivity-api** skill for a full focus-trap implementation.
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

After a client-side navigation (region-based routing), a value the server recomputed for the new page — a cart count, a facet count — isn't automatically reflected in client state. Read it back with `getServerState()` / `getServerContext()` (WP 6.8+) inside a derived `state` getter or a callback, rather than assuming the client's existing copy is still authoritative:

```js
import { store, getServerState } from '@wordpress/interactivity';

const { state } = store( 'mytheme', {
  state: {
    get cartCount() {
      return getServerState().cartCount;
    },
  },
} );
```

## Accessibility checklist

- Correct ARIA (`aria-expanded`, `aria-selected`, `aria-controls`, `role`) bound to state.
- Keyboard operable (Enter/Space/arrows/Escape as appropriate).
- Correct initial server-rendered state (no flash, works without JS where feasible).
- Honor `prefers-reduced-motion` for any animation/autoplay.
