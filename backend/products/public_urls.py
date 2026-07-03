from django.urls import path
from .views import (PublicStoreView, PublicCategoryListView, PublicProductListView,
                    PublicProductDetailView, PublicStorePageListView, PublicStorePageView,
                    PublicPromoValidateView, PublicCatalogFeedView)
from orders.views import PublicOrderItemsView

urlpatterns = [
    path('',                        PublicStoreView.as_view()),
    path('categories/',             PublicCategoryListView.as_view()),
    path('products/',               PublicProductListView.as_view()),
    path('products/<int:pk>/',      PublicProductDetailView.as_view()),
    path('pages/',                  PublicStorePageListView.as_view()),
    path('pages/<slug:page_slug>/', PublicStorePageView.as_view()),
    path('promo/<str:code>/',       PublicPromoValidateView.as_view()),
    path('order-items/',            PublicOrderItemsView.as_view()),
    path('catalog.xml',             PublicCatalogFeedView.as_view()),
]
