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
  const backdropRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const guard = useRef(canClose);
  guard.current = canClose;

  const dragRef = useRef<{
    startY: number;
    startX: number;
    startTime: number;
    source: 'handle' | 'head' | 'body';
    isDragging: boolean;
  } | null>(null);

  const resetTransform = () => {
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1)';
      sheetRef.current.style.transform = '';
      sheetRef.current.style.opacity = '';
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = 'opacity 220ms ease';
      backdropRef.current.style.opacity = '';
    }
  };

  const closeWithSlideDown = () => {
    if (closing) return;
    if (guard.current && !guard.current()) {
      resetTransform();
      return;
    }
    setClosing(true);
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms ease';
      sheetRef.current.style.transform = 'translateY(100%)';
      sheetRef.current.style.opacity = '0';
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = 'opacity 220ms ease';
      backdropRef.current.style.opacity = '0';
    }
    setTimeout(onClose, 200);
  };

  const close = () => {
    if (closing) return;
    if (guard.current && !guard.current()) {
      resetTransform();
      return;
    }
    setClosing(true);
    setTimeout(onClose, 180);
  };

  const handleDragStart = (clientY: number, clientX: number, source: 'handle' | 'head' | 'body') => {
    dragRef.current = {
      startY: clientY,
      startX: clientX,
      startTime: Date.now(),
      source,
      isDragging: source !== 'body',
    };
  };

  const handleDragMove = (clientY: number, clientX: number) => {
    if (!dragRef.current || !sheetRef.current) return;
    const dy = clientY - dragRef.current.startY;
    const dx = clientX - dragRef.current.startX;

    if (!dragRef.current.isDragging) {
      // No corpo do modal: só inicia arrasto se o movimento for claramente para baixo e vertical
      if (dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.2 && (bodyRef.current?.scrollTop ?? 0) <= 0) {
        dragRef.current.isDragging = true;
      } else {
        return;
      }
    }

    if (dragRef.current.isDragging) {
      if (dy > 0) {
        sheetRef.current.style.transform = `translateY(${dy}px)`;
        sheetRef.current.style.transition = 'none';
        if (backdropRef.current) {
          const opacity = Math.max(0.15, 1 - dy / 450);
          backdropRef.current.style.opacity = opacity.toFixed(2);
        }
      } else {
        // Resistência suave para cima
        const resisted = dy * 0.15;
        sheetRef.current.style.transform = `translateY(${resisted}px)`;
        sheetRef.current.style.transition = 'none';
      }
    }
  };

  const handleDragEnd = (clientY: number) => {
    if (!dragRef.current) return;
    const wasDragging = dragRef.current.isDragging;
    const dy = clientY - dragRef.current.startY;
    const dt = Math.max(1, Date.now() - dragRef.current.startTime);
    const velocity = dy / dt;
    dragRef.current = null;

    if (!wasDragging) return;

    if (dy > 80 || (dy > 30 && velocity > 0.35)) {
      closeWithSlideDown();
    } else {
      resetTransform();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const prevFocus = document.activeElement as HTMLElement | null;
    const first = sheetRef.current?.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
    (first ?? sheetRef.current)?.focus({ preventScroll: true });

    // Ouvintes globais de toque para rastrear o arrasto perfeitamente pela tela
    const onTouchMove = (e: TouchEvent) => {
      if (!dragRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      handleDragMove(t.clientY, t.clientX);
      if (dragRef.current.isDragging && e.cancelable) {
        e.preventDefault();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!dragRef.current) return;
      const t = e.changedTouches[0] ?? e.touches[0];
      if (t) handleDragEnd(t.clientY);
      else resetTransform();
    };

    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTouchStart = (e: React.TouchEvent, source: 'handle' | 'head' | 'body') => {
    if (source === 'head') {
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, select')) return;
    }
    if (source === 'body') {
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
      if (bodyRef.current && bodyRef.current.scrollTop > 0) return;
    }
    const t = e.touches[0];
    if (t) handleDragStart(t.clientY, t.clientX, source);
  };

  const onMouseDown = (e: React.MouseEvent, source: 'handle' | 'head') => {
    if (e.button !== 0) return;
    if (source === 'head') {
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, select')) return;
    }
    handleDragStart(e.clientY, e.clientX, source);

    const onMouseMove = (ev: MouseEvent) => {
      handleDragMove(ev.clientY, ev.clientX);
    };

    const onMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      handleDragEnd(ev.clientY);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      ref={backdropRef}
      className={`backdrop${closing ? ' closing' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
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
          onTouchStart={(e) => onTouchStart(e, 'handle')}
          onMouseDown={(e) => onMouseDown(e, 'handle')}
        >
          <span />
        </div>
        {(title || headerExtra) && (
          <div
            className="sheet-head"
            onTouchStart={(e) => onTouchStart(e, 'head')}
            onMouseDown={(e) => onMouseDown(e, 'head')}
          >
            {title && <div className="sheet-title">{title}</div>}
            {headerExtra}
            <button className="icon-btn sm" onClick={close} aria-label="Fechar">
              <Icon name="x" size={18} />
            </button>
          </div>
        )}
        <div
          ref={bodyRef}
          className="sheet-body"
          onTouchStart={(e) => onTouchStart(e, 'body')}
        >
          {children}
        </div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
