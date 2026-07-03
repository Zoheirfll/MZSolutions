import { useEffect, useState, useCallback } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'
import { theme } from '../../theme'

function GripIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/>
      <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
      <circle cx="9" cy="17" r="1.5"/><circle cx="15" cy="17" r="1.5"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
    </svg>
  )
}

const TYPE_LABELS = { internal: 'Interne', external: 'Externe', page: 'Page' }
const TYPE_COLORS = { internal: theme.badge.info, external: theme.badge.neutral, page: theme.badge.cyan }

function SortableItem({ item, onUpdate, onRemove, pages, slug }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors"
      style2={{ borderColor: isDragging ? '#7c3aed' : theme.dark.border, background: theme.dark.card }}>

      {/* Grip */}
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 shrink-0" type="button">
        <GripIcon />
      </button>

      {/* Type badge */}
      <span className={`${TYPE_COLORS[item.type] || theme.badge.neutral} shrink-0 text-[10px]`}>{TYPE_LABELS[item.type]}</span>

      {/* Label */}
      <input value={item.label} onChange={e => onUpdate({ ...item, label: e.target.value })}
        className="flex-1 min-w-0 bg-transparent text-sm text-gray-200 outline-none border-b border-transparent focus:border-violet-500 transition-colors py-0.5"
        placeholder="Libellé" />

      {/* URL/target */}
      {item.type === 'page' ? (
        <select value={item.page_slug || ''} onChange={e => {
          const pg = pages.find(p => p.slug === e.target.value)
          onUpdate({ ...item, page_slug: e.target.value, url: `/store/${slug}/pages/${e.target.value}`, label: item.label || pg?.title || '' })
        }} className="text-xs rounded-lg border px-2 py-1 outline-none w-36 shrink-0"
          style={{ background: theme.dark.app, borderColor: theme.dark.border, color: 'var(--sf-text-muted, #6b7280)' }}>
          <option value="">-- Choisir page --</option>
          {pages.map(p => <option key={p.slug} value={p.slug}>{p.title}</option>)}
        </select>
      ) : (
        <input value={item.url} onChange={e => onUpdate({ ...item, url: e.target.value })}
          className="text-xs rounded-lg border px-2 py-1.5 outline-none w-48 shrink-0 font-mono"
          style={{ background: theme.dark.app, borderColor: theme.dark.border, color: '#6b7280' }}
          placeholder={item.type === 'external' ? 'https://…' : '/store/{slug}'} />
      )}

      {/* Delete */}
      <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-300 shrink-0 cursor-pointer transition-colors">
        <TrashIcon />
      </button>
    </div>
  )
}

function newItem(type, slug) {
  return {
    id:       crypto.randomUUID(),
    label:    '',
    type,
    url:      type === 'internal' ? `/store/${slug}` : '',
    page_slug: '',
  }
}

export default function MenuPage() {
  const { user } = useAuth()
  const slug = user?.store_slug || ''
  const [items,   setItems]   = useState([])
  const [pages,   setPages]   = useState([])
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    api.get('/stores/me/settings/').then(({ data }) => {
      setItems(data.menu_items?.length ? data.menu_items : [
        { id: crypto.randomUUID(), label: 'Accueil',  type: 'internal', url: `/store/${slug}`,          page_slug: '' },
        { id: crypto.randomUUID(), label: 'Produits', type: 'internal', url: `/store/${slug}/products`, page_slug: '' },
      ])
    }).catch(() => {})
    api.get('/stores/pages/').then(({ data }) => setPages(data.filter(p => p.is_published))).catch(() => {})
  }, [slug])

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    setItems(it => arrayMove(it, it.findIndex(i => i.id === active.id), it.findIndex(i => i.id === over.id)))
  }

  const update = useCallback((updated) => {
    setItems(it => it.map(i => i.id === updated.id ? updated : i))
  }, [])

  const remove = useCallback((id) => {
    setItems(it => it.filter(i => i.id !== id))
  }, [])

  const addItem = (type) => setItems(it => [...it, newItem(type, slug)])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/stores/me/settings/', { menu_items: items })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout title="Éditeur de menu">
      <div className="max-w-2xl space-y-4">
        <p className="text-sm mb-4" style={{ color: theme.dark.muted }}>
          Glissez-déposez pour réorganiser. Les liens apparaîtront dans la navigation de votre boutique.
        </p>

        {/* Sortable list */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.map(item => (
                <SortableItem key={item.id} item={item}
                  onUpdate={update} onRemove={() => remove(item.id)}
                  pages={pages} slug={slug} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {items.length === 0 && (
          <div className="text-center py-10 rounded-xl border border-dashed" style={{ borderColor: theme.dark.border, color: theme.dark.muted }}>
            Aucun lien. Ajoutez des éléments ci-dessous.
          </div>
        )}

        {/* Add buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => addItem('internal')}
            className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors"
            style={{ borderColor: theme.dark.border, color: theme.dark.mutedLight, background: theme.dark.app }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#7c3aed'}
            onMouseLeave={e => e.currentTarget.style.borderColor = theme.dark.border}>
            + Lien interne
          </button>
          <button type="button" onClick={() => addItem('external')}
            className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors"
            style={{ borderColor: theme.dark.border, color: theme.dark.mutedLight, background: theme.dark.app }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#7c3aed'}
            onMouseLeave={e => e.currentTarget.style.borderColor = theme.dark.border}>
            + Lien externe
          </button>
          {pages.length > 0 && (
            <button type="button" onClick={() => addItem('page')}
              className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors"
              style={{ borderColor: theme.dark.border, color: theme.dark.mutedLight, background: theme.dark.app }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#7c3aed'}
              onMouseLeave={e => e.currentTarget.style.borderColor = theme.dark.border}>
              + Lien vers une page
            </button>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button onClick={save} disabled={saving} className={theme.btn.primary}>
            {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer le menu'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
