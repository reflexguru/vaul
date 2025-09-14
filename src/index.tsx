'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import React from 'react';
import './style.css';
import { useControllableState } from './use-controllable-state';

type Direction = 'top' | 'bottom' | 'left' | 'right';

type RootProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  modal?: boolean;
  dismissible?: boolean;
  direction?: Direction;
  closeThreshold?: number; // 0..1 of drawer size
  handleOnly?: boolean;
};

type DrawerContextValue = {
  drawerRef: React.RefObject<HTMLDivElement>;
  overlayRef: React.RefObject<HTMLDivElement>;
  direction: Direction;
  handleOnly: boolean;
  onPress: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDrag: (e: React.PointerEvent<HTMLDivElement>) => void;
  onRelease: (e: React.PointerEvent<HTMLDivElement> | null) => void;
  isOpen: boolean;
};

const DrawerCtx = React.createContext<DrawerContextValue | null>(null);
function useDrawerCtx(): DrawerContextValue {
  const ctx = React.useContext(DrawerCtx);
  if (!ctx) throw new Error('Drawer components must be used within Drawer.Root');
  return ctx;
}

const DEFAULT_CLOSE_THRESHOLD = 0.25;
const VELOCITY_CLOSE = 0.35;

function Root({
  open: openProp,
  defaultOpen,
  onOpenChange,
  children,
  modal = true,
  dismissible = true,
  direction = 'bottom',
  closeThreshold = DEFAULT_CLOSE_THRESHOLD,
  handleOnly = false,
}: RootProps) {
  const [isOpen = false, setIsOpen] = useControllableState({
    defaultProp: defaultOpen ?? false,
    prop: openProp,
    onChange: (o: boolean) => onOpenChange?.(o),
  });
  const [present, setPresent] = React.useState<boolean>(!!(defaultOpen ?? openProp));

  const drawerRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const dragStartTimeRef = React.useRef<number>(0);
  const isDraggingRef = React.useRef(false);

  const axisIsVertical = direction === 'top' || direction === 'bottom';
  const closeSign = direction === 'bottom' || direction === 'right' ? 1 : -1;
  const animTimerRef = React.useRef<number | null>(null);
  const isAnimatingRef = React.useRef<boolean>(false);
  const presentHideTimerRef = React.useRef<number | null>(null);
  const activeElRef = React.useRef<HTMLElement | null>(null);
  const isSwipeClosingRef = React.useRef<boolean>(false);

  function getDrawerElFromEvent(event: React.PointerEvent<HTMLDivElement>): HTMLElement | null {
    const target = event.currentTarget as HTMLElement;
    const el = target.closest('[data-simple-drawer]') as HTMLElement | null;
    return el;
  }

  function resetTransform(withTransition = true, node?: HTMLElement | null) {
    const el = node ?? drawerRef.current;
    if (!el) return;
    el.style.transition = withTransition ? 'transform 300ms cubic-bezier(0.2, 0.8, 0, 1)' : 'none';
    el.style.transform = 'translate3d(0, 0, 0)';
  }

  function close() {
    setIsOpen(false);
  }

  const onPress = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isAnimatingRef.current) return;
    const targetEl = event.currentTarget as HTMLElement;
    try {
      targetEl.setPointerCapture(event.pointerId);
    } catch {}
    // Resolve drawer element even if ref isn't yet available
    const el = drawerRef.current || getDrawerElFromEvent(event);
    activeElRef.current = el;
    // Prevent open animation retrigger during interactions
    if (el && el.getAttribute('data-state') === 'open' && el.getAttribute('data-opened') !== 'true') {
      el.removeAttribute('data-animating');
      el.setAttribute('data-opened', 'true');
    }
    pointerStartRef.current = { x: event.pageX, y: event.pageY };
    dragStartTimeRef.current = performance.now();
    isDraggingRef.current = true;
    if (activeElRef.current) activeElRef.current.setAttribute('data-dragging', 'true');
  }, []);

  const onDrag = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isAnimatingRef.current) return;
      if (!isDraggingRef.current || !pointerStartRef.current) return;
      const start = pointerStartRef.current;
      const dx = event.pageX - start.x;
      const dy = event.pageY - start.y;
      const delta = axisIsVertical ? dy : dx;

      const signed = delta * closeSign;
      const drag = Math.max(0, signed);

      const el = activeElRef.current || drawerRef.current || getDrawerElFromEvent(event);
      if (!el) return;
      el.style.transition = 'none';
      el.setAttribute('data-dragging', 'true');
      if (axisIsVertical) el.style.transform = `translate3d(0, ${drag}px, 0)`;
      else el.style.transform = `translate3d(${drag}px, 0, 0)`;
    },
    [axisIsVertical, closeSign],
  );

  const onRelease = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement> | null) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      const el = activeElRef.current || drawerRef.current || (event ? getDrawerElFromEvent(event) : null);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dim = axisIsVertical ? Math.min(rect.height, window.innerHeight) : Math.min(rect.width, window.innerWidth);

      let dist = 0;
      if (pointerStartRef.current && event) {
        const dx = event.pageX - pointerStartRef.current.x;
        const dy = event.pageY - pointerStartRef.current.y;
        dist = (axisIsVertical ? dy : dx) * closeSign;
      }
      dist = Math.max(0, dist);

      const dt = Math.max(1, performance.now() - dragStartTimeRef.current);
      const vel = dist / dt; // px per ms

      const shouldClose = vel > VELOCITY_CLOSE || dist >= dim * closeThreshold;
      if (shouldClose && dismissible) {
        // Ensure CSS doesn't disable transition
        el.removeAttribute('data-dragging');
        // Enable transition and move to final position (force reflow to apply)
        el.style.transition = 'transform 300ms cubic-bezier(0.2, 0.8, 0, 1)';
        void el.offsetHeight;
        if (axisIsVertical) el.style.transform = `translate3d(0, ${dim}px, 0)`;
        else el.style.transform = `translate3d(${dim}px, 0, 0)`;
        // mark swipe-closing and trigger overlay fade, then close after transform
        isSwipeClosingRef.current = true;
        const ov = overlayRef.current || (document.querySelector('[data-simple-overlay]') as HTMLDivElement | null);
        if (ov) {
          ov.setAttribute('data-state', 'closed');
          ov.setAttribute('data-animating', 'closed');
        }
        window.setTimeout(() => close(), 300);
        activeElRef.current = null;
        return;
      }

      el.removeAttribute('data-dragging');
      resetTransform(true, el);
      activeElRef.current = null;
    },
    [axisIsVertical, closeSign, close, dismissible, closeThreshold],
  );

  // Control presence: open mounts immediately; close unmounts after swipe/close animation
  React.useEffect(() => {
    if (isOpen) {
      setPresent(true);
      // reset "opened" flag when we transition from closed to open
      const el = drawerRef.current;
      const ov = overlayRef.current || (document.querySelector('[data-simple-overlay]') as HTMLDivElement | null);
      if (el) el.removeAttribute('data-opened');
      if (ov) ov.setAttribute('data-state', 'open');
      isAnimatingRef.current = true;
      window.setTimeout(() => {
        isAnimatingRef.current = false;
      }, 300);
      return;
    }
    const el = drawerRef.current;
    const ov = overlayRef.current || (document.querySelector('[data-simple-overlay]') as HTMLDivElement | null);
    if (animTimerRef.current) {
      window.clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
    if (isSwipeClosingRef.current) {
      // content is in transform transition; keep it mounted until it ends
      const t = window.setTimeout(() => {
        isSwipeClosingRef.current = false;
        const ovNow = overlayRef.current || (document.querySelector('[data-simple-overlay]') as HTMLDivElement | null);
        if (ovNow) ovNow.removeAttribute('data-animating');
        setPresent(false);
      }, 300);
      return () => window.clearTimeout(t);
    }
    const startClosedAnim = () => {
      const node = drawerRef.current;
      if (!node) return;
      node.removeAttribute('data-dragging');
      isDraggingRef.current = false;
      node.setAttribute('data-animating', 'closed');
      const ov = overlayRef.current || (document.querySelector('[data-simple-overlay]') as HTMLDivElement | null);
      if (ov) ov.setAttribute('data-animating', 'closed');
    };

    if (el) {
      // Ensure drag state is cleared so animations are not suppressed by CSS
      startClosedAnim();
      isAnimatingRef.current = true;
      animTimerRef.current = window.setTimeout(() => {
        el.removeAttribute('data-animating');
        setPresent(false);
        animTimerRef.current = null;
        isAnimatingRef.current = false;
      }, 300);
    } else {
      // Keep present for the duration of the close animation even if ref not yet available
      if (presentHideTimerRef.current) window.clearTimeout(presentHideTimerRef.current);
      // Try to set closed anim on the next frame when ref likely mounted
      window.requestAnimationFrame(startClosedAnim);
      isAnimatingRef.current = true;
      presentHideTimerRef.current = window.setTimeout(() => {
        setPresent(false);
        isAnimatingRef.current = false;
        presentHideTimerRef.current = null;
      }, 300);
    }
    if (ov) {
      ov.setAttribute('data-animating', 'closed');
      isAnimatingRef.current = true;
      window.setTimeout(() => {
        if (ov) ov.removeAttribute('data-animating');
        isAnimatingRef.current = false;
      }, 300);
    }
  }, [isOpen]);

  // Run open animation after content is mounted
  React.useEffect(() => {
    if (!isOpen || !present) return;
    const el = drawerRef.current;
    if (!el) return;
    if (animTimerRef.current) {
      window.clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
    // If already marked opened, skip re-playing open animation
    if (el.getAttribute('data-opened') === 'true') return;
    el.setAttribute('data-animating', 'open');
    isAnimatingRef.current = true;
    animTimerRef.current = window.setTimeout(() => {
      el.removeAttribute('data-animating');
      el.setAttribute('data-opened', 'true');
      animTimerRef.current = null;
      isAnimatingRef.current = false;
    }, 420);
  }, [isOpen, present]);

  return (
    <DialogPrimitive.Root
      open={present}
      defaultOpen={defaultOpen}
      modal={modal}
      onOpenChange={(o) => {
        if (!dismissible && !o) return;
        setIsOpen(o);
      }}
    >
      <DrawerCtx.Provider value={{ drawerRef, overlayRef, direction, handleOnly, onPress, onDrag, onRelease, isOpen }}>
        {children}
      </DrawerCtx.Provider>
    </DialogPrimitive.Root>
  );
}

function Overlay(props: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>) {
  const ctx = useDrawerCtx();
  return <DialogPrimitive.Overlay ref={ctx.overlayRef as any} forceMount data-simple-overlay {...props} />;
}

type ContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  direction?: Direction;
};
function Content({ direction: directionProp, ...rest }: ContentProps) {
  const ctx = useDrawerCtx();
  const direction = directionProp ?? ctx.direction;
  const nativeBoundRef = React.useRef<boolean>(false);
  return (
    <DialogPrimitive.Content
      forceMount
      data-simple-drawer
      data-direction={direction}
      ref={ctx.drawerRef}
      {...rest}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        rest.onOpenAutoFocus?.(e as any);
        const el = ctx.drawerRef.current;
        if (!el) return;
        // Start open animation explicitly; will be ignored if already opened
        if (el.getAttribute('data-opened') === 'true') return;
        el.setAttribute('data-animating', 'open');
        window.setTimeout(() => {
          // Guard in case of rapid close
          if (!ctx.isOpen) return;
          el.removeAttribute('data-animating');
          el.setAttribute('data-opened', 'true');
        }, 420);
      }}
      onPointerDown={(e) => {
        // Ensure pointer capture for consistent events in React 19
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {}
        rest.onPointerDown?.(e);
        if (!ctx.handleOnly) ctx.onPress(e);
      }}
      onPointerMove={(e) => {
        rest.onPointerMove?.(e);
        if (!ctx.handleOnly) ctx.onDrag(e);
      }}
      onPointerUp={(e) => {
        rest.onPointerUp?.(e);
        ctx.onRelease(e);
      }}
      onPointerCancel={() => ctx.onRelease(null)}
      data-state={ctx.isOpen ? 'open' : 'closed'}
    />
  );
}

type HandleProps = React.ComponentPropsWithoutRef<'div'>;
function Handle({ ...rest }: HandleProps) {
  const { onPress, onDrag, onRelease } = useDrawerCtx();
  return (
    <div
      data-simple-handle
      onPointerDown={onPress as any}
      onPointerMove={onDrag as any}
      onPointerUp={onRelease as any}
      onPointerCancel={() => onRelease(null as any)}
      {...rest}
    />
  );
}

export const Drawer = {
  Root,
  Content,
  Overlay,
  Trigger: DialogPrimitive.Trigger,
  Portal: DialogPrimitive.Portal,
  Handle,
  Close: DialogPrimitive.Close,
  Title: DialogPrimitive.Title,
  Description: DialogPrimitive.Description,
};
