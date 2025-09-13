import React from 'react';
import { isInput } from './use-prevent-scroll';

export type KeyboardViewportState = {
  occludedByKeyboard: number;
  visualViewportHeight: number;
  visualViewportOffsetTop: number;
  layoutViewportHeight: number;
  isKeyboardOpen: boolean;
};

type Options = {
  enabled?: boolean;
  hysteresisOpenPx?: number;
  hysteresisClosePx?: number;
};

export function useKeyboardViewport(options: Options = {}): KeyboardViewportState {
  const { enabled = true, hysteresisOpenPx = 20, hysteresisClosePx = 8 } = options;

  const [state, setState] = React.useState<KeyboardViewportState>(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
    const layout = typeof window !== 'undefined' ? window.innerHeight : 0;
    const vvH = vv?.height ?? layout;
    const vvTop = vv?.offsetTop ?? 0;
    const occluded = Math.max(layout - (vvH + vvTop), 0);
    return {
      occludedByKeyboard: occluded,
      visualViewportHeight: vvH,
      visualViewportOffsetTop: vvTop,
      layoutViewportHeight: layout,
      isKeyboardOpen: occluded > 0,
    };
  });

  const keyboardWasOpenRef = React.useRef(state.isKeyboardOpen);
  const lastStateRef = React.useRef(state);
  const rafIdRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!enabled) return;

    const vv = window.visualViewport;

    const approxEq = (a: number, b: number, eps = 1) => Math.abs(a - b) <= eps;

    const measure = () => {
      const layoutHeight = window.innerHeight;
      const vvHeight = vv?.height ?? layoutHeight;
      const vvOffsetTop = vv?.offsetTop ?? 0;
      const occludedByKeyboard = Math.max(layoutHeight - (vvHeight + vvOffsetTop), 0);

      const focusedElement = document.activeElement as HTMLElement | null;
      const isFocusedInput = !!focusedElement && isInput(focusedElement);

      const wasOpen = keyboardWasOpenRef.current;
      const open =
        occludedByKeyboard > hysteresisOpenPx ||
        (wasOpen && occludedByKeyboard > hysteresisClosePx) ||
        (isFocusedInput && occludedByKeyboard > 0);

      const next: KeyboardViewportState = {
        occludedByKeyboard,
        visualViewportHeight: vvHeight,
        visualViewportOffsetTop: vvOffsetTop,
        layoutViewportHeight: layoutHeight,
        isKeyboardOpen: open,
      };

      const prev = keyboardWasOpenRef.current;
      keyboardWasOpenRef.current = open;

      // Only update when something meaningfully changed
      const prevState = lastStateRef.current;
      const changed =
        prevState.isKeyboardOpen !== next.isKeyboardOpen ||
        !approxEq(prevState.occludedByKeyboard, next.occludedByKeyboard) ||
        !approxEq(prevState.visualViewportHeight, next.visualViewportHeight) ||
        !approxEq(prevState.visualViewportOffsetTop, next.visualViewportOffsetTop) ||
        !approxEq(prevState.layoutViewportHeight, next.layoutViewportHeight);

      if (changed) {
        lastStateRef.current = next;
        setState(next);
      }
    };

    const schedule = () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(measure);
    };

    schedule();

    vv?.addEventListener('resize', schedule);
    vv?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('focusin', schedule);
    window.addEventListener('focusout', schedule);

    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      vv?.removeEventListener('resize', schedule);
      vv?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.removeEventListener('focusin', schedule);
      window.removeEventListener('focusout', schedule);
    };
  }, [enabled, hysteresisOpenPx, hysteresisClosePx]);

  return state;
}
