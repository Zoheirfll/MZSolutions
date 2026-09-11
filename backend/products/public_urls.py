from django.urls import path
from .views import (PublicStoreView, PublicCategoryListView, PublicProductListView,
                    PublicProductDetailView, PublicStorePageListView, PublicStorePageView,
                    PublicPromoValidateView, PublicCatalogFeedView, PublicSitemapView,
                    PublicProductRecommendationsView, PublicCartRecommendationsView)
from orders.views import PublicOrderItemsView, PublicShippingRateView, PublicDesksView
from ai_assistant.public_views import PublicChatView, PublicChatHistoryView

urlpatterns = [
    path('',                        PublicStoreView.as_view()),
    path('categories/',             PublicCategoryListView.as_view()),
    path('products/',               PublicProductListView.as_view()),
    path('products/<str:pk>/',      PublicProductDetailView.as_view()),
    path('products/<int:pk>/recommendations/', PublicProductRecommendationsView.as_view()),
    path('cart-recommendations/',               PublicCartRecommendationsView.as_view()),
    path('pages/',                  PublicStorePageListView.as_view()),
    path('pages/<slug:page_slug>/', PublicStorePageView.as_view()),
    path('promo/<str:code>/',       PublicPromoValidateView.as_view()),
    path('order-items/',            PublicOrderItemsView.as_view()),
    path('shipping-rate/',          PublicShippingRateView.as_view()),
    path('desks/',                  PublicDesksView.as_view()),
    path('catalog.xml',             PublicCatalogFeedView.as_view()),
    path('sitemap.xml',             PublicSitemapView.as_view()),
    path('chat/',                   PublicChatView.as_view()),
    path('chat/<str:session_id>/',  PublicChatHistoryView.as_view()),
]
