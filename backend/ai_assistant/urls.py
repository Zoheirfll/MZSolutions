from django.urls import path

from .views import (
    GenerateProductView, SuggestReplyView, DashboardSummaryView,
    ConversationListView, ConversationDetailView, ChatView,
    PendingActionConfirmView, PendingActionRejectView,
    ScanProductView, ProductDraftListView, ProductDraftCreateView, ProductDraftDiscardView,
)

urlpatterns = [
    path('generate-product/', GenerateProductView.as_view()),
    path('inbox/<int:conversation_id>/suggest-reply/', SuggestReplyView.as_view()),
    path('dashboard-summary/', DashboardSummaryView.as_view()),
    path('conversations/', ConversationListView.as_view()),
    path('conversations/<int:pk>/', ConversationDetailView.as_view()),
    path('chat/', ChatView.as_view()),
    path('pending-actions/<int:pk>/confirm/', PendingActionConfirmView.as_view()),
    path('pending-actions/<int:pk>/reject/', PendingActionRejectView.as_view()),
    path('scan/', ScanProductView.as_view()),
    path('product-drafts/', ProductDraftListView.as_view()),
    path('product-drafts/<int:pk>/create/', ProductDraftCreateView.as_view()),
    path('product-drafts/<int:pk>/discard/', ProductDraftDiscardView.as_view()),
]
