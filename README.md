## Warning

If you've stumbled across this fork, DO NOT use it in production apps, even if it fixes the problems with the original Vaul for you as well (at the cost of breaking ALL of advanced features it offered).
This fork is created for **experimental personal use**.
The code present here already has almost nothing to do with the original Vaul, but it keeps backwards compatibility for simple use cases and existing code in your project might work without changes.

https://github.com/emilkowalski/vaul/assets/36730035/fdf8c5e8-ade8-433b-8bb0-4ce10e722516

Vaul is an unstyled drawer component for React that can be used as a Dialog replacement on tablet and mobile devices. You can read about why and how it was built [here](https://emilkowal.ski/ui/building-a-drawer-component).

## Usage

To start using the library, install it in your project:,

```bash
npm install @reflexguru/vaul
```

Use the drawer in your app.

```jsx
import { Drawer } from '@reflexguru/vaul';

function MyComponent() {
  return (
    <Drawer.Root>
      <Drawer.Trigger>Open</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Content>
          <Drawer.Title>Title</Drawer.Title>
        </Drawer.Content>
        <Drawer.Overlay />
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

## Documentation

Find the full API reference and examples in the [documentation](https://vaul.emilkowal.ski/getting-started).
