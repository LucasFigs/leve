import { useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/** Acompanha texto, expansão de painéis e largura da tela, sem rolagem interna. */
export function AutoGrowTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const input = ref.current;
    if (!input || !input.clientWidth) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  };
  useLayoutEffect(resize, [props.value]);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    let width = input.clientWidth;
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => {
      if (input.clientWidth !== width) { width = input.clientWidth; resize(); }
    });
    observer?.observe(input);
    window.addEventListener('resize', resize);
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); };
  }, []);
  return <textarea {...props} ref={ref} rows={props.rows ?? 1} style={{ ...props.style, overflowY: 'hidden', resize: 'none' }} />;
}
