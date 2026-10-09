import os
import shutil
import tempfile
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image

from core.images import MAX_SIDE
from core.test_utils import make_owner
from products.models import Product, ProductImage

_MEDIA = tempfile.mkdtemp(prefix='mz-test-media-')


def _upload(name, size, fmt='JPEG', quality=95, noisy=True):
    mode = 'RGB'
    image = Image.frombytes(mode, size, os.urandom(size[0] * size[1] * 3)) if noisy else Image.new(mode, size, (200, 30, 90))
    buffer = BytesIO()
    image.save(buffer, format=fmt, **({'quality': quality} if fmt == 'JPEG' else {}))
    return SimpleUploadedFile(name, buffer.getvalue(), content_type=f'image/{fmt.lower()}'), len(buffer.getvalue())


@override_settings(MEDIA_ROOT=_MEDIA)
class ImageOptimizationTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        _, self.store = make_owner()
        self.product = Product.objects.create(store=self.store, name='Produit', price=100)

    def _stored(self, record):
        record.refresh_from_db()
        record.image.open('rb')
        data = record.image.read()
        record.image.close()
        return Image.open(BytesIO(data)), len(data)

    def test_large_photo_is_resized_and_lighter(self):
        upload, original = _upload('grande.jpg', (2400, 1800))
        record = ProductImage.objects.create(product=self.product, image=upload)
        image, size = self._stored(record)
        self.assertLessEqual(max(image.size), MAX_SIDE)
        self.assertLess(size, original)

    def test_small_image_keeps_its_dimensions_and_never_gets_heavier(self):
        upload, original = _upload('petite.jpg', (200, 200), noisy=False, quality=40)
        record = ProductImage.objects.create(product=self.product, image=upload)
        image, size = self._stored(record)
        self.assertEqual(image.size, (200, 200))
        self.assertLessEqual(size, original)

    def test_gif_is_never_touched(self):
        buffer = BytesIO()
        Image.new('P', (3000, 100)).save(buffer, format='GIF')
        original = buffer.getvalue()
        upload = SimpleUploadedFile('anim.gif', original, content_type='image/gif')
        record = ProductImage.objects.create(product=self.product, image=upload)
        _, size = self._stored(record)
        self.assertEqual(size, len(original))

    def test_corrupt_image_does_not_block_saving(self):
        upload = SimpleUploadedFile('casse.jpg', b'pas une image du tout', content_type='image/jpeg')
        record = ProductImage.objects.create(product=self.product, image=upload)
        self.assertTrue(record.pk)
