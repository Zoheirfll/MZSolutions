from django.urls import path
from . import views

urlpatterns = [
    path('costs/',                    views.CostListCreateView.as_view()),
    path('costs/<int:pk>/',           views.CostDetailView.as_view()),
    path('profitability/',            views.ProfitabilityView.as_view()),
    path('profitability/summary/',    views.ProfitabilitySummaryView.as_view()),
    path('payments/summary/',         views.PaymentsSummaryView.as_view()),
    path('payments/orders/',          views.PaymentsOrdersListView.as_view()),
    path('payments/mark-collected/',  views.PaymentsMarkCollectedView.as_view()),
    path('payments/reconciliation/',  views.PaymentsReconciliationView.as_view()),
    path('payments/import-excel/',    views.PaymentsExcelImportView.as_view()),
]
