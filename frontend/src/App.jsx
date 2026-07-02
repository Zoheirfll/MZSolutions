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
import ProductsPage from './pages/products/ProductsPage'
import ProductFormPage from './pages/products/ProductFormPage'
import CategoriesPage from './pages/products/CategoriesPage'
import SuppliersPage from './pages/products/SuppliersPage'
import SupplierCreditPage from './pages/products/SupplierCreditPage'
import SupplierPaymentPage from './pages/products/SupplierPaymentPage'
import ReviewsPage from './pages/products/ReviewsPage'
import OrdersPage from './pages/orders/OrdersPage'
import OrderFormPage from './pages/orders/OrderFormPage'
import CancellationsPage from './pages/orders/CancellationsPage'
import OrderDetailPage from './pages/orders/OrderDetailPage'
import FailureReasonsPage from './pages/orders/FailureReasonsPage'
import ConfirmationRatePage from './pages/orders/ConfirmationRatePage'
import StorefrontHomePage from './pages/storefront/StorefrontHomePage'
import StorefrontProductsPage from './pages/storefront/StorefrontProductsPage'
import StorefrontProductPage from './pages/storefront/StorefrontProductPage'
import CheckoutPage from './pages/storefront/CheckoutPage'

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

          <Route path="/auth"             element={<Auth />} />
          <Route path="/forgot-password"  element={<ForgotPassword />} />
          <Route path="/reset-password"   element={<ResetPassword />} />
          <Route path="/accept-invitation" element={<AcceptInvitation />} />

          <Route path="/dashboard"                           element={<PD><Dashboard /></PD>} />
          <Route path="/dashboard/boutique"                  element={<PD><StorePage /></PD>} />
          <Route path="/dashboard/stock"                     element={<PD><StockPage /></PD>} />
          <Route path="/dashboard/produits"                  element={<PD><ProductsPage /></PD>} />
          <Route path="/dashboard/produits/nouveau"          element={<PD><ProductFormPage /></PD>} />
          <Route path="/dashboard/produits/:id/modifier"     element={<PD><ProductFormPage /></PD>} />
          <Route path="/dashboard/produits/categories"       element={<PD><CategoriesPage /></PD>} />
          <Route path="/dashboard/produits/fournisseurs"              element={<PD><SuppliersPage /></PD>} />
          <Route path="/dashboard/produits/fournisseurs/credits"    element={<PD><SupplierCreditPage /></PD>} />
          <Route path="/dashboard/produits/fournisseurs/versements"  element={<PD><SupplierPaymentPage /></PD>} />
          <Route path="/dashboard/produits/avis"             element={<PD><ReviewsPage /></PD>} />
          <Route path="/dashboard/commandes"                 element={<PD><OrdersPage /></PD>} />
          <Route path="/dashboard/commandes/nouvelle"                    element={<PD><OrderFormPage /></PD>} />
          <Route path="/dashboard/commandes/raisons-echec"                element={<PD><FailureReasonsPage /></PD>} />
          <Route path="/dashboard/commandes/taux-confirmation"           element={<PD><ConfirmationRatePage /></PD>} />
          <Route path="/dashboard/commandes/:id"                         element={<PD><OrderDetailPage /></PD>} />
          <Route path="/dashboard/commandes/annulations/demandes"       element={<PD><CancellationsPage mode="requests" /></PD>} />
          <Route path="/dashboard/commandes/annulations/confirmees"     element={<PD><CancellationsPage mode="confirmed" /></PD>} />
          <Route path="/dashboard/clients"                   element={<PD><ComingSoon title="Clients" /></PD>} />
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
