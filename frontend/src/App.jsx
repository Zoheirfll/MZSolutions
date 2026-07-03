import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import PrivateRoute from './components/PrivateRoute'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import StorePage from './pages/StorePage'
import ComingSoon from './pages/ComingSoon'
import TeamPage from './pages/TeamPage'
import AcceptInvitation from './pages/AcceptInvitation'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import StockPage from './pages/StockPage'
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
import CancellationsPage from './pages/orders/CancellationsPage'
import OrderDetailPage from './pages/orders/OrderDetailPage'
import FailureReasonsPage from './pages/orders/FailureReasonsPage'
import ConfirmationRatePage from './pages/orders/ConfirmationRatePage'
import AbandonedCartsPage from './pages/orders/AbandonedCartsPage'
import ComplaintsPage from './pages/orders/ComplaintsPage'
import ComplaintDetailPage from './pages/orders/ComplaintDetailPage'
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

function PD({ children }) {
  return <PrivateRoute>{children}</PrivateRoute>
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

          <Route path="/dashboard"                           element={<PD><Dashboard /></PD>} />
          <Route path="/dashboard/boutique"                  element={<PD><StorePage /></PD>} />
          <Route path="/dashboard/boutique/theme"            element={<PD><ThemePage /></PD>} />
          <Route path="/dashboard/boutique/pages"            element={<PD><PagesPage /></PD>} />
          <Route path="/dashboard/boutique/pages/nouvelle"   element={<PD><PageFormPage /></PD>} />
          <Route path="/dashboard/boutique/pages/:id/modifier" element={<PD><PageFormPage /></PD>} />
          <Route path="/dashboard/boutique/menu"             element={<PD><MenuPage /></PD>} />
          <Route path="/dashboard/boutique/fichiers"         element={<PD><FileManagerPage /></PD>} />
          <Route path="/dashboard/stock"                     element={<PD><StockPage /></PD>} />
          <Route path="/dashboard/parametres-livraison"      element={<PD><ParametresLivraisonPage /></PD>} />
          <Route path="/dashboard/produits"                  element={<PD><ProductsPage /></PD>} />
          <Route path="/dashboard/produits/nouveau"          element={<PD><ProductFormPage /></PD>} />
          <Route path="/dashboard/produits/:id/modifier"     element={<PD><ProductFormPage /></PD>} />
          <Route path="/dashboard/produits/categories"       element={<PD><CategoriesPage /></PD>} />
          <Route path="/dashboard/produits/fournisseurs"              element={<PD><SuppliersPage /></PD>} />
          <Route path="/dashboard/produits/fournisseurs/credits"    element={<PD><SupplierCreditPage /></PD>} />
          <Route path="/dashboard/produits/fournisseurs/versements"  element={<PD><SupplierPaymentPage /></PD>} />
          <Route path="/dashboard/produits/avis"             element={<PD><ReviewsPage /></PD>} />
          <Route path="/dashboard/produits/promotions/coupons" element={<PD><CouponsPage /></PD>} />
          <Route path="/dashboard/produits/promotions/auto"    element={<PD><AutoPromotionsPage /></PD>} />
          <Route path="/dashboard/commandes"                 element={<PD><OrdersPage /></PD>} />
          <Route path="/dashboard/commandes/nouvelle"                    element={<PD><OrderFormPage /></PD>} />
          <Route path="/dashboard/commandes/raisons-echec"                element={<PD><FailureReasonsPage /></PD>} />
          <Route path="/dashboard/commandes/taux-confirmation"           element={<PD><ConfirmationRatePage /></PD>} />
          <Route path="/dashboard/commandes/:id"                         element={<PD><OrderDetailPage /></PD>} />
          <Route path="/dashboard/commandes/paniers-abandonnes"           element={<PD><AbandonedCartsPage /></PD>} />
          <Route path="/dashboard/commandes/annulations/demandes"       element={<PD><CancellationsPage mode="requests" /></PD>} />
          <Route path="/dashboard/commandes/annulations/confirmees"     element={<PD><CancellationsPage mode="confirmed" /></PD>} />
          <Route path="/dashboard/reclamations"                          element={<PD><ComplaintsPage /></PD>} />
          <Route path="/dashboard/reclamations/:id"                      element={<PD><ComplaintDetailPage /></PD>} />
          <Route path="/dashboard/echanges"                              element={<PD><ExchangesPage /></PD>} />
          <Route path="/dashboard/echanges/:id"                          element={<PD><ExchangeDetailPage /></PD>} />
          <Route path="/dashboard/clients"                   element={<PD><ClientsPage /></PD>} />
          <Route path="/dashboard/clients/risque"            element={<PD><AtRiskCustomersPage /></PD>} />
          <Route path="/dashboard/clients/liste-noire"        element={<PD><BlacklistPage /></PD>} />
          <Route path="/dashboard/dropshipping"               element={<PD><DropshippersPage /></PD>} />
          <Route path="/dashboard/dropshipping/:id"           element={<PD><DropshipperDetailPage /></PD>} />
          <Route path="/dashboard/mes-produits"               element={<PD><DropshipperMyProductsPage /></PD>} />
          <Route path="/dashboard/mes-commissions"            element={<PD><DropshipperMyEarningsPage /></PD>} />
          <Route path="/dashboard/expeditions"               element={<PD><ComingSoon title="Expéditions & Retours" /></PD>} />
          <Route path="/dashboard/stats"                     element={<PD><ComingSoon title="Statistiques" /></PD>} />
          <Route path="/dashboard/equipe"                    element={<PD><TeamPage /></PD>} />
          <Route path="/dashboard/abonnement"                element={<PD><ComingSoon title="Abonnement" /></PD>} />

          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
