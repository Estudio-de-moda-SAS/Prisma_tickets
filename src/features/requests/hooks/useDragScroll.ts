import { useRef, useCallback } from 'react';

/**
 * Permite hacer scroll horizontal arrastrando con el mouse
 * en cualquier contenedor con overflow-x: auto/scroll.
 */
export function useDragScroll() {
  const ref        = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX     = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.request-card')) return;

    e.preventDefault(); // previene selección de texto y menú contextual
    isDragging.current = true;
    startX.current     = e.pageX - (ref.current?.offsetLeft ?? 0);
    scrollLeft.current = ref.current?.scrollLeft ?? 0;

    if (ref.current) ref.current.style.cursor = 'grabbing';
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !ref.current) return;
    e.preventDefault();
    const x    = e.pageX - ref.current.offsetLeft;
    const walk = (x - startX.current) * 1.2;
    ref.current.scrollLeft = scrollLeft.current - walk;
  }, []);

  const stopDrag = useCallback(() => {
    isDragging.current = false;
    if (ref.current) ref.current.style.cursor = '';
  }, []);

  // Previene el menú contextual del browser al hacer click largo
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (isDragging.current) e.preventDefault();
  }, []);

  return {
    ref,
    handlers: {
      onMouseDown,
      onMouseMove,
      onMouseUp:    stopDrag,
      onMouseLeave: stopDrag,
      onContextMenu,
    },
  };
}