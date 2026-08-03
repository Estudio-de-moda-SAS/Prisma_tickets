// src/features/requests/components/mentions/CommentComposer.tsx
import { useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { Mention } from '@tiptap/extension-mention';
import { Send } from 'lucide-react';
import type { AppUser } from '@/features/requests/hooks/useUsers';
import { filterMentionables, extractMentionIds, shortName } from '@/features/requests/lib/mentions';
import { buildMentionSuggestion } from './mentionSuggestion';

type Mentioner = { User_ID: number; User_Role: string; Department_ID: number | null };
type Props = {
  users: AppUser[];
  mentioner: Mentioner;
  isConfidential: boolean;
  sending: boolean;
  onSubmit: (text: string, mentionedUserIds: number[]) => void;
};

export function CommentComposer({ users, mentioner, isConfidential, sending, onSubmit }: Props) {
  const dataRef = useRef({ users, mentioner, isConfidential });
  dataRef.current = { users, mentioner, isConfidential };

  const mentionExt = useMemo(
    () =>
      Mention.configure({
        HTMLAttributes: { class: 'prisma-mention' },
        renderText: ({ node }) => `@[${node.attrs.id}]`,
        renderHTML: ({ node }) => {
          const short = shortName(String(node.attrs.label ?? node.attrs.id));
          return ['span', { class: 'prisma-mention' }, `@${short}`];
        },
        suggestion: buildMentionSuggestion((query) => {
          const d = dataRef.current;
          const result = filterMentionables(query, d.users, d.mentioner, d.isConfidential, {
            excludeUserId: d.mentioner.User_ID,
          });
          return result;
        }),
      }),
    [],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, bulletList: false, orderedList: false, listItem: false,
        blockquote: false, codeBlock: false, horizontalRule: false,
        bold: false, italic: false, strike: false, code: false,
      }),
      Placeholder.configure({ placeholder: 'Escribe un comentario… (@ menciona, Ctrl+Enter envía)' }),
      mentionExt,
    ],
    editorProps: { attributes: { class: 'prisma-comment-input', style: 'outline:none' } },
  });

  // ── v3: el componente NO re-renderiza por transacción; leemos isEmpty reactivo ──
  const isEmpty = useEditorState({
    editor,
    selector: (ctx) => ctx.editor?.isEmpty ?? true,
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  function submit() {
    if (!editor || sending) return;
    const text = editor.getText({ blockSeparator: '\n' }).trim();
    if (!text) return;
    onSubmit(text, extractMentionIds(text));
    editor.commands.clearContent();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
  }

  const empty = !editor || isEmpty;

  return (
    <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="prisma-comment-wrapper" onKeyDown={onKeyDown}>
        <EditorContent editor={editor} />
      </div>
      <button onClick={submit} disabled={empty || sending}
        style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, background: !empty ? 'var(--accent-2)' : 'var(--bg-surface)', border: `1px solid ${!empty ? 'transparent' : 'var(--border-subtle)'}`, color: !empty ? 'white' : 'var(--txt-muted)', fontSize: 11, fontWeight: 600, cursor: !empty ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)' }}>
        <Send size={11} />{sending ? 'Enviando…' : 'Enviar'}
      </button>
    </div>
  );
}