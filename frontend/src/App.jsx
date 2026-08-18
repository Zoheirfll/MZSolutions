import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import PrivateRoute from './components/PrivateRoute'
import { useAuth } from './context/AuthContext'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import StorePage from './pages/StorePage'
import FaqPage from './pages/FaqPage'
import ContactPage from './pages/ContactPage'
import ParametresPage from './pages/ParametresPage'
import ComingSoon from './pages/ComingSoon'
import TeamPage from './pages/TeamPage'
import PermissionsPage from './pages/PermissionsPage'
import AuditPage from './pages/AuditPage'
import SalesChannelsPage from './pages/SalesChannelsPage'
import MarketingPixelsPage from './pages/MarketingPixelsPage'
import WebhooksPage from './pages/WebhooksPage'
import SubscriptionPage from './pages/SubscriptionPage'
import AcceptInvitation from './pages/AcceptInvitation'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import StockPage from './pages/StockPage'
import StockMovementsPage from './pages/products/StockMovementsPage'
import BackToSellerPage from './pages/products/BackToSellerPage'
import ParametresLivraisonPage from './pages/ParametresLivraisonPage'
import ProductsPage from './pages/products/ProductsPage'
import ProductFormPage from './pages/products/ProductFormPage'
import CategoriesPage from './pages/products/CategoriesPage'
import SuppliersPage from './pages/products/SuppliersPage'
import SupplierCreditPage from './pages/products/SupplierCreditPage'
import SupplierPaymentPage from './pages/products/SupplierPaymentPage'
import ReviewsPage from './pages/products/ReviewsPage'
import CouponsPage from './pages/products/CouponsPage'
import AutoPromotionsPage from './pages/products/AutoPromotionsPage'
import OrdersPage from './pages/orders/OrdersPage'
import OrderFormPage from './pages/orders/OrderFormPage'
import ScheduledOrdersPage from './pages/orders/ScheduledOrdersPage'
import DispatchByConfirmateurPage from './pages/orders/DispatchByConfirmateurPage'
import DispatchByCarrierPage from './pages/orders/DispatchByCarrierPage'
import DispatchByWilayaPage from './pages/orders/DispatchByWilayaPage'
import CancellationsPage from './pages/orders/CancellationsPage'
import ShipmentsPage from './pages/orders/ShipmentsPage'
import LabelsPage from './pages/orders/LabelsPage'
import PreparedOrdersPage from './pages/orders/PreparedOrdersPage'
import PredictiveReturnsPage from './pages/orders/PredictiveReturnsPage'
import ReturnValidationPage from './pages/orders/ReturnValidationPage'
import OrderDetailPage from './pages/orders/OrderDetailPage'
import FailureReasonsPage from './pages/orders/FailureReasonsPage'
import ConfirmationRatePage from './pages/orders/ConfirmationRatePage'
import AbandonedCartsPage from './pages/orders/AbandonedCartsPage'
import InboxPage from './pages/inbox/InboxPage'
import ExchangesPage from './pages/orders/ExchangesPage'
import ExchangeDetailPage from './pages/orders/ExchangeDetailPage'
import ClientsPage from './pages/customers/ClientsPage'
import AtRiskCustomersPage from './pages/customers/AtRiskCustomersPage'
import BlacklistPage from './pages/customers/BlacklistPage'
import ThemePage from './pages/boutique/ThemePage'
import PagesPage from './pages/boutique/PagesPage'
import PageFormPage from './pages/boutique/PageFormPage'
import MenuPage from './pages/boutique/MenuPage'
import FileManagerPage from './pages/boutique/FileManagerPage'
import StorefrontHomePage from './pages/storefront/StorefrontHomePage'
import StorefrontPagePage from './pages/storefront/StorefrontPagePage'
import StorefrontProductsPage from './pages/storefront/StorefrontProductsPage'
import StorefrontProductPage from './pages/storefront/StorefrontProductPage'
import CheckoutPage from './pages/storefront/CheckoutPage'
import ComplaintFormPage from './pages/storefront/ComplaintFormPage'
import ExchangeFormPage from './pages/storefront/ExchangeFormPage'
import DropshippersPage from './pages/dropshipping/DropshippersPage'
import DropshipperDetailPage from './pages/dropshipping/DropshipperDetailPage'
import DropshipperMyProductsPage from './pages/dropshipping/DropshipperMyProductsPage'
import DropshipperMyEarningsPage from './pages/dropshipping/DropshipperMyEarningsPage'
import CostsPage from './pages/finance/CostsPage'
import GlobalStatsPage from './pages/orders/stats/GlobalStatsPage'
import OrdersStatsPage from './pages/orders/stats/OrdersStatsPage'
import ReturnsStatsPage from './pages/orders/stats/ReturnsStatsPage'
import FailuresStatsPage from './pages/orders/stats/FailuresStatsPage'
import StockSalesStatsPage from './pages/orders/stats/StockSalesStatsPage'
import ProductsStatsPage from './pages/orders/stats/ProductsStatsPage'
import WilayaStatsPage from './pages/orders/stats/WilayaStatsPage'
import SourceStatsPage from './pages/orders/stats/SourceStatsPage'
import ProfitabilityPage from './pages/finance/ProfitabilityPage'
import PaymentReadyPage from './pages/finance/PaymentReadyPage'
import PaymentCollectedPage from './pages/finance/PaymentCollectedPage'
import PaymentsExcelUploadPage from './pages/finance/PaymentsExcelUploadPage'

// `perm` gate applied on top of authentication — sans ça, seule la sidebar masquait un lien,
// n'importe quel membre authentifié pouvait accéder à n'importe quelle page en tapant l'URL.
// Miroir exact de la logique de visibilité de la sidebar (DashboardLayout.jsx).
function PD({ children, perm }) {
  return (
    <PrivateRoute>
      <PermGate perm={perm}>{children}</PermGate>
    </PrivateRoute>
  )
}

function PermGate({ children, perm }) {
  const { user } = useAuth()
  if (!perm) return children
  const teamRole = user?.team_role || null
  const can = key => !!user?.permissions?.[key]
  const ownerOrAdmin = !teamRole || teamRole === 'admin'
  const checkOne = p => {
    if (p === 'ownerAdmin') return ownerOrAdmin
    if (p === 'confirmateur' || p === 'dropshipper' || p === 'admin') return teamRole === p
    if (p === 'dropshipping_view_notDropshipper') return teamRole !== 'dropshipper' && can('dropshipping_view')
    return can(p)
  }
  const allowed = Array.isArray(perm) ? perm.some(checkOne) : checkOne(perm)
  return allowed ? children : <Navigate to="/dashboard/parametres" replace />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
        <Routes>
          {/* Storefront public */}
          <Route path="/store/:slug"                       element={<StorefrontHomePage />} />
          <Route path="/store/:slug/products"              element={<StorefrontProductsPage />} />
          <Route path="/store/:slug/products/:productId"   element={<StorefrontProductPage />} />
          <Route path="/store/:slug/checkout"              element={<CheckoutPage />} />
          <Route path="/store/:slug/reclamation"           element={<ComplaintFormPage />} />
          <Route path="/store/:slug/echange"               element={<ExchangeFormPage />} />
          <Route path="/store/:slug/pages/:pageSlug"      element={<StorefrontPagePage />} />

          <Route path="/auth"             element={<Auth />} />
          <Route path="/forgot-password"  element={<ForgotPassword />} />
          <Route path="/reset-password"   element={<ResetPassword />} />
          <Route path="/accept-invitation" element={<AcceptInvitation />} />

          <Route path="/dashboard"                           element={<PD perm={['dashboard_view', 'confirmateur']}><Dashboard /></PD>} />
          <Route path="/dashboard/boutique"                  element={<PD perm="store_view"><StorePage /></PD>} />
          <Route path="/dashboard/parametres"                element={<PD><ParametresPage /></PD>} />
          <Route path="/dashboard/faq"                       element={<PD><FaqPage /></PD>} />
          <Route path="/dashboard/contact"                   element={<PD><ContactPage /></PD>} />
          <Route path="/dashboard/boutique/theme"            element={<PD perm="store_theme_view"><ThemePage /></PD>} />
          <Route path="/dashboard/boutique/pages"            element={<PD perm="store_pages_view"><PagesPage /></PD>} />
          <Route path="/dashboard/boutique/pages/nouvelle"   element={<PD perm="store_pages_view"><PageFormPage /></PD>} />
          <Route path="/dashboard/boutique/pages/:id/modifier" element={<PD perm="store_pages_view"><PageFormPage /></PD>} />
          <Route path="/dashboard/boutique/menu"             element={<PD perm="store_menu_view"><MenuPage /></PD>} />
          <Route path="/dashboard/boutique/fichiers"         element={<PD perm="store_files_view"><FileManagerPage /></PD>} />
          <Route path="/dashboard/stock"                     element={<PD perm="stock_view"><StockPage /></PD>} />
          <Route path="/dashboard/stock/mouvements"          element={<PD perm="stock_movements_view"><StockMovementsPage /></PD>} />
          <Route path="/dashboard/stock/retour-vendeur"      element={<PD perm="stock_return_view"><BackToSellerPage /></PD>} />
          <Route path="/dashboard/parametres-livraison"      element={<PD perm="shipping_settings_view"><ParametresLivraisonPage /></PD>} />
          <Route path="/dashboard/produits"                  element={<PD perm="products_view"><ProductsPage /></PD>} />
          <Route path="/dashboard/produits/nouveau"          element={<PD perm="products_view"><ProductFormPage /></PD>} />
          <Route path="/dashboard/produits/:id/modifier"     element={<PD perm="products_view"><ProductFormPage /></PD>} />
          <Route path="/dashboard/produits/categories"       element={<PD perm="categories_view"><CategoriesPage /></PD>} />
          <Route path="/dashboard/produits/fournisseurs"              element={<PD perm="suppliers_view"><SuppliersPage /></PD>} />
          <Route path="/dashboard/produits/fournisseurs/credits"    element={<PD perm="supplier_credits_view"><SupplierCreditPage /></PD>} />
          <Route path="/dashboard/produits/fournisseurs/versements"  element={<PD perm="supplier_payments_view"><SupplierPaymentPage /></PD>} />
          <Route path="/dashboard/produits/avis"             element={<PD perm="reviews_view"><ReviewsPage /></PD>} />
          <Route path="/dashboard/produits/promotions/coupons" element={<PD perm="coupons_view"><CouponsPage /></PD>} />
          <Route path="/dashboard/produits/promotions/auto"    element={<PD perm="auto_promotions_view"><AutoPromotionsPage /></PD>} />
          <Route path="/dashboard/commandes"                 element={<PD perm="orders_view"><OrdersPage /></PD>} />
          <Route path="/dashboard/commandes/nouvelle"                    element={<PD perm="orders_create_view"><OrderFormPage /></PD>} />
          <Route path="/dashboard/commandes/programmees"                 element={<PD perm="orders_scheduled_view"><ScheduledOrdersPage /></PD>} />
          <Route path="/dashboard/dispatch/confirmateur"                 element={<PD perm="dispatch_confirmateur_view"><DispatchByConfirmateurPage /></PD>} />
          <Route path="/dashboard/dispatch/transporteur"                 element={<PD perm="dispatch_carrier_view"><DispatchByCarrierPage /></PD>} />
          <Route path="/dashboard/dispatch/wilaya"                       element={<PD perm="dispatch_wilaya_view"><DispatchByWilayaPage /></PD>} />
          <Route path="/dashboard/commandes/raisons-echec"                element={<PD perm="failure_reasons_view"><FailureReasonsPage /></PD>} />
          <Route path="/dashboard/commandes/taux-confirmation"           element={<PD perm="confirmation_rate_view"><ConfirmationRatePage /></PD>} />
          <Route path="/dashboard/commandes/:id"                         element={<PD perm="orders_view"><OrderDetailPage /></PD>} />
          <Route path="/dashboard/commandes/paniers-abandonnes"           element={<PD perm="abandoned_carts_view"><AbandonedCartsPage /></PD>} />
          <Route path="/dashboard/commandes/annulations/demandes"       element={<PD perm="cancellation_requests_view"><CancellationsPage mode="requests" /></PD>} />
          <Route path="/dashboard/commandes/annulations/confirmees"     element={<PD perm="cancellation_confirmed_view"><CancellationsPage mode="confirmed" /></PD>} />
          <Route path="/dashboard/expeditions"                          element={<PD perm="shipments_view"><ShipmentsPage /></PD>} />
          <Route path="/dashboard/boite-reception"                        element={<PD perm="inbox_view"><InboxPage /></PD>} />
          <Route path="/dashboard/boite-reception/:id"                    element={<PD perm="inbox_view"><InboxPage /></PD>} />
          <Route path="/dashboard/echanges"                              element={<PD perm="exchanges_view"><ExchangesPage /></PD>} />
          <Route path="/dashboard/echanges/:id"                          element={<PD perm="exchanges_view"><ExchangeDetailPage /></PD>} />
          <Route path="/dashboard/clients"                   element={<PD perm="clients_view"><ClientsPage /></PD>} />
          <Route path="/dashboard/clients/risque"            element={<PD perm="clients_risk_view"><AtRiskCustomersPage /></PD>} />
          <Route path="/dashboard/clients/liste-noire"        element={<PD perm="blacklist_view"><BlacklistPage /></PD>} />
          <Route path="/dashboard/dropshipping"               element={<PD perm="dropshipping_view_notDropshipper"><DropshippersPage /></PD>} />
          <Route path="/dashboard/dropshipping/:id"           element={<PD perm="dropshipping_view_notDropshipper"><DropshipperDetailPage /></PD>} />
          <Route path="/dashboard/mes-produits"               element={<PD perm="dropshipper"><DropshipperMyProductsPage /></PD>} />
          <Route path="/dashboard/mes-commissions"            element={<PD perm="dropshipper"><DropshipperMyEarningsPage /></PD>} />
          <Route path="/dashboard/finances/couts"             element={<PD perm="costs_view"><CostsPage /></PD>} />
          <Route path="/dashboard/finances/rentabilite"       element={<PD perm="profitability_view"><ProfitabilityPage /></PD>} />
          <Route path="/dashboard/paiements/pret"             element={<PD perm="payments_ready_view"><PaymentReadyPage /></PD>} />
          <Route path="/dashboard/paiements/recupere"         element={<PD perm="payments_collected_view"><PaymentCollectedPage /></PD>} />
          <Route path="/dashboard/paiements/import-excel"     element={<PD perm="payments_import_view"><PaymentsExcelUploadPage /></PD>} />
          <Route path="/dashboard/canaux-vente"               element={<PD perm="channels_view"><SalesChannelsPage /></PD>} />
          <Route path="/dashboard/marketing"                  element={<PD perm="marketing_view"><MarketingPixelsPage /></PD>} />
          <Route path="/dashboard/webhooks"                   element={<PD perm="webhooks_view"><WebhooksPage /></PD>} />
          <Route path="/dashboard/expeditions/etiquettes"     element={<PD perm="labels_view"><LabelsPage /></PD>} />
          <Route path="/dashboard/expeditions/preparees"      element={<PD perm="prepared_orders_view"><PreparedOrdersPage /></PD>} />
          <Route path="/dashboard/expeditions/retour-predictif" element={<PD perm="predictive_returns_view"><PredictiveReturnsPage /></PD>} />
          <Route path="/dashboard/expeditions/retours"        element={<PD perm="return_validation_view"><ReturnValidationPage /></PD>} />
          <Route path="/dashboard/stats"                     element={<PD perm="stats_global_view"><GlobalStatsPage /></PD>} />
          <Route path="/dashboard/stats/commandes"           element={<PD perm="stats_orders_view"><OrdersStatsPage /></PD>} />
          <Route path="/dashboard/stats/retours"             element={<PD perm="stats_returns_view"><ReturnsStatsPage /></PD>} />
          <Route path="/dashboard/stats/echecs"              element={<PD perm="stats_failures_view"><FailuresStatsPage /></PD>} />
          <Route path="/dashboard/stats/vente-stock"         element={<PD perm="stats_stock_sales_view"><StockSalesStatsPage /></PD>} />
          <Route path="/dashboard/stats/produits"            element={<PD perm="stats_products_view"><ProductsStatsPage /></PD>} />
          <Route path="/dashboard/stats/confirmateurs"       element={<PD perm="stats_confirmateurs_view"><ConfirmationRatePage /></PD>} />
          <Route path="/dashboard/stats/wilayas"             element={<PD perm="stats_wilayas_view"><WilayaStatsPage /></PD>} />
          <Route path="/dashboard/stats/sources"             element={<PD perm="stats_sources_view"><SourceStatsPage /></PD>} />
          <Route path="/dashboard/equipe"                    element={<PD perm="team_view"><TeamPage /></PD>} />
          <Route path="/dashboard/equipe/permissions"        element={<PD perm="ownerAdmin"><PermissionsPage /></PD>} />
          <Route path="/dashboard/audit"                     element={<PD perm="audit_view"><AuditPage /></PD>} />
          <Route path="/dashboard/abonnement"                element={<PD perm="subscription_view"><SubscriptionPage /></PD>} />

          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
