from django.test import TestCase
from accounts.models import User
from stores.models import Store
from orders.models import CarrierAccount


class CarrierAccountModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='owner@test.com', password='pass1234')
        self.store = Store.objects.create(owner=self.user, name='Ma Boutique', slug='ma-boutique')

    def test_setting_default_unsets_previous_default(self):
        yalidine = CarrierAccount.objects.create(store=self.store, carrier='yalidine', is_default=True)
        zr = CarrierAccount.objects.create(store=self.store, carrier='zr_express', is_default=True)

        yalidine.refresh_from_db()
        zr.refresh_from_db()

        self.assertFalse(yalidine.is_default)
        self.assertTrue(zr.is_default)
