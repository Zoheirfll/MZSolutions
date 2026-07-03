from django.urls import path
from . import views

urlpatterns = [
    path('events/',              views.WebhookEventCatalogView.as_view()),
    path('endpoints/',           views.WebhookEndpointListCreateView.as_view()),
    path('endpoints/<int:pk>/',  views.WebhookEndpointDetailView.as_view()),
    path('logs/',                views.WebhookLogListView.as_view()),
    path('incoming-key/',        views.IncomingWebhookKeyView.as_view()),
]
