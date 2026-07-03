from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from .models import Category, Product, ProductVariant, VariantOption, Supplier, ProductReview, Promotion
from core.test_utils import make_owner, make_team_member, auth_client

PNG_1PX = bytes.fromhex(
    '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753'
    'de0000000c4944415478da6360000002000155a3e0e60000000049454e44ae426082'
)


class CategoryTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_create_and_list(self):
        client = auth_client(self.owner)
        resp = client.post('/api/products/categories/', {'name': 'Vêtements'}, format='json')
        self.assertEqual(resp.status_code, 201)
        resp2 = client.get('/api/products/categories/')
        self.assertEqual(resp2.data['count'], 1)

    def test_soft_delete_then_restore(self):
        cat = Category.objects.create(store=self.store, name='Temp')
        client = auth_client(self.owner)
        resp = client.delete(f'/api/products/categories/{cat.id}/')
        self.assertEqual(resp.status_code, 204)
        cat.refresh_from_db()
        self.assertTrue(cat.is_deleted)

        resp2 = client.post(f'/api/products/categories/{cat.id}/restore/')
        self.assertEqual(resp2.status_code, 200)
        cat.refresh_from_db()
        self.assertFalse(cat.is_deleted)

    def test_isolated_per_store(self):
        Category.objects.create(store=self.store, name='Mine')
        other_owner, _ = make_owner()
        client = auth_client(other_owner)
        resp = client.get('/api/products/categories/')
        self.assertEqual(resp.data['count'], 0)

    def test_invalid_image_extension_rejected(self):
        client = auth_client(self.owner)
        evil = SimpleUploadedFile('evil.html', b'<script>1</script>', content_type='text/html')
        resp = client.post('/api/products/categories/', {'name': 'X', 'image': evil}, format='multipart')
        self.assertEqual(resp.status_code, 400)


class ProductTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_create_product(self):
        client = auth_client(self.owner)
        resp = client.post('/api/products/', {'name': 'T-Shirt', 'price': '2500', 'stock': 10}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(Product.objects.filter(store=self.store, name='T-Shirt').exists())

    def test_duplicate_sku_rejected_within_store(self):
        Product.objects.create(store=self.store, name='P1', price=Decimal('100'), sku='SKU1')
        client = auth_client(self.owner)
        resp = client.post('/api/products/', {'name': 'P2', 'price': '200', 'sku': 'SKU1'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_same_sku_allowed_across_different_stores(self):
        Product.objects.create(store=self.store, name='P1', price=Decimal('100'), sku='SKU1')
        other_owner, _ = make_owner()
        client = auth_client(other_owner)
        resp = client.post('/api/products/', {'name': 'P2', 'price': '200', 'sku': 'SKU1'}, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_cost_price_hidden_without_purchase_prices_permission(self):
        product = Product.objects.create(store=self.store, name='Secret Cost', price=Decimal('500'), cost_price=Decimal('200'))
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.get(f'/api/products/{product.id}/')
        self.assertEqual(resp.status_code, 200)  # lecture ouverte à tout membre (IsOwnerOrAdminForWrites)
        self.assertNotIn('cost_price', resp.data)  # mais purchase_prices_view=False par défaut pour confirmateur

    def test_cost_price_visible_to_owner(self):
        product = Product.objects.create(store=self.store, name='Visible Cost', price=Decimal('500'), cost_price=Decimal('200'))
        client = auth_client(self.owner)
        resp = client.get(f'/api/products/{product.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['cost_price'], '200.00')

    def test_cannot_access_other_stores_product(self):
        other_owner, other_store = make_owner()
        other_product = Product.objects.create(store=other_store, name='Not mine', price=Decimal('100'))
        client = auth_client(self.owner)
        resp = client.get(f'/api/products/{other_product.id}/')
        self.assertEqual(resp.status_code, 404)

    def test_image_upload_valid_and_invalid(self):
        product = Product.objects.create(store=self.store, name='Img Prod', price=Decimal('100'))
        client = auth_client(self.owner)

        good = SimpleUploadedFile('good.png', PNG_1PX, content_type='image/png')
        resp = client.post(f'/api/products/{product.id}/images/', {'image': good}, format='multipart')
        self.assertEqual(resp.status_code, 201)

        evil = SimpleUploadedFile('evil.svg', b'<svg onload=alert(1)>', content_type='image/svg+xml')
        resp2 = client.post(f'/api/products/{product.id}/images/', {'image': evil}, format='multipart')
        self.assertEqual(resp2.status_code, 400)


class ProductVariantTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.product = Product.objects.create(store=self.store, name='Shoe', price=Decimal('3000'))

    def test_create_variant_and_option(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/products/{self.product.id}/variants/', {'name': 'Taille'}, format='json')
        self.assertEqual(resp.status_code, 201)
        variant_id = resp.data['id']

        resp2 = client.post(f'/api/products/{self.product.id}/variants/{variant_id}/options/', {
            'value': '42', 'stock': 5, 'price': '3200',
        }, format='json')
        self.assertEqual(resp2.status_code, 201)
        self.assertTrue(VariantOption.objects.filter(value='42', price=Decimal('3200')).exists())

    def test_total_stock_sums_options(self):
        variant = ProductVariant.objects.create(product=self.product, name='Taille')
        VariantOption.objects.create(variant=variant, value='38', stock=3)
        VariantOption.objects.create(variant=variant, value='40', stock=7)
        self.assertEqual(self.product.total_stock, 10)


class SupplierTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_create_supplier_and_credit_payment_balance(self):
        client = auth_client(self.owner)
        resp = client.post('/api/products/suppliers/', {'first_name': 'F', 'last_name': 'S'}, format='json')
        self.assertEqual(resp.status_code, 201)
        supplier_id = resp.data['id']

        r1 = client.post(f'/api/products/suppliers/{supplier_id}/credits/', {'supplier': supplier_id, 'amount': '1000', 'date': '2026-01-01'}, format='json')
        r2 = client.post(f'/api/products/suppliers/{supplier_id}/payments/', {'supplier': supplier_id, 'amount': '400', 'date': '2026-01-05'}, format='json')
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r2.status_code, 201)

        resp2 = client.get(f'/api/products/suppliers/{supplier_id}/balance/')
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(Decimal(str(resp2.data['balance'])), Decimal('600'))

    def test_isolated_per_store(self):
        Supplier.objects.create(store=self.store, first_name='A', last_name='B')
        other_owner, _ = make_owner()
        client = auth_client(other_owner)
        resp = client.get('/api/products/suppliers/')
        self.assertEqual(len(resp.data), 0)


class ProductReviewTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.product = Product.objects.create(store=self.store, name='Reviewed', price=Decimal('100'))

    def test_public_submission_is_not_approved_by_default(self):
        resp = self.client.post('/api/public/reviews/', {
            'store_slug': self.store.slug, 'product': self.product.id,
            'first_name': 'Cust', 'rating': 5, 'comment': 'Top',
        }, format='multipart')
        self.assertEqual(resp.status_code, 201)
        review = ProductReview.objects.get(product=self.product)
        self.assertFalse(review.is_approved)

    def test_owner_can_approve_review(self):
        review = ProductReview.objects.create(product=self.product, first_name='C', rating=4, comment='Nice')
        client = auth_client(self.owner)
        resp = client.put(f'/api/products/reviews/{review.id}/', {'is_approved': True}, format='json')
        self.assertEqual(resp.status_code, 200)
        review.refresh_from_db()
        self.assertTrue(review.is_approved)

    def test_invalid_rating_rejected(self):
        resp = self.client.post('/api/public/reviews/', {
            'store_slug': self.store.slug, 'product': self.product.id,
            'first_name': 'Cust', 'rating': 9, 'comment': 'Top',
        }, format='multipart')
        self.assertEqual(resp.status_code, 400)


class PromotionModelTests(TestCase):
    """Tests unitaires purs sur la logique métier (pas de HTTP)."""

    def setUp(self):
        self.owner, self.store = make_owner()

    def test_percentage_discount(self):
        promo = Promotion.objects.create(store=self.store, name='10%', kind='code', code='TEN',
                                          discount_type='percentage', discount_value=Decimal('10'))
        self.assertEqual(promo.compute_discount(Decimal('1000')), Decimal('100.00'))

    def test_fixed_discount_capped_at_base_amount(self):
        promo = Promotion.objects.create(store=self.store, name='Fixed', kind='code', code='FIX',
                                          discount_type='fixed', discount_value=Decimal('5000'))
        self.assertEqual(promo.compute_discount(Decimal('1000')), Decimal('1000'))

    def test_max_uses_exhausted_invalidates_code(self):
        promo = Promotion.objects.create(store=self.store, name='Limited', kind='code', code='LIM',
                                          discount_type='percentage', discount_value=Decimal('10'),
                                          max_uses=1, uses_count=1)
        self.assertFalse(promo.is_valid_now())

    def test_inactive_promo_invalid(self):
        promo = Promotion.objects.create(store=self.store, name='Off', kind='code', code='OFF',
                                          discount_type='percentage', discount_value=Decimal('10'), is_active=False)
        self.assertFalse(promo.is_valid_now())


class PromotionApiTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_create_coupon_uppercases_code(self):
        client = auth_client(self.owner)
        resp = client.post('/api/products/promotions/', {
            'name': 'Promo', 'kind': 'code', 'code': 'save10',
            'discount_type': 'percentage', 'discount_value': '10',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['code'], 'SAVE10')

    def test_duplicate_code_within_store_rejected(self):
        Promotion.objects.create(store=self.store, name='A', kind='code', code='DUP',
                                  discount_type='percentage', discount_value=Decimal('5'))
        client = auth_client(self.owner)
        resp = client.post('/api/products/promotions/', {
            'name': 'B', 'kind': 'code', 'code': 'DUP',
            'discount_type': 'percentage', 'discount_value': '5',
        }, format='json')
        self.assertEqual(resp.status_code, 400)
