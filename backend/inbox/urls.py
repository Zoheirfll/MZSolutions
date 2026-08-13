from django.urls import path
from .views import (
    ConversationListView, ConversationDetailView, ConversationAssignmentView,
    ConversationStatusView, ConversationMessageCreateView, UnreadCountView,
)

urlpatterns = [
    path('conversations/',                     ConversationListView.as_view()),
    path('conversations/<int:pk>/',             ConversationDetailView.as_view()),
    path('conversations/<int:pk>/assignment/',  ConversationAssignmentView.as_view()),
    path('conversations/<int:pk>/status/',      ConversationStatusView.as_view()),
    path('conversations/<int:pk>/messages/',    ConversationMessageCreateView.as_view()),
    path('unread-count/',                       UnreadCountView.as_view()),
]
