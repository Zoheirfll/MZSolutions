def is_platform_admin(request):
    """True uniquement pour un compte superadmin (accounts.User.is_platform_admin),
    complètement indépendant du système de rôles par boutique (team.TeamMember) —
    ce compte n'appartient à aucun Store."""
    user = getattr(request, 'user', None)
    return bool(user and user.is_authenticated and getattr(user, 'is_platform_admin', False))


def get_platform_confirmateur(request):
    """Renvoie le profil PlatformConfirmateur actif de l'utilisateur connecté,
    ou None — un confirmateur désactivé (is_active=False) n'a plus accès à sa
    file, même s'il a déjà un compte User actif."""
    user = getattr(request, 'user', None)
    if not (user and user.is_authenticated):
        return None
    profile = getattr(user, 'platform_confirmateur_profile', None)
    if profile and profile.is_active:
        return profile
    return None
