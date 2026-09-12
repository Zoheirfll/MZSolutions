def is_platform_admin(request):
    """True uniquement pour un compte superadmin (accounts.User.is_platform_admin),
    complètement indépendant du système de rôles par boutique (team.TeamMember) —
    ce compte n'appartient à aucun Store."""
    user = getattr(request, 'user', None)
    return bool(user and user.is_authenticated and getattr(user, 'is_platform_admin', False))
