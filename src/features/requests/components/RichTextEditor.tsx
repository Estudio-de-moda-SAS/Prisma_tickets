// src/features/requests/components/RichTextEditor.tsx
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { useCallback } from 'react';
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Link as LinkIcon, Unlink } from 'lucide-react';

/* ============================================================
   RichTextEditor — editor de texto enriquecido (Tiptap).
   Produce HTML en onChange. Botones: B, I, U, listas, link.
   Sin imagen/adjuntos (para eso está el adjuntador aparte).
   Estilado con la paleta de PRISMA.
   ============================================================ */

function ToolbarButton({ active, onClick, disabled, title, children }: {
  active?: boolean; onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick(); }}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${active ? 'rgba(0,200,255,0.4)' : 'transparent'}`,
        background: active ? 'rgba(0,200,255,0.12)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--txt-muted)',
        opacity: disabled ? 0.4 : 1, transition: 'all 0.12s',
      }}
      onMouseEnter={(e) => { if (!active && !disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = useCallback(() => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL del enlace:', prev ?? 'https://');
    if (url === null) return;             // cancelado
    if (url === '') {                     // vacío → quitar link
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const sep = <div style={{ width: 1, height: 18, background: 'var(--border-subtle)', margin: '0 3px' }} />;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
      <ToolbarButton title="Negrita"   active={editor.isActive('bold')}      onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></ToolbarButton>
      <ToolbarButton title="Itálica"   active={editor.isActive('italic')}    onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></ToolbarButton>
      <ToolbarButton title="Subrayado" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={14} /></ToolbarButton>
      {sep}
      <ToolbarButton title="Lista con viñetas"  active={editor.isActive('bulletList')}  onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={14} /></ToolbarButton>
      <ToolbarButton title="Lista numerada"     active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></ToolbarButton>
      {sep}
      <ToolbarButton title="Enlace"     active={editor.isActive('link')} onClick={setLink}><LinkIcon size={14} /></ToolbarButton>
      <ToolbarButton title="Quitar enlace" disabled={!editor.isActive('link')} onClick={() => editor.chain().focus().unsetLink().run()}><Unlink size={14} /></ToolbarButton>
    </div>
  );
}

export function RichTextEditor({ value, onChange, placeholder, accent = 'var(--accent)' }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  accent?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Tiptap devuelve '<p></p>' cuando está vacío → normalizamos a ''
      onChange(html === '<p></p>' ? '' : html);
    },
  });

  if (!editor) return null;

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'transparent', overflow: 'hidden' }}>
      <Toolbar editor={editor} />
      <div style={{ position: 'relative' }}>
        <EditorContent editor={editor} />
        {editor.isEmpty && placeholder && (
          <div style={{ position: 'absolute', top: 12, left: 14, fontSize: 13, color: 'var(--txt-muted)', pointerEvents: 'none', opacity: 0.6 }}>
            {placeholder}
          </div>
        )}
      </div>
      <style>{`
        .ProseMirror {
          min-height: 110px;
          padding: 12px 14px;
          outline: none;
          font-size: 13px;
          line-height: 1.65;
          color: var(--txt);
          font-family: var(--font-body);
        }
        .ProseMirror p { margin: 0 0 8px; }
        .ProseMirror p:last-child { margin-bottom: 0; }
        .ProseMirror ul, .ProseMirror ol { margin: 0 0 8px; padding-left: 22px; }
        .ProseMirror li { margin: 2px 0; }
        .ProseMirror a { color: ${accent}; text-decoration: underline; }
        .ProseMirror:focus { outline: none; }
      `}</style>
    </div>
  );
}