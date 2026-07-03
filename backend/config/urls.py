from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import FileResponse
from rest_framework_simplejwt.views import TokenRefreshView
import os

def serve_react(request, path=''):
    index = settings.FRONTEND_DIST / 'index.html'
    response = FileResponse(open(index, 'rb'), content_type='text/html')
    response['ngrok-skip-browser-warning'] = 'true'
    return response

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/',     include('accounts.urls')),
    path('api/stores/',   include('stores.urls')),
    path('api/team/',     include('team.urls')),
    path('api/products/', include('products.urls')),
    path('api/orders/',   include('orders.urls')),
    path('api/dropshipping/', include('dropshipping.urls')),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('api/public/reviews/', __import__('products.views', fromlist=['PublicReviewView']).PublicReviewView.as_view()),
    path('api/public/orders/',  __import__('orders.views',   fromlist=['PublicOrderView']).PublicOrderView.as_view()),
    path('api/public/complaints/', __import__('orders.views', fromlist=['PublicComplaintCreateView']).PublicComplaintCreateView.as_view()),
    path('api/public/exchanges/', __import__('orders.views', fromlist=['PublicExchangeCreateView']).PublicExchangeCreateView.as_view()),
    path('api/public/webhooks/chargily/', __import__('orders.views', fromlist=['ChargilyWebhookView']).ChargilyWebhookView.as_view()),
    path('api/public/abandoned-carts/', __import__('orders.views', fromlist=['PublicAbandonedCartView']).PublicAbandonedCartView.as_view()),
    path('api/public/abandoned-carts/recover/', __import__('orders.views', fromlist=['PublicMarkCartRecoveredView']).PublicMarkCartRecoveredView.as_view()),
    path('api/public/store/<slug:slug>/', include('products.public_urls')),
]

# Stores pages & media
from stores.views import (StorePageListCreateView, StorePageDetailView,
                           MediaFolderListCreateView, MediaFolderDeleteView,
                           MediaFileListView, MediaFileUploadView, MediaFileDeleteView)
from orders.views import CarrierAccountListCreateView, CarrierAccountDetailView
urlpatterns += [
    path('api/stores/pages/',           StorePageListCreateView.as_view()),
    path('api/stores/pages/<int:pk>/',  StorePageDetailView.as_view()),
    path('api/media/folders/',          MediaFolderListCreateView.as_view()),
    path('api/media/folders/<int:pk>/', MediaFolderDeleteView.as_view()),
    path('api/media/files/',            MediaFileListView.as_view()),
    path('api/media/files/upload/',     MediaFileUploadView.as_view()),
    path('api/media/files/<int:pk>/',   MediaFileDeleteView.as_view()),
    path('api/stores/me/carriers/',           CarrierAccountListCreateView.as_view()),
    path('api/stores/me/carriers/<int:pk>/',  CarrierAccountDetailView.as_view()),
]

urlpatterns += [
    re_path(r'^(?!api/|admin/|media/|assets/).*$', serve_react),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static('/assets/', document_root=settings.FRONTEND_DIST / 'assets')
