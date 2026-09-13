from django.urls import path
from . import views

urlpatterns = [
    path('stores/',                          views.PlatformStoreListView.as_view()),
    path('stores/bulk-toggle/',              views.PlatformStoreBulkToggleView.as_view()),
    path('stores/<int:store_id>/toggle/',    views.PlatformStoreToggleView.as_view()),
    path('stores/<int:store_id>/orders/',    views.PlatformStoreOrdersView.as_view()),
    path('stores/<int:store_id>/products/',  views.PlatformStoreProductsView.as_view()),
    path('stores/<int:store_id>/enter/',     views.PlatformStoreEnterView.as_view()),

    path('confirmateurs/',                          views.PlatformConfirmateurListCreateView.as_view()),
    path('confirmateurs/<int:pk>/',                 views.PlatformConfirmateurDetailView.as_view()),
    path('confirmateurs/<int:pk>/resend-invite/',   views.PlatformConfirmateurResendInviteView.as_view()),
    path('accept-invitation/',                      views.PlatformAcceptInvitationView.as_view()),

    path('assignments/',                     views.PlatformConfirmateurAssignmentListCreateView.as_view()),
    path('assignments/<int:pk>/',            views.PlatformConfirmateurAssignmentDetailView.as_view()),
    path('assignments/<int:pk>/permissions/', views.PlatformAssignmentPermissionsView.as_view()),
    path('assignments/<int:assignment_id>/enter/', views.PlatformConfirmateurEnterView.as_view()),

    path('leave/', views.PlatformImpersonationLeaveView.as_view()),

    path('my-queue/',                        views.MyQueueListView.as_view()),
    path('my-queue/<int:order_id>/status/',  views.MyQueueOrderStatusView.as_view()),
]
