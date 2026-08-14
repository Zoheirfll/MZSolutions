import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Youtube from '@tiptap/extension-youtube'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useRef } from 'react'
import api from '../api/axios'

function ToolBtn({ onClick, active, title, children, disabled }) {
  return (
    <button type="button" disabled={disabled} onMouseDown={e => { e.preventDefault(); onClick() }} title={title}
      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed
        ${active ? 'bg-violet-600 text-white' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/8'}`}>
      {children}
    </button>
  )
}

const Divider = () => <div className="w-px h-5 bg-violet-500/15 mx-0.5" />

export default function RichEditor({ value, onChange, placeholder = 'Écrivez votre contenu ici…' }) {
  const fileRef = useRef()
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-violet-400 underline' } }),
      Image.configure({ HTMLAttributes: { class: 'rounded-lg max-w-full' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Youtube.configure({ nocookie: true, HTMLAttributes: { class: 'rounded-lg w-full aspect-video' } }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate({ editor }) {
      onChange?.(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[280px] px-4 py-3 text-sm text-app-primary leading-relaxed prose-sm max-w-none',
      },
    },
  })

  // Sync external value changes (e.g. load from API)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '')
    }
  }, [value])  // eslint-disable-line

  const setLink = () => {
    const prev = editor.getAttributes('link').href
    const url = window.prompt('URL du lien :', prev)
    if (url === null) return
    if (url === '') { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url }).run()
  }

  const insertVideo = () => {
    const url = window.prompt('URL de la vidéo YouTube :')
    if (!url) return
    editor.chain().focus().setYoutubeVideo({ src: url }).run()
  }

  const pickImage = () => fileRef.current?.click()

  const handleImageFile = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const fd = new FormData()
      fd.append('files', file)
      const { data } = await api.post('/media/files/upload/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const url = data?.[0]?.url
      if (url) editor.chain().focus().setImage({ src: url }).run()
    } catch {
      window.alert("Échec de l'upload de l'image.")
    }
  }

  if (!editor) return null

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-2 border-b flex-wrap" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card-alt)' }}>
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Gras">
          <strong>B</strong>
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italique">
          <em>I</em>
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Barré">
          <span style={{ textDecoration: 'line-through' }}>S</span>
        </ToolBtn>
        <Divider />
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Titre H2">
          H2
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Titre H3">
          H3
        </ToolBtn>
        <Divider />
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Aligner à gauche">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Centrer">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg>
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Aligner à droite">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="6" y1="18" x2="20" y2="18"/></svg>
        </ToolBtn>
        <Divider />
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Liste à puces">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Liste numérotée">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4" strokeLinecap="round"/><path d="M4 10h2" strokeLinecap="round"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" strokeLinecap="round"/></svg>
        </ToolBtn>
        <Divider />
        <ToolBtn onClick={setLink} active={editor.isActive('link')} title="Lien">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        </ToolBtn>
        <ToolBtn onClick={pickImage} title="Insérer une image">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        </ToolBtn>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
        <ToolBtn onClick={insertVideo} title="Insérer une vidéo YouTube">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="15" height="14" rx="2"/><path d="M22 8l-5 4 5 4V8z"/></svg>
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Citation">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
        </ToolBtn>
        <Divider />
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Annuler">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Rétablir">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3L21 13"/></svg>
        </ToolBtn>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  )
}
