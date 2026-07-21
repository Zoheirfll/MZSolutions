from django.db import models
from django.conf import settings
from stores.models import Store
from products.models import Product, VariantOption
from core.validators import validate_image_extension, validate_image_size

CALL_STATUS_CHOICES = [
    ('no_answer',        'Pas répondu'),
    ('callback_tomorrow','Rappeler demain'),
    ('confirmed',        'Confirmé'),
    ('refused',          'Refus client'),
    ('invalid_number',   'Numéro invalide'),
    ('other',            'Autre'),
]

STATUS_CHOICES = [
    ('scheduled',   'Programmée'),
    ('pending',     'En attente de confirmation'),
    ('no_answer_1', 'Non joignable — 1ère tentative'),
    ('no_answer_2', 'Non joignable — 2ème tentative'),
    ('no_answer_3', 'Non joignable — 3ème tentative'),
    ('confirmed',   'Confirmée'),
    ('shipped',     'Expédiée'),
    ('delivered',   'Livrée'),
    ('returned',    'Retournée'),
    ('cancel_requested', "Demande d'annulation"),
    ('cancelled',        'Annulée'),
]

NO_ANSWER_STATUSES = ['no_answer_1', 'no_answer_2', 'no_answer_3']

DELIVERY_CHOICES = [
    ('store',     'Vendu depuis le magasin'),
    ('insurance', 'Assurance'),
    ('free',      'Livraison gratuite'),
    ('exchange',  'Échange'),
]

PAYMENT_METHOD_CHOICES = [
    ('cod',      'Paiement à la livraison'),
    ('chargily', 'Paiement en ligne (Chargily)'),
]

CARRIER_CHOICES = [
    ('yalidine',       'Yalidine'),
    ('zr_express',     'ZR Express'),
    ('noest',          'Noest'),
    ('guepex',         'Guepex'),
    ('maystro',        'Maystro'),
    ('waslet',         'Waslet'),
    ('imir',           'Imir'),
    ('dhd',            'DHD'),
    ('speedmail',      'SpeedMail'),
    ('worldexpress',   'Worldexpress'),
    ('ups',            'UPS'),
    ('anderson',       'Anderson'),
    ('ontime',         'OnTime'),
    ('yalitec',        'Yalitec'),
    ('assil_delivery', 'Assil Delivery'),
    ('zimou_express',  'Zimou Express'),
    ('tikjdadelivery', 'Tikjdadelivery'),
    ('ecomdz',         'EcomDz'),
    ('colireli',       'Colireli'),
    ('overed',         'Overed'),
    ('expediachrono',  'Expediachrono'),
    ('navex',          'Navex'),
    ('courier48hr',    '48HR Courrier Express'),
    ('pachers',        'Pachers'),
    ('lynx',           'Lynx'),
    ('tls',            'TLS'),
    ('siexpress',      'Siexpress'),
    ('chronorex',      'Chronorex'),
    ('mdm',            'MDM'),
]


class CarrierAccount(models.Model):
    store             = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='carrier_accounts')
    carrier           = models.CharField(max_length=20, choices=CARRIER_CHOICES)
    name              = models.CharField(max_length=100, blank=True)
    departure_wilaya  = models.CharField(max_length=100, blank=True)
    api_id            = models.CharField(max_length=100, blank=True)
    api_token         = models.CharField(max_length=200, blank=True)
    is_active         = models.BooleanField(default=True)
    is_default        = models.BooleanField(default=False)
    created_at        = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['carrier']
        unique_together = [('store', 'carrier')]

    def save(self, *args, **kwargs):
        if self.is_default:
            CarrierAccount.objects.filter(store=self.store, is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_carrier_display()} — {self.store.name}"


class Order(models.Model):
    store         = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='orders')
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    first_name    = models.CharField(max_length=100)
    last_name     = models.CharField(max_length=100, blank=True)
    phone         = models.CharField(max_length=30)
    wilaya        = models.CharField(max_length=100)
    commune       = models.CharField(max_length=100, blank=True)
    address       = models.TextField(blank=True)
    subtotal      = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shipping_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total         = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    promo_code       = models.CharField(max_length=30, blank=True)
    discount_amount  = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    delivery_type = models.CharField(max_length=20, choices=DELIVERY_CHOICES, blank=True)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='cod')
    chargily_checkout_id   = models.CharField(max_length=100, blank=True, db_index=True)
    chargily_payment_link  = models.URLField(blank=True)
    note           = models.TextField(blank=True)
    customer_email = models.EmailField(blank=True)
    external_ref   = models.CharField(max_length=100, blank=True, db_index=True, help_text="Identifiant de la commande sur un canal externe (ex: 'shopify:123456') — garantit l'idempotence des imports webhook")
    carrier                      = models.ForeignKey(CarrierAccount, null=True, blank=True, on_delete=models.SET_NULL, related_name='shipments')
    carrier_tracking_number      = models.CharField(max_length=100, blank=True)
    carrier_status               = models.CharField(max_length=50, blank=True)
    carrier_shipment_created_at  = models.DateTimeField(null=True, blank=True)
    dropshipper   = models.ForeignKey('team.TeamMember', null=True, blank=True, on_delete=models.SET_NULL, related_name='dropshipper_orders')
    scheduled_at  = models.DateTimeField(null=True, blank=True, help_text="Date/heure à laquelle une commande 'scheduled' doit être activée automatiquement (voir management command activate_scheduled_orders)")
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"#{self.pk} — {self.first_name} {self.last_name} ({self.get_status_display()})"

    def recalculate(self):
        self.subtotal = sum(i.price * i.quantity for i in self.items.all())
        self.total    = max(self.subtotal - self.discount_amount, 0) + self.shipping_cost
        self.save(update_fields=['subtotal', 'total'])


class OrderItem(models.Model):
    order          = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product        = models.ForeignKey(Product, null=True, blank=True, on_delete=models.SET_NULL)
    variant_option = models.ForeignKey(VariantOption, null=True, blank=True, on_delete=models.SET_NULL)
    product_name   = models.CharField(max_length=200)
    price          = models.DecimalField(max_digits=12, decimal_places=2)
    quantity       = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f"{self.product_name} x{self.quantity}"


class OrderStatusHistory(models.Model):
    order      = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='history')
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    changed_at = models.DateTimeField(auto_now_add=True)
    note       = models.TextField(blank=True)

    class Meta:
        ordering = ['changed_at']


class FailureReason(models.Model):
    store     = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='failure_reasons')
    label     = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    order     = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'label']

    def __str__(self):
        return self.label


class OrderAssignment(models.Model):
    order        = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='assignment')
    confirmateur = models.ForeignKey('team.TeamMember', null=True, blank=True, on_delete=models.SET_NULL, related_name='assigned_orders')
    assigned_at  = models.DateTimeField(auto_now_add=True)
    assigned_by  = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    def __str__(self):
        name = f"{self.confirmateur.first_name} {self.confirmateur.last_name}" if self.confirmateur else 'Non assigné'
        return f"#{self.order_id} → {name}"


class PaymentWebhookLog(models.Model):
    LOG_STATUS_CHOICES = [
        ('received',  'Reçu'),
        ('processed', 'Traité'),
        ('error',     'Erreur'),
    ]

    order          = models.ForeignKey(Order, null=True, blank=True, on_delete=models.SET_NULL, related_name='webhook_logs')
    event_type     = models.CharField(max_length=50, blank=True)
    checkout_id    = models.CharField(max_length=100, blank=True)
    raw_payload    = models.JSONField(default=dict)
    signature_valid = models.BooleanField(default=False)
    status         = models.CharField(max_length=20, choices=LOG_STATUS_CHOICES, default='received')
    error_message  = models.TextField(blank=True)
    received_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-received_at']

    def __str__(self):
        return f"{self.event_type or '?'} — {self.checkout_id or '?'} ({self.status})"


class AbandonedCart(models.Model):
    store            = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='abandoned_carts')
    first_name       = models.CharField(max_length=100, blank=True)
    last_name        = models.CharField(max_length=100, blank=True)
    phone            = models.CharField(max_length=30)
    email            = models.EmailField(blank=True)
    wilaya           = models.CharField(max_length=100, blank=True)
    items            = models.JSONField(default=list)
    total            = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reminder_sent    = models.BooleanField(default=False)
    reminder_sent_at = models.DateTimeField(null=True, blank=True)
    is_recovered     = models.BooleanField(default=False)
    recovered_at     = models.DateTimeField(null=True, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['store', 'phone']),
            models.Index(fields=['store', 'is_recovered', 'reminder_sent']),
        ]

    def __str__(self):
        return f"Panier abandonné #{self.pk} — {self.phone}"


class CallAttempt(models.Model):
    order          = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='call_attempts')
    agent          = models.ForeignKey('team.TeamMember', null=True, blank=True, on_delete=models.SET_NULL, related_name='call_attempts')
    attempt_number = models.PositiveSmallIntegerField(default=1)
    status         = models.CharField(max_length=20, choices=CALL_STATUS_CHOICES)
    failure_reason = models.ForeignKey(FailureReason, null=True, blank=True, on_delete=models.SET_NULL)
    note           = models.TextField(blank=True)
    attempted_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-attempted_at']

    def __str__(self):
        return f"#{self.order_id} — {self.get_status_display()}"


class CustomerRisk(models.Model):
    """Flag de risque manuel par (boutique, téléphone). Le calcul automatique
    (commandes cancelled/returned sur StoreSettings.risk_period_days) n'est
    jamais persisté ici — recalculé à la lecture, comme le low-stock."""
    store       = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='customer_risks')
    phone       = models.CharField(max_length=30)
    manual_risk = models.BooleanField(default=False)
    note        = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['store', 'phone'], name='unique_store_customer_risk')]

    def __str__(self):
        return f"Risque {self.phone} — {self.store.name}"


class BlacklistedPhone(models.Model):
    store            = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='blacklisted_phones')
    phone            = models.CharField(max_length=30)
    message          = models.TextField(blank=True)
    blocked_attempts = models.PositiveIntegerField(default=0)
    last_attempt_at  = models.DateTimeField(null=True, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['store', 'phone'], name='unique_store_blacklist_phone')]

    def __str__(self):
        return f"Blacklist {self.phone} — {self.store.name}"


COMPLAINT_STATUS_CHOICES = [
    ('open', 'Ouverte'), ('in_progress', 'En cours'), ('resolved', 'Résolue'),
]


class Complaint(models.Model):
    store       = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='complaints')
    order       = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='complaints')
    subject     = models.CharField(max_length=200)
    description = models.TextField()
    status      = models.CharField(max_length=20, choices=COMPLAINT_STATUS_CHOICES, default='open')
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Réclamation #{self.pk} — commande #{self.order_id}"


class ComplaintMessage(models.Model):
    complaint  = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name='messages')
    message    = models.TextField(blank=True)
    status     = models.CharField(max_length=20, choices=COMPLAINT_STATUS_CHOICES, blank=True)
    author     = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    attachment = models.ImageField(upload_to='complaints/', null=True, blank=True,
                                    validators=[validate_image_extension, validate_image_size])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Message réclamation #{self.complaint_id}"


class ComplaintAssignment(models.Model):
    complaint    = models.OneToOneField(Complaint, on_delete=models.CASCADE, related_name='assignment')
    confirmateur = models.ForeignKey('team.TeamMember', null=True, blank=True, on_delete=models.SET_NULL, related_name='assigned_complaints')
    assigned_at  = models.DateTimeField(auto_now_add=True)
    assigned_by  = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    def __str__(self):
        name = f"{self.confirmateur.first_name} {self.confirmateur.last_name}" if self.confirmateur else 'Non assigné'
        return f"#{self.complaint_id} → {name}"


EXCHANGE_STATUS_CHOICES = [
    ('open', 'En attente'), ('approved', 'Approuvé'), ('rejected', 'Refusé'),
]


class ExchangeRequest(models.Model):
    store              = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='exchange_requests')
    order_item         = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name='exchange_requests')
    replacement_option = models.ForeignKey(VariantOption, on_delete=models.CASCADE, related_name='exchange_requests')
    reason             = models.TextField()
    status             = models.CharField(max_length=20, choices=EXCHANGE_STATUS_CHOICES, default='open')
    vendor_note        = models.TextField(blank=True)
    created_at         = models.DateTimeField(auto_now_add=True)
    updated_at         = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Échange #{self.pk} — commande #{self.order_item.order_id}"
