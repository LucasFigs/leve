import { useEffect, type RefObject } from 'react';

const modals: HTMLElement[] = [];
const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Contém o teclado, isola o fundo e devolve foco ao elemento que abriu o modal. */
export function useModalFocus(ref: RefObject<HTMLElement>, enabled = true) {
  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    const previous = document.activeElement as HTMLElement | null;
    const hidden = new Map<HTMLElement, boolean>();
    let branch: HTMLElement = root;
    while (branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          hidden.set(sibling, sibling.hasAttribute('inert'));
          sibling.setAttribute('inert', '');
        }
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }
    modals.push(root);
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(focusable))
      .filter(el => !el.closest('[inert], [hidden]') && el.getClientRects().length > 0);
    const top = () => modals[modals.length - 1] === root;
    const focusFirst = () => (root.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? items()[0] ?? root).focus({ preventScroll: true });
    focusFirst();
    const onKey = (event: KeyboardEvent) => {
      if (!top() || event.key !== 'Tab') return;
      const controls = items();
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); root.focus(); return; }
      if (!root.contains(document.activeElement) || document.activeElement === root ||
        (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (top() && !root.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus);
      const index = modals.lastIndexOf(root);
      if (index >= 0) modals.splice(index, 1);
      hidden.forEach((wasInert, element) => { if (!wasInert) element.removeAttribute('inert'); });
      if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
    };
  }, [enabled, ref]);
}
