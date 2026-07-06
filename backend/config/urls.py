from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import FileResponse, HttpResponse
from rest_framework_simplejwt.views import TokenRefreshView
import os

def serve_react(request, path=''):
    index = settings.FRONTEND_DIST / 'index.html'
    response = FileResponse(open(index, 'rb'), content_type='text/html')
    response['ngrok-skip-browser-warning'] = 'true'
    return response

def privacy_policy(request):
    return HttpResponse("""<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Politique de confidentialité — MZSolutions</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222}h1{font-size:1.5rem}h2{font-size:1.15rem;margin-top:2rem}</style>
</head><body>
<h1>Politique de confidentialité — MZSolutions</h1>
<p>Dernière mise à jour : juillet 2026</p>
<p>MZSolutions est une plateforme SaaS de gestion e-commerce destinée aux vendeurs. Cette politique décrit comment nous traitons les données lorsqu'un vendeur connecte sa boutique Shopify à MZSolutions.</p>
<h2>Données collectées</h2>
<p>Lorsqu'un vendeur connecte sa boutique Shopify, nous accédons uniquement aux données nécessaires au fonctionnement de l'intégration : produits, commandes, et informations client associées à ces commandes (nom, téléphone, email, adresse de livraison).</p>
<h2>Utilisation des données</h2>
<p>Ces données sont utilisées exclusivement pour afficher les commandes et produits du vendeur dans son tableau de bord MZSolutions, et ne sont ni vendues ni partagées avec des tiers.</p>
<h2>Droits des clients finaux</h2>
<p>Conformément aux exigences de Shopify en matière de protection des données, MZSolutions traite automatiquement les demandes d'accès et de suppression de données transmises par Shopify (webhooks de conformité RGPD).</p>
<h2>Contact</h2>
<p>Pour toute question relative à cette politique, contactez : mzsolutions31@gmail.com</p>
</body></html>""", content_type='text/html; charset=utf-8')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/',     include('accounts.urls')),
    path('api/stores/',   include('stores.urls')),
    path('api/team/',     include('team.urls')),
    path('api/products/', include('products.urls')),
    path('api/orders/',   include('orders.urls')),
    path('api/dropshipping/', include('dropshipping.urls')),
    path('api/finance/',  include('finance.urls')),
    path('api/channels/', include('channels.urls')),
    path('api/webhooks/', include('webhooks.urls')),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('api/public/reviews/', __import__('products.views', fromlist=['PublicReviewView']).PublicReviewView.as_view()),
    path('api/public/orders/',  __import__('orders.views',   fromlist=['PublicOrderView']).PublicOrderView.as_view()),
    path('api/public/complaints/', __import__('orders.views', fromlist=['PublicComplaintCreateView']).PublicComplaintCreateView.as_view()),
    path('api/public/exchanges/', __import__('orders.views', fromlist=['PublicExchangeCreateView']).PublicExchangeCreateView.as_view()),
    path('api/public/webhooks/chargily/', __import__('orders.views', fromlist=['ChargilyWebhookView']).ChargilyWebhookView.as_view()),
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
