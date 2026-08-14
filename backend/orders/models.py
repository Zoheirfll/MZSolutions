import uuid

from django.db import models
from django.conf import settings
from stores.models import Store
from products.models import Product, VariantOption, VariantSubOption
from core.validators import validate_image_extension, validate_image_size


def complaint_attachment_path(instance, filename):
    # Nom aléatoire (pas le nom original) — évite qu'une pièce jointe de
    # réclamation (potentiellement sensible) soit accessible via une URL
    # devinable/prévisible, les médias n'étant pas scopés par boutique au
    # niveau de la couche de service statique (Sécurité — point 7).
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    name = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex
    return f"complaints/{name}"

CALL_STATUS_CHOICES = [
    ('no_answer',        'Pas répondu'),
    ('callback_tomorrow','Rappeler demain'),
    ('confirmed',        'Confirmé'),
    ('refused',          'Refus client'),
    ('invalid_number',   'Numéro invalide'),
    ('other',            'Autre'),
]

STATUS_CHOICES = [
    ('scheduled',         'Programmée'),
    ('pending',           'En attente de confirmation'),
    ('no_answer_1',       'Non joignable — 1ère tentative'),
    ('no_answer_2',       'Non joignable — 2ème tentative'),
    ('no_answer_3',       'Non joignable — 3ème tentative'),
    ('no_answer',         'Sans réponse'),
    ('confirmed',         'Confirmée'),
    ('preparing',         'Préparation de commande'),
    ('prepared',          'Préparée'),
    ('in_progress',       'En cours'),
    ('shipped',           'Expédiée'),
    ('out_for_delivery',  'Sorti en livraison'),
    ('delivered',         'Livrée'),
    ('returned',          'Retournée'),
    ('cancel_requested',  "Demande d'annulation"),
    ('cancelled',         'Annulée'),
    ('duplicate',         'Commande double'),
    ('fake',              'Commande fictive'),
]

NO_ANSWER_STATUSES = ['no_answer_1', 'no_answer_2', 'no_answer_3']

# Sous-statut de suivi transporteur, posé MANUELLEMENT par le confirmateur/
# vendeur — indépendant du texte brut renvoyé par le transporteur
# (`Order.carrier_status`). Sert de tag de triage sur les commandes en cours
# de livraison (page "Suivi transporteur") : ex. "Injoignable" si le
# transporteur n'arrive pas à joindre le client, "Accepté" si le client a
# confirmé vouloir toujours le colis suite à une relance. N'affecte jamais
# `Order.status` ni aucun effet de bord (contrairement aux transitions de
# statut) — purement indicatif/organisationnel.
TRACKING_SUBSTATUS_CHOICES = [
    ('pending_processing', 'En attente de traitement'),
    ('accepted',           'Accepté'),
    ('cancelled',          'Annulé'),
    ('unreachable',        'Injoignable'),
]

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
    webhook_secret    = models.CharField(max_length=200, blank=True)
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


DISPATCH_MATCH_TYPE_CHOICES = [
    ('product', 'Par produit'),
    ('wilaya',  'Par wilaya'),
]


class DispatchRule(models.Model):
    """Règle de dispatch automatique (équivalent RiseCart "Dispatch Commandes")
    — à la création d'une commande dont un article correspond à `match_value`
    (match_type='product', recherche insensible à la casse dans le nom de
    l'article) ou dont la wilaya correspond exactement (match_type='wilaya'),
    le confirmateur et/ou le transporteur ciblés sont utilisés directement à
    la place du round-robin/transporteur par défaut. Voir
    `orders.utils.dispatch_confirmateur_for_order` et
    `orders.views._dispatch_carrier_for_order`. Au moins un des deux champs
    cible doit être renseigné (validé côté vue)."""
    store        = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='dispatch_rules')
    match_type   = models.CharField(max_length=10, choices=DISPATCH_MATCH_TYPE_CHOICES)
    match_value  = models.CharField(max_length=100, help_text="Nom de produit (recherche partielle) ou nom de wilaya exact selon match_type")
    confirmateur = models.ForeignKey('team.TeamMember', null=True, blank=True, on_delete=models.SET_NULL, related_name='dispatch_rules')
    carrier      = models.ForeignKey(CarrierAccount, null=True, blank=True, on_delete=models.SET_NULL, related_name='dispatch_rules')
    is_active    = models.BooleanField(default=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.get_match_type_display()} — {self.match_value}"


class WilayaRate(models.Model):
    """Grille tarifaire de livraison **saisie/figée par le vendeur**, par
    wilaya — distincte du tarif transporteur en temps réel (`get_rates()`,
    `CarrierRatesView`). Sert de source de vérité pour le prix affiché au
    client (`_resolve_shipping_cost`) une fois qu'une ligne existe pour la
    wilaya : le vendeur peut la corriger/majorer librement, ou la faire
    remplir automatiquement via "Mettre à jour depuis la société" (bouton
    RiseCart équivalent — `WilayaRateSyncView`, tarif réel du transporteur
    par défaut au moment du clic). Sans ligne, le calcul retombe sur l'appel
    transporteur en direct (comportement historique inchangé)."""
    store         = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='wilaya_rates')
    wilaya_id     = models.PositiveSmallIntegerField()
    wilaya_name   = models.CharField(max_length=100)
    home_price    = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Frais de livraison à domicile")
    desk_price    = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Frais de livraison au bureau/point relais — vide si non proposé")
    show_home     = models.BooleanField(default=True)
    show_desk     = models.BooleanField(default=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['wilaya_id']
        unique_together = [('store', 'wilaya_id')]

    def __str__(self):
        return f"{self.wilaya_name} — {self.store.name}"


class CommuneRate(models.Model):
    """Override optionnel de `WilayaRate` pour UNE commune précise, quand le
    tarif transporteur varie à l'intérieur de la wilaya (cas réel de
    Yalidine — voir `YalidineClient.get_commune_rates`, les autres
    transporteurs branchés n'exposent qu'un tarif par wilaya). Absence de
    ligne = la commune suit le tarif de sa wilaya (`WilayaRate`)."""
    store         = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='commune_rates')
    wilaya_id     = models.PositiveSmallIntegerField()
    commune_name  = models.CharField(max_length=100)
    home_price    = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    desk_price    = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['commune_name']
        unique_together = [('store', 'wilaya_id', 'commune_name')]

    def __str__(self):
        return f"{self.commune_name} ({self.wilaya_id}) — {self.store.name}"


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
    stop_desk     = models.BooleanField(default=False, help_text="Livraison en point relais (True) plutôt qu'à domicile (False) — affecte le tarif transporteur et le mode d'expédition envoyé à l'API")
    station_code  = models.CharField(max_length=20, blank=True, help_text="Code du bureau/point relais choisi (requis par certains transporteurs, ex: Noest, quand stop_desk=True)")
    tracking_substatus = models.CharField(max_length=20, choices=TRACKING_SUBSTATUS_CHOICES, blank=True, help_text="Tag de triage manuel posé par le confirmateur sur une commande en cours de livraison — indépendant du statut brut du transporteur")
    label_generated_at = models.DateTimeField(null=True, blank=True, help_text="Renseigné automatiquement la première fois que l'étiquette PDF de cette commande est téléchargée/générée")
    label_printed_at   = models.DateTimeField(null=True, blank=True, help_text="Renseigné quand le vendeur marque le ticket comme physiquement imprimé (pipeline Expéditions & Retours)")
    prepared_at         = models.DateTimeField(null=True, blank=True, help_text="Renseigné quand le colis a été physiquement préparé/emballé, avant remise au transporteur")
    return_validated_at = models.DateTimeField(null=True, blank=True, help_text="Renseigné quand le vendeur confirme avoir physiquement reçu et vérifié un colis retourné")
    restocked_at        = models.DateTimeField(null=True, blank=True, help_text="Renseigné dès que les articles de cette commande ont été remis en stock (retour validé ou annulation) — garde d'idempotence, évite un double restockage")
    stock_deducted_at   = models.DateTimeField(null=True, blank=True, help_text="Renseigné dès que le stock a été décrémenté pour cette commande — garde d'idempotence quand StoreSettings.deduct_stock_on_order_create est désactivé (déduction différée à la confirmation)")
    payment_collected_at     = models.DateTimeField(null=True, blank=True, help_text="Renseigné quand le vendeur pointe avoir reçu le versement COD du transporteur pour cette commande livrée (page Paiements — « Paiement récupéré »)")
    payment_collected_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Montant effectivement reçu du transporteur — peut différer de `total` (écart de versement), sert la vérification de cohérence")
    total         = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    promo_code       = models.CharField(max_length=30, blank=True)
    discount_amount  = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    delivery_types = models.JSONField(default=list, blank=True, help_text="Liste de codes DELIVERY_CHOICES — plusieurs types combinables (ex: Assurance + Échange)")
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
    variant_sub_option = models.ForeignKey(VariantSubOption, null=True, blank=True, on_delete=models.SET_NULL)
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
    attachment = models.ImageField(upload_to=complaint_attachment_path, null=True, blank=True,
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
    conversation       = models.OneToOneField('inbox.Conversation', null=True, blank=True, on_delete=models.SET_NULL, related_name='exchange_request', help_text="Fil de discussion de la boîte de réception unifiée (2026-08) — le reason du client et le vendor_note d'approbation y apparaissent comme messages")
    created_at         = models.DateTimeField(auto_now_add=True)
    updated_at         = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Échange #{self.pk} — commande #{self.order_item.order_id}"
