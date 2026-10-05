import { useTranslation } from 'react-i18next'
import { theme } from '../../theme'
import { AdminError, AdminEmpty } from './AdminState'

// Liste générique des pages admin : recherche, pagination serveur, états
// erreur/vide, actions par ligne. Un seul pattern pour toutes les listes.
// columns : [{ key, label, render?(row) }] — rowActions?(row) rend les boutons de fin de ligne.
export default function AdminList({
  columns, rows, total, page, perPage, onPage,
  search, onSearch, loading, error, onRetry, rowActions,
}) {
  const { t } = useTranslation()
  const pages = Math.max(1, Math.ceil((total || 0) / (perPage || 20)))

  return (
    <div>
      {onSearch && (
        <input value={search || ''} onChange={(e) => onSearch(e.target.value)} placeholder={t('Rechercher…')}
          className={`${theme.inputDark} mb-4 max-w-sm`} />
      )}

      {error ? <AdminError message={error} onRetry={onRetry} />
        : rows.length === 0 && !loading ? <AdminEmpty />
        : (
          <div className="rounded-xl border overflow-x-auto" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {columns.map((c) => <th key={c.key} className="text-start px-4 py-3 text-xs font-medium text-app-muted">{c.label}</th>)}
                  {rowActions && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: theme.dark.border }}>
                    {columns.map((c) => <td key={c.key} className="px-4 py-3 text-app-primary">{c.render ? c.render(r) : r[c.key]}</td>)}
                    {rowActions && <td className="px-4 py-3 text-end">{rowActions(r)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-app-muted">
          <span>{t('Page {{page}} / {{pages}}', { page, pages })}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => onPage(page - 1)} className={theme.btn.outline}>{t('Précédent')}</button>
            <button disabled={page >= pages} onClick={() => onPage(page + 1)} className={theme.btn.outline}>{t('Suivant')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
