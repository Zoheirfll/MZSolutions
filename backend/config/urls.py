from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import FileResponse, HttpResponse
from accounts.views import CookieTokenRefreshView
import os

def serve_react(request, path=''):
    index = settings.FRONTEND_DIST / 'index.html'
    response = FileResponse(open(index, 'rb'), content_type='text/html')
    response['ngrok-skip-browser-warning'] = 'true'
    return response

def robots_txt(request):
    return HttpResponse("User-agent: *\nAllow: /store/\nDisallow: /dashboard/\nDisallow: /api/\n",
                         content_type='text/plain; charset=utf-8')


def privacy_policy(request):
    from platform_admin.content_views import render_legal_page
    return render_legal_page('privacy-policy')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/',     include('accounts.urls')),
    path('api/stores/',   include('stores.urls')),
    path('api/team/',     include('team.urls')),
    path('api/products/', include('products.urls')),
    path('api/orders/',   include('orders.urls')),
    path('api/inbox/',    include('inbox.urls')),
    path('api/dropshipping/', include('dropshipping.urls')),
    path('api/finance/',  include('finance.urls')),
    path('api/channels/', include('channels.urls')),
    path('api/webhooks/', include('webhooks.urls')),
    path('api/audit/',    include('audit.urls')),
    path('api/ai/',       include('ai_assistant.urls')),
    path('api/platform-admin/', include('platform_admin.urls')),
    path('api/token/refresh/', CookieTokenRefreshView.as_view(), name='token-refresh'),
    path('api/public/reviews/', __import__('products.views', fromlist=['PublicReviewView']).PublicReviewView.as_view()),
    path('api/public/orders/',  __import__('orders.views',   fromlist=['PublicOrderView']).PublicOrderView.as_view()),
    path('api/public/complaints/', __import__('inbox.views', fromlist=['PublicComplaintCreateView']).PublicComplaintCreateView.as_view()),
    path('api/public/exchanges/', __import__('orders.views', fromlist=['PublicExchangeCreateView']).PublicExchangeCreateView.as_view()),
    path('api/public/orders/<int:pk>/verify-payment/', __import__('orders.views', fromlist=['PublicOrderPaymentVerifyView']).PublicOrderPaymentVerifyView.as_view()),
    path('api/support/announcements/', __import__('platform_admin.communication_views', fromlist=['VendorAnnouncementListView']).VendorAnnouncementListView.as_view()),
    path('api/support/invoices/', __import__('stores.invoice_views', fromlist=['x']).VendorInvoiceListView.as_view()),
    path('api/support/invoices/<int:pk>/pdf/', __import__('stores.invoice_views', fromlist=['x']).VendorInvoiceDownloadView.as_view()),
    path('api/support/contact/', __import__('platform_admin.communication_views', fromlist=['VendorContactView']).VendorContactView.as_view()),
    path('api/public/webhooks/yalidine/', __import__('orders.views', fromlist=['YalidineWebhookView']).YalidineWebhookView.as_view()),
    path('api/public/webhooks/incoming/<str:key>/', __import__('webhooks.views', fromlist=['PublicIncomingWebhookView']).PublicIncomingWebhookView.as_view()),
    path('api/public/abandoned-carts/', __import__('orders.views', fromlist=['PublicAbandonedCartView']).PublicAbandonedCartView.as_view()),
    path('api/public/abandoned-carts/recover/', __import__('orders.views', fromlist=['PublicMarkCartRecoveredView']).PublicMarkCartRecoveredView.as_view()),
    path('api/public/store/<slug:slug>/', include('products.public_urls')),
    path('api/public/channels/shopify/callback/', __import__('channels.views', fromlist=['ShopifyCallbackView']).ShopifyCallbackView.as_view()),
    path('api/public/channels/shopify/webhooks/orders/', __import__('channels.views', fromlist=['ShopifyOrderWebhookView']).ShopifyOrderWebhookView.as_view()),
    path('api/public/channels/shopify/webhooks/customers-data-request/', __import__('channels.views', fromlist=['ShopifyCustomersDataRequestView']).ShopifyCustomersDataRequestView.as_view()),
    path('api/public/channels/shopify/webhooks/customers-redact/', __import__('channels.views', fromlist=['ShopifyCustomersRedactView']).ShopifyCustomersRedactView.as_view()),
    path('api/public/channels/shopify/webhooks/shop-redact/', __import__('channels.views', fromlist=['ShopifyShopRedactView']).ShopifyShopRedactView.as_view()),
    path('legal/privacy-policy/', privacy_policy),
    path('legal/terms/', lambda r: __import__('platform_admin.content_views', fromlist=['x']).render_legal_page('terms') or HttpResponse('Page non disponible.', status=404)),
    path('api/support/faq/', __import__('platform_admin.content_views', fromlist=['x']).VendorFaqView.as_view()),
    path('robots.txt', robots_txt),
]

# Stores pages & media
from stores.views import (StorePageListCreateView, StorePageDetailView,
                           MediaFolderListCreateView, MediaFolderDeleteView,
                           MediaFileListView, MediaFileUploadView, MediaFileDeleteView,
                           MediaFileBulkDeleteView, MediaStorageSummaryView)
from orders.views import (CarrierAccountListCreateView, CarrierAccountDetailView, CarrierRatesView, CarrierDesksView,
                           WilayaRateListCreateView, WilayaRateDetailView, WilayaRateSyncView,
                           CommuneRateListCreateView, CommuneRateDetailView, CommuneRateSyncView,
                           StoreShippingRateView, GeocodeView, DispatchRuleListCreateView, DispatchRuleDetailView)
urlpatterns += [
    path('api/stores/pages/',           StorePageListCreateView.as_view()),
    path('api/stores/pages/<int:pk>/',  StorePageDetailView.as_view()),
    path('api/media/folders/',          MediaFolderListCreateView.as_view()),
    path('api/media/folders/<int:pk>/', MediaFolderDeleteView.as_view()),
    path('api/media/files/',            MediaFileListView.as_view()),
    path('api/media/files/upload/',     MediaFileUploadView.as_view()),
    path('api/media/files/<int:pk>/',   MediaFileDeleteView.as_view()),
    path('api/media/files/bulk-delete/', MediaFileBulkDeleteView.as_view()),
    path('api/media/storage/',           MediaStorageSummaryView.as_view()),
    path('api/stores/me/carriers/',           CarrierAccountListCreateView.as_view()),
    path('api/stores/me/carriers/<int:pk>/',  CarrierAccountDetailView.as_view()),
    path('api/stores/me/carriers/<int:pk>/rates/', CarrierRatesView.as_view()),
    path('api/stores/me/carriers/<int:pk>/desks/', CarrierDesksView.as_view()),
    path('api/stores/me/wilaya-rates/',            WilayaRateListCreateView.as_view()),
    path('api/stores/me/wilaya-rates/<int:pk>/',   WilayaRateDetailView.as_view()),
    path('api/stores/me/wilaya-rates/sync/',       WilayaRateSyncView.as_view()),
    path('api/stores/me/commune-rates/',           CommuneRateListCreateView.as_view()),
    path('api/stores/me/commune-rates/<int:pk>/',  CommuneRateDetailView.as_view()),
    path('api/stores/me/commune-rates/sync/',      CommuneRateSyncView.as_view()),
    path('api/stores/me/shipping-rate/',           StoreShippingRateView.as_view()),
    path('api/stores/me/geocode/',                 GeocodeView.as_view()),
    path('api/stores/me/dispatch-rules/',          DispatchRuleListCreateView.as_view()),
    path('api/stores/me/dispatch-rules/<int:pk>/', DispatchRuleDetailView.as_view()),
]

urlpatterns += [
    re_path(r'^(?!api/|admin/|media/|assets/).*$', serve_react),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static('/assets/', document_root=settings.FRONTEND_DIST / 'assets')
