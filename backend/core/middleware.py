class SecurityHeadersMiddleware:
    """Sécurité — point 21 : X-Content-Type-Options/X-Frame-Options/Referrer-Policy
    viennent déjà des défauts Django (SecurityMiddleware/XFrameOptionsMiddleware).
    Permissions-Policy et Content-Security-Policy n'ont pas d'équivalent natif,
    ajoutés ici. CSP calibrée pour ne pas casser les pixels marketing (Facebook/
    TikTok/Google, injectés en script inline par lib/pixels.js) ni Google Fonts
    (index.html) — 'unsafe-inline' reste nécessaire tant que l'injection de
    pixels n'utilise pas de nonce."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        response.setdefault(
            'Permissions-Policy',
            'geolocation=(), camera=(), microphone=(), usb=(), payment=(), interest-cohort=()',
        )

        script_src = "'self' 'unsafe-inline' https://connect.facebook.net https://analytics.tiktok.com https://www.googletagmanager.com https://www.google-analytics.com"
        connect_src = "'self' https://www.facebook.com https://analytics.tiktok.com https://www.google-analytics.com https://region1.google-analytics.com"
        response.setdefault('Content-Security-Policy', (
            "default-src 'self'; "
            f"script-src {script_src}; "
            f"connect-src {connect_src}; "
            "img-src 'self' data: https:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "frame-ancestors 'none'"
        ))
        return response
