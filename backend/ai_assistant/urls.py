from django.urls import path

from .views import (
    GenerateProductView, SuggestReplyView, DashboardSummaryView,
    ConversationListView, ConversationDetailView, ChatView,
)

urlpatterns = [
    path('generate-product/', GenerateProductView.as_view()),
    path('inbox/<int:conversation_id>/suggest-reply/', SuggestReplyView.as_view()),
    path('dashboard-summary/', DashboardSummaryView.as_view()),
    path('conversations/', ConversationListView.as_view()),
    path('conversations/<int:pk>/', ConversationDetailView.as_view()),
    path('chat/', ChatView.as_view()),
]
