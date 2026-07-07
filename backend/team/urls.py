from django.urls import path
from .views import (
    InviteView, TeamListView, TeamMemberDetailView, AcceptInvitationView,
    RolePermissionsView, TeamMemberPermissionsView,
)

urlpatterns = [
    path('invite/',                            InviteView.as_view()),
    path('members/',                           TeamListView.as_view()),
    path('members/<int:pk>/',                  TeamMemberDetailView.as_view()),
    path('members/<int:pk>/permissions/',      TeamMemberPermissionsView.as_view()),
    path('accept-invitation/',                 AcceptInvitationView.as_view()),
    path('permissions/',                       RolePermissionsView.as_view()),
]
