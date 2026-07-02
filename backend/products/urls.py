from django.urls import path
from .views import (
    CategoryListCreateView, CategoryDetailView, CategoryRestoreView,
    ProductListCreateView, ProductDetailView, ProductImageView,
    ProductVariantView, ProductVariantDetailView,
    VariantOptionView, VariantOptionDetailView,
    LowStockView,
    SupplierListCreateView, SupplierDetailView,
    SupplierCreditView, SupplierCreditDetailView,
    SupplierPaymentView, SupplierPaymentDetailView,
    SupplierBalanceView,
    AllCreditsView, AllPaymentsView,
    ProductReviewListView, ProductReviewDetailView, PublicReviewView,
)

urlpatterns = [
    # Products
    path('',                                               ProductListCreateView.as_view()),
    path('<int:pk>/',                                      ProductDetailView.as_view()),
    path('<int:pk>/images/',                               ProductImageView.as_view()),
    path('<int:pk>/images/<int:img_id>/',                  ProductImageView.as_view()),

    # Variants
    path('<int:pk>/variants/',                             ProductVariantView.as_view()),
    path('<int:pk>/variants/<int:vid>/',                   ProductVariantDetailView.as_view()),
    path('<int:pk>/variants/<int:vid>/options/',           VariantOptionView.as_view()),
    path('<int:pk>/variants/<int:vid>/options/<int:oid>/', VariantOptionDetailView.as_view()),

    # Categories
    path('categories/',                                    CategoryListCreateView.as_view()),
    path('categories/<int:pk>/',                           CategoryDetailView.as_view()),
    path('categories/<int:pk>/restore/',                   CategoryRestoreView.as_view()),

    # Low-stock
    path('low-stock/',                                     LowStockView.as_view()),

    # Suppliers CRUD
    path('suppliers/',                                     SupplierListCreateView.as_view()),
    path('suppliers/<int:pk>/',                            SupplierDetailView.as_view()),

    # Supplier credits (par fournisseur)
    path('suppliers/<int:pk>/credits/',                    SupplierCreditView.as_view()),
    path('suppliers/<int:pk>/credits/<int:cid>/',          SupplierCreditDetailView.as_view()),

    # Supplier payments (par fournisseur)
    path('suppliers/<int:pk>/payments/',                   SupplierPaymentView.as_view()),
    path('suppliers/<int:pk>/payments/<int:pid>/',         SupplierPaymentDetailView.as_view()),

    # Supplier balance
    path('suppliers/<int:pk>/balance/',                    SupplierBalanceView.as_view()),

    # Vues globales (toutes boutique — pour les pages Crédit/Versement cross-supplier)
    path('supplier-credits/',                              AllCreditsView.as_view()),
    path('supplier-payments/',                             AllPaymentsView.as_view()),

    # Reviews
    path('reviews/',                                       ProductReviewListView.as_view()),
    path('reviews/<int:pk>/',                              ProductReviewDetailView.as_view()),
]
