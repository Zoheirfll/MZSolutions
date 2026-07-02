from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/',     include('accounts.urls')),
    path('api/stores/',   include('stores.urls')),
    path('api/team/',     include('team.urls')),
    path('api/products/', include('products.urls')),
    path('api/orders/',   include('orders.urls')),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('api/public/reviews/', __import__('products.views', fromlist=['PublicReviewView']).PublicReviewView.as_view()),
    path('api/public/orders/',  __import__('orders.views',   fromlist=['PublicOrderView']).PublicOrderView.as_view()),
    path('api/public/webhooks/chargily/', __import__('orders.views', fromlist=['ChargilyWebhookView']).ChargilyWebhookView.as_view()),
    path('api/public/store/<slug:slug>/', include('products.public_urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
