from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.core import mail
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient

from .models import User, EmailVerificationCode
from stores.models import Store
from core.test_utils import make_owner, auth_client, clear_throttle_cache


class RegisterFlowTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.client = APIClient()

    def test_register_creates_inactive_user_and_store(self):
        resp = self.client.post('/api/auth/register/', {
            'email': 'new@test.com', 'first_name': 'A', 'last_name': 'B',
            'password': 'StrongPass123', 'store_name': 'My Shop', 'store_slug': 'my-shop',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        user = User.objects.get(email='new@test.com')
        self.assertFalse(user.is_active)
        self.assertFalse(user.is_email_verified)
        self.assertTrue(Store.objects.filter(slug='my-shop', owner=user).exists())
        self.assertTrue(hasattr(user, 'verification_code'))
        self.assertEqual(len(mail.outbox), 1)

    def test_register_rejects_duplicate_email(self):
        make_owner(email='dup@test.com')
        resp = self.client.post('/api/auth/register/', {
            'email': 'dup@test.com', 'first_name': 'A', 'last_name': 'B',
            'password': 'StrongPass123', 'store_name': 'Shop', 'store_slug': 'shop-x',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_register_rejects_duplicate_slug(self):
        make_owner(store_slug='taken-slug')
        resp = self.client.post('/api/auth/register/', {
            'email': 'unique@test.com', 'first_name': 'A', 'last_name': 'B',
            'password': 'StrongPass123', 'store_name': 'Shop', 'store_slug': 'taken-slug',
        }, format='json')
        self.assertEqual(resp.status_code, 400)


class VerifyEmailTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.client = APIClient()
        self.user = User.objects.create_user(email='v@test.com', password='x', first_name='A', last_name='B')
        self.user.is_active = False
        self.user.save()
        self.code = EmailVerificationCode.objects.create(user=self.user, code='123456')

    def test_correct_code_activates_user_and_returns_tokens(self):
        resp = self.client.post('/api/auth/verify-email/', {'email': 'v@test.com', 'code': '123456'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)
        self.assertTrue(self.user.is_email_verified)
        self.assertFalse(EmailVerificationCode.objects.filter(user=self.user).exists())

    def test_wrong_code_rejected(self):
        resp = self.client.post('/api/auth/verify-email/', {'email': 'v@test.com', 'code': '000000'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)

    def test_expired_code_rejected_and_deleted(self):
        self.code.created_at = timezone.now() - timedelta(minutes=20)
        self.code.save(update_fields=['created_at'])
        resp = self.client.post('/api/auth/verify-email/', {'email': 'v@test.com', 'code': '123456'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(EmailVerificationCode.objects.filter(user=self.user).exists())


class LoginTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.client = APIClient()
        self.owner, self.store = make_owner(email='login@test.com')
        self.owner.set_password('CorrectPass123')
        self.owner.save()

    def test_correct_credentials_return_tokens(self):
        resp = self.client.post('/api/auth/login/', {'email': 'login@test.com', 'password': 'CorrectPass123'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)
        self.assertIn('refresh', resp.data)

    def test_wrong_password_rejected(self):
        resp = self.client.post('/api/auth/login/', {'email': 'login@test.com', 'password': 'wrong'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_unverified_email_rejected_with_specific_code(self):
        # is_active=True mais is_email_verified=False : authenticate() réussit
        # (Django exige seulement is_active), c'est la branche email_not_verified
        # de LoginSerializer qui doit se déclencher (403), pas un 400 générique.
        u = User.objects.create_user(email='unverified@test.com', password='x', first_name='A', last_name='B')
        u.is_active = True
        u.is_email_verified = False
        u.save()
        resp = self.client.post('/api/auth/login/', {'email': 'unverified@test.com', 'password': 'x'}, format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data.get('code'), 'email_not_verified')

    def test_inactive_account_rejected_generically(self):
        u = User.objects.create_user(email='inactive@test.com', password='x', first_name='A', last_name='B')
        u.is_active = False
        u.save()
        resp = self.client.post('/api/auth/login/', {'email': 'inactive@test.com', 'password': 'x'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_login_is_throttled_after_repeated_failures(self):
        statuses = []
        for _ in range(12):
            r = self.client.post('/api/auth/login/', {'email': 'login@test.com', 'password': 'wrong'}, format='json')
            statuses.append(r.status_code)
        self.assertIn(429, statuses)


class MeViewTests(TestCase):
    def test_requires_authentication(self):
        resp = APIClient().get('/api/auth/me/')
        self.assertEqual(resp.status_code, 401)

    def test_returns_user_with_store_and_permissions(self):
        owner, store = make_owner()
        client = auth_client(owner)
        resp = client.get('/api/auth/me/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['store_slug'], store.slug)
        self.assertIsNone(resp.data['team_role'])
        self.assertTrue(resp.data['permissions']['finances_view'])  # owner = tout


class LogoutTests(TestCase):
    def test_logout_blacklists_refresh_token(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        owner, _ = make_owner()
        refresh = RefreshToken.for_user(owner)
        client = auth_client(owner)
        resp = client.post('/api/auth/logout/', {'refresh': str(refresh)}, format='json')
        self.assertEqual(resp.status_code, 205)
        # Le même refresh token ne doit plus permettre d'obtenir un access token
        plain_client = APIClient()
        resp2 = plain_client.post('/api/token/refresh/', {'refresh': str(refresh)}, format='json')
        self.assertEqual(resp2.status_code, 401)


class PasswordResetTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.client = APIClient()
        self.owner, _ = make_owner(email='reset@test.com')

    def test_request_does_not_reveal_account_existence(self):
        resp_existing = self.client.post('/api/auth/password-reset/', {'email': 'reset@test.com'}, format='json')
        resp_missing = self.client.post('/api/auth/password-reset/', {'email': 'nobody@test.com'}, format='json')
        self.assertEqual(resp_existing.status_code, 200)
        self.assertEqual(resp_missing.status_code, 200)
        self.assertEqual(resp_existing.data['detail'], resp_missing.data['detail'])
        self.assertEqual(len(mail.outbox), 1)  # un seul email envoyé (compte existant)

    def test_confirm_with_valid_token_changes_password(self):
        from django.contrib.auth.tokens import PasswordResetTokenGenerator
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        uid = urlsafe_base64_encode(force_bytes(self.owner.pk))
        token = PasswordResetTokenGenerator().make_token(self.owner)
        resp = self.client.post('/api/auth/password-reset/confirm/', {
            'uid': uid, 'token': token, 'new_password': 'BrandNewPass123',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.check_password('BrandNewPass123'))

    def test_confirm_rejects_short_password(self):
        from django.contrib.auth.tokens import PasswordResetTokenGenerator
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        uid = urlsafe_base64_encode(force_bytes(self.owner.pk))
        token = PasswordResetTokenGenerator().make_token(self.owner)
        resp = self.client.post('/api/auth/password-reset/confirm/', {
            'uid': uid, 'token': token, 'new_password': 'short',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_confirm_rejects_invalid_token(self):
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        uid = urlsafe_base64_encode(force_bytes(self.owner.pk))
        resp = self.client.post('/api/auth/password-reset/confirm/', {
            'uid': uid, 'token': 'bad-token', 'new_password': 'BrandNewPass123',
        }, format='json')
        self.assertEqual(resp.status_code, 400)


class GoogleAuthTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.client = APIClient()

    @patch('accounts.views.http_requests.get')
    def test_google_register_creates_verified_active_user(self, mock_get):
        mock_get.return_value = MagicMock(ok=True, json=lambda: {
            'sub': 'g123', 'email': 'newgoogle@test.com', 'given_name': 'G', 'family_name': 'U',
        })
        resp = self.client.post('/api/auth/google/register/', {
            'access_token': 'fake', 'store_name': 'G Shop', 'store_slug': 'g-shop',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        user = User.objects.get(email='newgoogle@test.com')
        self.assertTrue(user.is_active)
        self.assertTrue(user.is_email_verified)

    @patch('accounts.views.http_requests.get')
    def test_google_login_unknown_email_returns_404(self, mock_get):
        mock_get.return_value = MagicMock(ok=True, json=lambda: {'sub': 'x', 'email': 'unknown@test.com'})
        resp = self.client.post('/api/auth/google/login/', {'access_token': 'fake'}, format='json')
        self.assertEqual(resp.status_code, 404)

    @patch('accounts.views.http_requests.get')
    def test_google_login_existing_email_succeeds(self, mock_get):
        owner, _ = make_owner(email='googleuser@test.com')
        mock_get.return_value = MagicMock(ok=True, json=lambda: {'sub': 'x', 'email': 'googleuser@test.com'})
        resp = self.client.post('/api/auth/google/login/', {'access_token': 'fake'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)

    @patch('accounts.views.http_requests.get')
    def test_invalid_google_token_rejected(self, mock_get):
        mock_get.return_value = MagicMock(ok=False)
        resp = self.client.post('/api/auth/google/login/', {'access_token': 'bad'}, format='json')
        self.assertEqual(resp.status_code, 400)
