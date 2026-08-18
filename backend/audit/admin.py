from django.contrib import admin
from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'store', 'actor_name', 'actor_role', 'action', 'target_repr')
    list_filter = ('action', 'actor_role', 'store')
    search_fields = ('actor_name', 'description', 'target_repr')
