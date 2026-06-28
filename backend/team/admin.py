from django.contrib import admin
from .models import TeamMember

@admin.register(TeamMember)
class TeamMemberAdmin(admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'email', 'role', 'store', 'is_active', 'invited_at']
    list_filter  = ['role', 'is_active', 'store']
    search_fields = ['email', 'first_name', 'last_name']
