from django.urls import path
from .views import MyStoreView, QuotaView

urlpatterns = [
    path('me/', MyStoreView.as_view(), name='store-me'),
    path('me/quota/', QuotaView.as_view(), name='store-quota'),
]
