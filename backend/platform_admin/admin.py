from django.contrib import admin
from .models import PlatformConfirmationAccount, PlatformConfirmateur, PlatformConfirmateurAssignment


@admin.register(PlatformConfirmationAccount)
class PlatformConfirmationAccountAdmin(admin.ModelAdmin):
    list_display = ['store', 'is_active', 'mode', 'activated_at']
    list_filter = ['is_active', 'mode']
    search_fields = ['store__name', 'store__slug']


@admin.register(PlatformConfirmateur)
class PlatformConfirmateurAdmin(admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'email', 'is_active', 'invited_at']
    list_filter = ['is_active']
    search_fields = ['first_name', 'last_name', 'email']


@admin.register(PlatformConfirmateurAssignment)
class PlatformConfirmateurAssignmentAdmin(admin.ModelAdmin):
    list_display = ['confirmateur', 'account', 'is_active', 'assigned_at']
    list_filter = ['is_active']
