import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import StorefrontLayout from './StorefrontLayout'
import Select from '../../components/Select'
import publicApi from '../../api/publicApi'
import { theme } from '../../theme'
import { useTranslation } from 'react-i18next'

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function ExchangeFormPage() {
  const { t } = useTranslation('storefront')
  const { slug } = useParams()

  const [orderId, setOrderId] = useState('')
  const [phone, setPhone]     = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [items, setItems] = useState(null) // null = pas encore cherché

  const [selectedItemId, setSelectedItemId] = useState('')
  const [selectedOptionId, setSelectedOptionId] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [sent, setSent]     = useState(false)

  const selectedItem = items?.find(i => String(i.id) === String(selectedItemId))

  const searchOrder = async e => {
    e.preventDefault()
    setSearching(true)
    setSearchError('')
    setItems(null)
    try {
      const { data } = await publicApi.get(`/store/${slug}/order-items/`, { params: { order_id: orderId, phone } })
      setItems(data.items)
      if (data.items.length === 1) setSelectedItemId(data.items[0].id)
      if (data.items.length === 0) setSearchError(t('exchange.noItems'))
    } catch (err) {
      setSearchError(err.response?.data?.detail || t('common.genericError'))
    } finally {
      setSearching(false)
    }
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await publicApi.post('/exchanges/', {
        store_slug: slug, order_id: orderId, phone,
        order_item_id: selectedItemId, replacement_option_id: selectedOptionId, reason,
      })
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.detail || t('common.sendError'))
    } finally {
      setSaving(false)
    }
  }

  if (sent) {
    return (
      <StorefrontLayout>
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <div className={`${theme.badge.success} inline-flex! w-16! h-16! rounded-full! p-0! items-center justify-center mb-4`}>
            <CheckIcon className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('exchange.sentTitle')}</h1>
          <p className="text-gray-500 mb-6">{t('exchange.sentText')}</p>
          <Link to={`/store/${slug}`} className={theme.btn.primary}>
            {t('common.backToStore')}
          </Link>
        </div>
      </StorefrontLayout>
    )
  }

  return (
    <StorefrontLayout>
      <div className="max-w-lg mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('exchange.title')}</h1>
        <p className="text-sm text-gray-500 mb-8">{t('exchange.intro')}</p>

        {/* Étape 1 — retrouver la commande */}
        <form onSubmit={searchOrder} className={`${theme.panel} space-y-4 mb-6`}>
          <div>
            <label className={theme.label}>{t('common.phoneLabel')}</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} required
              className={theme.input} placeholder="+213…" />
          </div>
          <div>
            <label className={theme.label}>{t('common.orderNumberOptional')}</label>
            <input value={orderId} onChange={e => setOrderId(e.target.value)}
              className={theme.input} placeholder={t("exchange.orderPlaceholder")} />
          </div>
          {searchError && <p className={theme.errorText}>{searchError}</p>}
          <button type="submit" disabled={searching} className={`${theme.btn.outlineLight} w-full`}>
            {searching ? t('exchange.searching') : t('exchange.findOrder')}
          </button>
        </form>

        {/* Étape 2 — choisir l'article + la variante de remplacement */}
        {items?.length > 0 && (
          <form onSubmit={handleSubmit} className={`${theme.panel} space-y-4`}>
            <div>
              <label className={theme.label}>{t('exchange.itemLabel')}</label>
              <div className="space-y-2">
                {items.map(item => (
                  <label key={item.id} className={`flex items-center gap-3 cursor-pointer rounded-xl border p-3 transition ${
                    String(selectedItemId) === String(item.id) ? 'border-violet-500 bg-violet-50/50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input type="radio" name="item" checked={String(selectedItemId) === String(item.id)}
                      onChange={() => { setSelectedItemId(item.id); setSelectedOptionId('') }} className="accent-violet-600 w-4 h-4" />
                    <span className="text-sm text-gray-700">
                      {item.product_name}{item.current_option ? ` — ${item.current_option}` : ''} (x{item.quantity})
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {selectedItem && (
              <div>
                <label className={theme.label}>{t('exchange.variantLabel')}</label>
                {selectedItem.replacement_options.length === 0 ? (
                  <p className="text-xs text-gray-400">{t('exchange.noVariant')}</p>
                ) : (
                  <Select
                    value={selectedOptionId}
                    onChange={setSelectedOptionId}
                    options={selectedItem.replacement_options.map(o => ({ value: o.id, label: `${o.variant_name} : ${o.value}` }))}
                    placeholder={t("exchange.chooseVariant")}
                    className={theme.input}
                    variant="light"
                  />
                )}
              </div>
            )}

            <div>
              <label className={theme.label}>{t('exchange.reason')}</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} required rows={4}
                className={theme.input} placeholder={t("exchange.reasonPlaceholder")} />
            </div>

            {error && <p className={theme.errorText}>{error}</p>}

            <button type="submit" disabled={saving || !selectedItemId || !selectedOptionId} className={`${theme.btn.primary} w-full disabled:opacity-50`}>
              {saving ? t('common.sending') : t('exchange.submit')}
            </button>
          </form>
        )}
      </div>
    </StorefrontLayout>
  )
}
