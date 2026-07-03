from pathlib import Path
from decouple import config, Csv
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

# Epic 8.6 — plus de valeur de repli codée en dur : si SECRET_KEY est absent
# de l'environnement, on veut une erreur explicite au démarrage plutôt que de
# retomber silencieusement sur une clé connue et versionnée dans le repo
# (n'importe qui avec un accès au code aurait pu forger cookies de session,
# tokens de reset de mot de passe, etc.).
SECRET_KEY = config('SECRET_KEY')

DEBUG = config('DEBUG', default=False, cast=bool)

# En dev (DEBUG=True), on garde la permissivité actuelle pour ne pas casser
# les tunnels ngrok (domaine qui change à chaque session, cf. section Chargily
# du CLAUDE.md). En production, ALLOWED_HOSTS doit être explicite dans .env
# (ex: ALLOWED_HOSTS=monsite.com,www.monsite.com) — jamais de wildcard.
ALLOWED_HOSTS = ['*'] if DEBUG else config('ALLOWED_HOSTS', cast=Csv())

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'core',
    'accounts',
    'stores',
    'team',
    'products',
    'orders',
    'dropshipping',
    'finance',
    'channels',
    'webhooks',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR.parent / 'frontend' / 'dist'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME'),
        'USER': config('DB_USER'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST': config('DB_HOST'),
        'PORT': config('DB_PORT'),
    }
}

AUTH_USER_MODEL = 'accounts.User'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    # Rate limiting ciblé (Epic 8.6) — pas de throttle global agressif qui
    # casserait le dashboard authentifié, seulement sur les endpoints
    # AllowAny sensibles au brute force (login, OTP, reset, promo, webhook
    # entrant), via ScopedRateThrottle + throttle_scope sur chaque vue.
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.ScopedRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'login':            '10/min',
        'register':         '5/min',
        'otp':              '10/min',
        'password_reset':   '5/min',
        'promo':            '20/min',
        'incoming_webhook': '30/min',
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]
CORS_ALLOWED_ORIGIN_REGEXES = [
    r'^https://.*\.ngrok-free\.dev$',
    r'^https://.*\.ngrok\.io$',
]
CORS_ALLOW_CREDENTIALS = True

# Cookies sécurisés / HSTS (Epic 8.6) — actifs seulement en production, pour
# ne pas casser le serveur de dev HTTP local (DEBUG=True).
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'Africa/Casablanca'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR.parent / 'frontend' / 'dist' / 'assets']
MEDIA_URL  = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

FRONTEND_DIST = BASE_DIR.parent / 'frontend' / 'dist'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Autoriser la popup Google OAuth
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin-allow-popups'

# Email — Gmail SMTP
EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = config('EMAIL_HOST_USER', default='noreply@mzsolutions.app')
FRONTEND_URL = config('FRONTEND_URL', default='http://localhost:5173')
PASSWORD_RESET_TIMEOUT = 3600  # 1 heure

# Google OAuth
GOOGLE_CLIENT_ID = config('GOOGLE_CLIENT_ID', default='')

# Chargily Pay
CHARGILY_API_KEY    = config('CHARGILY_API_KEY', default='')
CHARGILY_SECRET_KEY = config('CHARGILY_SECRET_KEY', default='')
CHARGILY_MODE       = config('CHARGILY_MODE', default='test')
CHARGILY_API_BASE   = config('CHARGILY_API_BASE', default='https://pay.chargily.net/api/v2')
BACKEND_URL         = config('BACKEND_URL', default='http://localhost:8000')
