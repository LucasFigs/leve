import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  full?: boolean;
  headerExtra?: ReactNode;
  label?: string;
  /** Chamado antes de fechar; retornar false mantém aberto (ex.: alterações não salvas). */
  canClose?: () => boolean;
}

/**
 * Bottom sheet no celular, modal centralizado no desktop.
 * Fecha com Esc, toque no fundo ou arrastando para baixo.
 */
export function BottomSheet({ title, onClose, children, footer, full, headerExtra, label, canClose }: Props) {
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const guard = useRef(canClose);
  guard.current = canClose;

  const close = () => {
    if (closing) return;
    if (guard.current && !guard.current()) {
      if (sheetRef.current) sheetRef.current.style.transform = '';
      return;
    }
    setClosing(true);
    setTimeout(onClose, 180);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const prevFocus = document.activeElement as HTMLElement | null;
    const first = sheetRef.current?.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
    (first ?? sheetRef.current)?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !sheetRef.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    drag.current.dy = dy;
    sheetRef.current.style.transform = `translateY(${dy}px)`;
    sheetRef.current.style.transition = 'none';
  };
  const onPointerUp = () => {
    if (!drag.current || !sheetRef.current) return;
    const { dy } = drag.current;
    drag.current = null;
    sheetRef.current.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1)';
    if (dy > 90) close();
    else sheetRef.current.style.transform = '';
  };

  return (
    <div className={`backdrop${closing ? ' closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={sheetRef}
        className={`sheet${full ? ' full' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === 'string' ? title : undefined)}
        tabIndex={-1}
      >
        <div
          className="sheet-handle"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span />
        </div>
        {(title || headerExtra) && (
          <div className="sheet-head">
            {title && <div className="sheet-title">{title}</div>}
            {headerExtra}
            <button className="icon-btn sm" onClick={close} aria-label="Fechar">
              <Icon name="x" size={18} />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
