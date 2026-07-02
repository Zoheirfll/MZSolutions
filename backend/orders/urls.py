from django.urls import path
from .views import (
    OrderListCreateView, OrderDetailView,
    OrderStatusView, OrderStatsView, ConfirmationRateView,
    OrderAssignmentView,
    CallAttemptListView, CallAttemptDetailView,
    FailureReasonListView, FailureReasonDetailView,
)

urlpatterns = [
    path('',                                      OrderListCreateView.as_view()),
    path('stats/',                                OrderStatsView.as_view()),
    path('stats/confirmation/',                   ConfirmationRateView.as_view()),
    path('failure-reasons/',                      FailureReasonListView.as_view()),
    path('failure-reasons/<int:pk>/',             FailureReasonDetailView.as_view()),
    path('<int:pk>/',                             OrderDetailView.as_view()),
    path('<int:pk>/status/',                      OrderStatusView.as_view()),
    path('<int:pk>/assignment/',                  OrderAssignmentView.as_view()),
    path('<int:pk>/call-attempts/',               CallAttemptListView.as_view()),
    path('<int:pk>/call-attempts/<int:cid>/',     CallAttemptDetailView.as_view()),
]
