from django.urls import path
from . import views

urlpatterns = [
    path('products/',               views.DropshipperProductListCreateView.as_view()),
    path('products/<int:pk>/',      views.DropshipperProductDeleteView.as_view()),
    path('commissions/',            views.CommissionListCreateView.as_view()),
    path('commissions/<int:pk>/',   views.CommissionDetailView.as_view()),
    path('dropshippers/',           views.DropshipperListView.as_view()),
    path('dropshippers/<int:pk>/',       views.DropshipperDetailView.as_view()),
    path('dropshippers/<int:pk>/pay/',   views.DropshipperPayView.as_view()),
]
