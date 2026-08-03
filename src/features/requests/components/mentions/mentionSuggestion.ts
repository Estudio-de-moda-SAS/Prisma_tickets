// src/features/requests/components/mentions/mentionSuggestion.ts
import { ReactRenderer } from '@tiptap/react';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { MentionList, type MentionListRef } from './MentionList';
import type { AppUser } from '@/features/requests/hooks/useUsers';

// Altura máxima del panel (debe coincidir con maxHeight del panel en MentionList).
const PANEL_MAX_H = 240;
const GAP = 6;
const MARGIN = 8;

export function buildMentionSuggestion(
  getItems: (query: string) => AppUser[],
): Omit<SuggestionOptions, 'editor'> {
  return {
    char: '@',
    items: ({ query }) => getItems(query),
    render: () => {
      let component: ReactRenderer<MentionListRef> | null = null;
      let wrapper: HTMLDivElement | null = null;

      const place = (rect: DOMRect | null | undefined) => {
        if (!wrapper || !rect) return;

        const spaceBelow = window.innerHeight - rect.bottom;
        // Si abajo no cabe el panel (a su altura máxima), abrir hacia arriba.
        const openUp = spaceBelow < PANEL_MAX_H + GAP + MARGIN;

        wrapper.style.left = `${rect.left}px`;

        if (openUp) {
          // Anclar por la parte de ABAJO del wrapper al caret: crece hacia arriba
          // sin importar cuántos items tenga. bottom fijo, top libre.
          wrapper.style.top    = 'auto';
          wrapper.style.bottom = `${window.innerHeight - rect.top + GAP}px`;
        } else {
          wrapper.style.bottom = 'auto';
          wrapper.style.top    = `${rect.bottom + GAP}px`;
        }
      };

      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionList, { props, editor: props.editor });
          wrapper = document.createElement('div');
          wrapper.style.position = 'fixed';
          wrapper.style.zIndex = '2000';
          wrapper.appendChild(component.element);
          document.body.appendChild(wrapper);
          place(props.clientRect?.());
        },
        onUpdate: (props) => { component?.updateProps(props); place(props.clientRect?.()); },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') return true;
          return component?.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => { wrapper?.remove(); component?.destroy(); wrapper = null; component = null; },
      };
    },
  };
}