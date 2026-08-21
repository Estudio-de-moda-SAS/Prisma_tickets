import { useRef, useCallback } from 'react';

/**
 * Hook de scroll horizontal por arrastre (drag-to-scroll).
 *
 * Permite desplazar horizontalmente cualquier contenedor con
 * `overflow-x: auto/scroll` arrastrando con el mouse, útil para el board kanban.
 *
 * @module useDragScroll
 */

/**
 * Habilita el scroll horizontal arrastrando con el mouse.
 *
 * @remarks
 * Devuelve un `ref` para el contenedor y un conjunto de `handlers` de mouse. El
 * arrastre solo inicia con el botón primario y se ignora si el click empezó sobre
 * una `.request-card` (para no interferir con el drag-and-drop de las tarjetas).
 * Al arrastrar aplica un factor de 1.2 al desplazamiento, cambia el cursor a
 * `grabbing` y previene la selección de texto y el menú contextual. `onMouseLeave`
 * también termina el arrastre para que no quede "pegado" al salir del contenedor.
 *
 * @returns `{ ref, handlers }` — el `ref` a colocar en el contenedor y los
 *   `handlers` (`onMouseDown`, `onMouseMove`, `onMouseUp`, `onMouseLeave`,
 *   `onContextMenu`) a esparcir sobre él.
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