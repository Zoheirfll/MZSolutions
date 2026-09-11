from django.urls import path
from .views import (MyStoreView, QuotaView, StoreSettingsView, PixelConfigListCreateView, PixelConfigDetailView,
                     SubscriptionPlanListView, SubscribeView, StoreAuditView)

urlpatterns = [
    path('me/',          MyStoreView.as_view(),      name='store-me'),
    path('me/quota/',    QuotaView.as_view(),         name='store-quota'),
    path('me/settings/', StoreSettingsView.as_view(), name='store-settings'),
    path('me/audit/',    StoreAuditView.as_view()),
    path('me/pixels/',        PixelConfigListCreateView.as_view()),
    path('me/pixels/<int:pk>/', PixelConfigDetailView.as_view()),
    path('plans/',        SubscriptionPlanListView.as_view()),
    path('me/subscribe/', SubscribeView.as_view()),
]
