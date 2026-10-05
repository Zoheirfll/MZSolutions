from django.urls import path
from . import views
from .views_overview import PlatformOverviewView
from . import account_views as av
from . import billing_views as bv
from . import system_views as sv
from . import communication_views as cv

urlpatterns = [
    path('overview/',                        PlatformOverviewView.as_view()),

    path('accounts/',                                  av.PlatformAccountListView.as_view()),
    path('accounts/<int:store_id>/',                   av.PlatformAccountDetailView.as_view()),
    path('accounts/<int:store_id>/suspend/',           av.PlatformAccountSuspendView.as_view()),
    path('accounts/<int:store_id>/reactivate/',        av.PlatformAccountReactivateView.as_view()),
    path('accounts/<int:store_id>/force-logout/',      av.PlatformAccountForceLogoutView.as_view()),
    path('accounts/<int:store_id>/reset-password/',    av.PlatformAccountResetPasswordView.as_view()),
    path('accounts/<int:store_id>/grant/',             bv.PlatformAccountGrantView.as_view()),

    path('plans/',                                     bv.PlatformPlanListCreateView.as_view()),
    path('plans/<int:pk>/',                            bv.PlatformPlanDetailView.as_view()),
    path('payments/',                                  bv.PlatformPaymentListView.as_view()),
    path('payments/export/',                           bv.PlatformPaymentExportView.as_view()),
    path('payments/<int:pk>/refund/',                  bv.PlatformPaymentRefundView.as_view()),

    path('announcements/',                             cv.PlatformAnnouncementListCreateView.as_view()),
    path('announcements/preview/',                     cv.PlatformAnnouncementPreviewView.as_view()),
    path('announcements/<int:pk>/',                    cv.PlatformAnnouncementDetailView.as_view()),
    path('contact/',                                   cv.PlatformContactListView.as_view()),
    path('contact/<int:pk>/',                          cv.PlatformContactDetailView.as_view()),
    path('integrations/',                              cv.PlatformIntegrationsOverviewView.as_view()),
    path('accounts/<int:store_id>/integrations/',      cv.PlatformAccountIntegrationsView.as_view()),

    path('health/',                                    sv.PlatformHealthView.as_view()),
    path('errors/',                                    sv.PlatformErrorListView.as_view()),
    path('errors/<int:pk>/resolve/',                   sv.PlatformErrorResolveView.as_view()),
    path('settings/',                                  sv.PlatformSettingsView.as_view()),

    path('admins/',                                    av.PlatformAdminListCreateView.as_view()),
    path('admins/<int:pk>/',                           av.PlatformAdminDetailView.as_view()),
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
    path('my-assignments/',                  views.MyAssignmentsListView.as_view()),
    path('my-dashboard/',                    views.MyDashboardSummaryView.as_view()),

    path('audit-logs/',                      views.PlatformAuditLogListView.as_view()),
]
