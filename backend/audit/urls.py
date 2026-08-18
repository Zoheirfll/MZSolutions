from django.urls import path
from .views import AuditLogListView, AuditMetaView

urlpatterns = [
    path('logs/', AuditLogListView.as_view()),
    path('meta/', AuditMetaView.as_view()),
]
