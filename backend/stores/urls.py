from django.urls import path
from .views import MyStoreView, QuotaView, StoreSettingsView

urlpatterns = [
    path('me/',          MyStoreView.as_view(),      name='store-me'),
    path('me/quota/',    QuotaView.as_view(),         name='store-quota'),
    path('me/settings/', StoreSettingsView.as_view(), name='store-settings'),
]
