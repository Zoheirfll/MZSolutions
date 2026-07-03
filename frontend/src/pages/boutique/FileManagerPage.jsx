import { useEffect, useRef, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

function FolderIcon({ open }) {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill={open ? '#7c3aed' : 'none'} stroke={open ? '#7c3aed' : 'currentColor'} strokeWidth="2">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  )
}

function FileIcon({ mime }) {
  const isImage = mime?.startsWith('image/')
  if (isImage) return (
    <svg className="w-8 h-8 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
  )
  return (
    <svg className="w-8 h-8 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  )
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FileManagerPage() {
  const [folders,  setFolders]  = useState([])
  const [files,    setFiles]    = useState([])
  const [selected, setSelected] = useState(null) // folder id or null = root
  const [search,   setSearch]   = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [addingFolder, setAddingFolder] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 })
  const [copied,   setCopied]   = useState(null)
  const [deleting, setDeleting] = useState(null)
  const fileInput = useRef()

  const loadFolders = () => api.get('/media/folders/').then(({ data }) => setFolders(data)).catch(() => {})
  const loadFiles   = () => {
    const params = new URLSearchParams()
    if (selected === '__root__') params.set('folder', 'none')
    else if (selected) params.set('folder', selected)
    if (search) params.set('search', search)
    api.get(`/media/files/?${params}`).then(({ data }) => setFiles(data)).catch(() => {})
  }

  useEffect(() => { loadFolders() }, [])
  useEffect(() => { loadFiles() }, [selected, search])

  const createFolder = async () => {
    if (!newFolder.trim()) return
    await api.post('/media/folders/', { name: newFolder.trim() }).catch(() => {})
    setNewFolder('')
    setAddingFolder(false)
    loadFolders()
  }

  const deleteFolder = async (id) => {
    if (!confirm('Supprimer ce dossier et tous ses fichiers ?')) return
    await api.delete(`/media/folders/${id}/`).catch(() => {})
    if (selected === id) setSelected(null)
    loadFolders()
    loadFiles()
  }

  const uploadFiles = async (inputFiles) => {
    const fileArr = Array.from(inputFiles)
    if (!fileArr.length) return
    setUploading(true)
    setUploadProgress({ done: 0, total: fileArr.length })
    const formData = new FormData()
    fileArr.forEach(f => formData.append('files', f))
    if (selected && selected !== '__root__') formData.append('folder', selected)
    try {
      await api.post('/media/files/upload/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setUploadProgress({ done: fileArr.length, total: fileArr.length })
    } catch (e) {
      console.error(e)
    } finally {
      setUploading(false)
      setUploadProgress({ done: 0, total: 0 })
      loadFiles()
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const deleteFile = async (id) => {
    if (!confirm('Supprimer ce fichier ?')) return
    setDeleting(id)
    await api.delete(`/media/files/${id}/`).catch(() => {})
    setDeleting(null)
    loadFiles()
  }

  const copyUrl = (url, id) => {
    navigator.clipboard.writeText(url).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000) })
  }

  const activeLabel = selected === '__root__' ? 'Racine (sans dossier)'
    : selected ? folders.find(f => f.id === selected)?.name || '…'
    : 'Tous les fichiers'

  return (
    <DashboardLayout title="Gestionnaire de fichiers">
      <div className="flex gap-4 h-[calc(100vh-10rem)] min-h-[500px]">

        {/* Sidebar dossiers */}
        <div className="w-52 shrink-0 flex flex-col gap-1 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: theme.dark.muted }}>Dossiers</p>

          {/* Tous */}
          {[
            { id: null,       label: 'Tous les fichiers' },
            { id: '__root__', label: 'Sans dossier' },
          ].map(({ id, label }) => (
            <button key={String(id)} type="button" onClick={() => setSelected(id)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all cursor-pointer w-full text-left"
              style={{ background: selected === id ? 'rgba(124,58,237,0.12)' : 'transparent', color: selected === id ? '#a78bfa' : theme.dark.mutedLight }}>
              <FolderIcon open={selected === id} /> {label}
            </button>
          ))}

          <div className="border-t my-1" style={{ borderColor: theme.dark.border }} />

          {folders.map(f => (
            <div key={f.id} className="flex items-center gap-1 group">
              <button type="button" onClick={() => setSelected(f.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all cursor-pointer flex-1 text-left"
                style={{ background: selected === f.id ? 'rgba(124,58,237,0.12)' : 'transparent', color: selected === f.id ? '#a78bfa' : theme.dark.mutedLight }}>
                <FolderIcon open={selected === f.id} />
                <span className="truncate">{f.name}</span>
                <span className="ml-auto text-[10px] opacity-50">{f.file_count}</span>
              </button>
              <button type="button" onClick={() => deleteFolder(f.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-400 hover:text-red-300 cursor-pointer transition-all">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                </svg>
              </button>
            </div>
          ))}

          {/* Nouveau dossier */}
          {addingFolder ? (
            <div className="flex items-center gap-1 mt-1">
              <input value={newFolder} onChange={e => setNewFolder(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setAddingFolder(false) }}
                autoFocus className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
                style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}`, color: '#e5e7eb' }}
                placeholder="Nom du dossier" />
              <button type="button" onClick={createFolder} className="text-violet-400 hover:text-violet-300 cursor-pointer px-1">✓</button>
            </div>
          ) : (
            <button type="button" onClick={() => setAddingFolder(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs cursor-pointer transition-colors mt-1"
              style={{ color: theme.dark.muted }}
              onMouseEnter={e => e.currentTarget.style.color = '#7c3aed'}
              onMouseLeave={e => e.currentTarget.style.color = theme.dark.muted}>
              + Nouveau dossier
            </button>
          )}
        </div>

        {/* Contenu principal */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-gray-300 flex-1">{activeLabel}</p>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
              className="text-sm px-3 py-1.5 rounded-xl outline-none w-48"
              style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}`, color: '#d1d5db' }} />
            <input ref={fileInput} type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
              onChange={e => uploadFiles(e.target.files)} className="hidden" />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
              className={theme.btn.primary}>
              {uploading ? `${uploadProgress.done}/${uploadProgress.total} uploadé(s)…` : '+ Importer'}
            </button>
          </div>

          {/* Grille fichiers */}
          <div className="flex-1 overflow-y-auto">
            {files.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48" style={{ color: theme.dark.muted }}>
                <svg className="w-10 h-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <p className="text-sm">Aucun fichier dans ce dossier</p>
                <button type="button" onClick={() => fileInput.current?.click()}
                  className="text-sm mt-2 font-medium" style={{ color: '#7c3aed' }}>
                  Importer des fichiers
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {files.map(file => (
                  <div key={file.id} className="group rounded-xl border overflow-hidden cursor-default transition-all"
                    style={{ background: theme.dark.card, borderColor: theme.dark.border }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#7c3aed'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = theme.dark.border}>
                    {/* Thumbnail */}
                    <div className="aspect-square flex items-center justify-center overflow-hidden"
                      style={{ background: theme.dark.app }}>
                      {file.mime_type?.startsWith('image/') && file.url
                        ? <img src={file.url} alt={file.original_name} className="w-full h-full object-cover" />
                        : <FileIcon mime={file.mime_type} />}
                    </div>
                    {/* Info */}
                    <div className="p-2">
                      <p className="text-[11px] text-gray-300 truncate" title={file.original_name}>{file.original_name}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: theme.dark.muted }}>{formatSize(file.size)}</p>
                      <div className="flex gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={() => copyUrl(file.url, file.id)}
                          className="flex-1 text-[10px] py-0.5 rounded text-center cursor-pointer transition-colors"
                          style={{ background: copied === file.id ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.06)', color: copied === file.id ? '#a78bfa' : '#9ca3af' }}>
                          {copied === file.id ? 'Copié !' : 'Copier URL'}
                        </button>
                        <button type="button" onClick={() => deleteFile(file.id)} disabled={deleting === file.id}
                          className="px-1.5 py-0.5 rounded text-red-400 hover:text-red-300 cursor-pointer text-[10px]"
                          style={{ background: 'rgba(248,113,113,0.1)' }}>
                          {deleting === file.id ? '…' : '✕'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
