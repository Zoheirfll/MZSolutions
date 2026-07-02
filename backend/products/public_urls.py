from django.urls import path
from .views import PublicStoreView, PublicCategoryListView, PublicProductListView, PublicProductDetailView

urlpatterns = [
    path('',              PublicStoreView.as_view()),
    path('categories/',   PublicCategoryListView.as_view()),
    path('products/',     PublicProductListView.as_view()),
    path('products/<int:pk>/', PublicProductDetailView.as_view()),
]
