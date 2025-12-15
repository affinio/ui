# Animation Hooks

`@affino/menu-vue` and `@affino/menu-react` keep the DOM bare so you can bring your own motion system. Every panel element exposes the same attributes you can target in CSS (or any animation library):

- `data-state="open" | "closed"`
- `data-side="top" | "bottom" | "left" | "right"`
- `data-motion="from-top" | "from-bottom" | "from-left" | "from-right"`

Because these live on the actual menu panel, they update automatically when a menu opens, closes, or repositions. That means Tailwind, vanilla CSS, Motion One, or even Framer Motion wrappers can react with zero extra wiring.

## Examples

### Fade

```css
[data-state="closed"] {
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
}

[data-state="open"] {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 120ms ease, transform 120ms ease;
}
```

### Scale + fade (Outlook style)

```css
[data-motion="from-bottom"][data-state="closed"] {
  opacity: 0;
  transform: translateY(4px) scale(0.96);
}

[data-motion="from-bottom"][data-state="open"] {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition: opacity 140ms ease, transform 140ms cubic-bezier(.2,.8,.4,1);
}
```

### Slide

```css
[data-motion="from-left"][data-state="closed"] {
  opacity: 0;
  transform: translateX(-6px);
}

[data-motion="from-left"][data-state="open"] {
  opacity: 1;
  transform: translateX(0);
  transition: opacity 120ms ease, transform 120ms ease;
}
```

## Bring your own motion

Menu Vue stays headless—there are no built-in animations or opinions about your styling stack. The attributes above simply expose intent so you can:

- Use CSS transitions or keyframes.
- Scope Tailwind utilities via `data-[state=open]:animate-in` patterns.
- Drive Motion One timelines or Vue `<Transition>` wrappers.
- Mirror Framer Motion style variants in your design system components.

Pick whatever tool fits your product; the menu just tells you *what* is happening, not *how* to animate it.
