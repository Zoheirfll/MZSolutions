from django.urls import path
from . import views

urlpatterns = [
    path('connections/',              views.ChannelConnectionListCreateView.as_view()),
    path('connections/<int:pk>/',     views.ChannelConnectionDetailView.as_view()),
    path('connections/<int:pk>/sync/', views.ChannelSyncView.as_view()),
    path('logs/',                     views.ChannelSyncLogListView.as_view()),
    path('shopify/install/',          views.ShopifyInstallView.as_view()),
]
