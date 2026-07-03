from django.urls import path
from . import views

urlpatterns = [
    path('costs/',                    views.CostListCreateView.as_view()),
    path('costs/<int:pk>/',           views.CostDetailView.as_view()),
    path('profitability/',            views.ProfitabilityView.as_view()),
    path('profitability/summary/',    views.ProfitabilitySummaryView.as_view()),
]
