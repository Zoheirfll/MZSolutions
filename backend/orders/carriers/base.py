from dataclasses import dataclass, field


@dataclass
class ShipmentResult:
    tracking_number: str
    status: str
    raw_response: dict = field(default_factory=dict)


class BaseCarrierClient:
    carrier_code = None

    def __init__(self, carrier_account):
        self.carrier_account = carrier_account

    def create_shipment(self, order):
        raise NotImplementedError

    def get_status(self, tracking_number):
        raise NotImplementedError

    def get_status_info(self, tracking_number):
        """Statut détaillé pour la synchronisation automatique (voir
        `sync_carrier_tracking`) — {'carrier_status': texte affiché,
        'order_status': 'shipped'|'delivered'|'returned'|None}. `order_status`
        vaut None si le transporteur ne fournit pas de mapping fiable vers nos
        statuts (implémentation par défaut, sûre pour tout transporteur dont
        les libellés de statut n'ont pas été vérifiés en conditions réelles)."""
        return {'carrier_status': self.get_status(tracking_number), 'order_status': None}

    def get_label(self, tracking_number):
        raise NotImplementedError

    def get_rates(self, wilaya_id):
        """Tarif de livraison réel pour une wilaya donnée — {'tarif': ..,
        'tarif_stopdesk': ..} en DA, ou None si le transporteur n'expose pas
        cette info (mock, ou API sans grille tarifaire publique)."""
        return None

    def get_commune_rates(self, wilaya_id):
        """Tarifs par commune pour une wilaya donnée — {commune_name: {'tarif':
        .., 'tarif_stopdesk': ..}}, ou None si le transporteur ne tarife pas
        au niveau commune (la plupart : un seul tarif par wilaya, voir
        `get_rates`)."""
        return None

    def get_desks(self, wilaya_id):
        """Liste des bureaux/points relais (stop desk) pour une wilaya —
        [{'code': .., 'name': .., 'address': ..}], ou [] si le transporteur
        n'expose pas cette info ou ne supporte pas le point relais."""
        return []


def _generate_mock_label_pdf(tracking_number, carrier_code):
    from io import BytesIO
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    c = canvas.Canvas(buf)
    c.setFont('Helvetica-Bold', 16)
    c.drawString(50, 800, 'ÉTIQUETTE MOCK')
    c.setFont('Helvetica', 12)
    c.drawString(50, 770, f'Transporteur : {carrier_code}')
    c.drawString(50, 750, f'Tracking : {tracking_number}')
    c.drawString(50, 720, "Ceci n'est pas une vraie étiquette transporteur —")
    c.drawString(50, 705, "aucun compte réel n'est configuré pour ce transporteur.")
    c.showPage()
    c.save()
    return buf.getvalue()


class MockCarrierClient(BaseCarrierClient):
    """Client transporteur simulé — utilisé tant que les accès API réels
    (Yalidine, ZR Express) ne sont pas obtenus. Retourne un tracking number
    factice sans appel réseau."""

    def create_shipment(self, order):
        import uuid
        tracking_number = f"MOCK-{self.carrier_code}-{order.id}-{uuid.uuid4().hex[:6]}"
        return ShipmentResult(tracking_number=tracking_number, status='created', raw_response={'mock': True})

    def get_status(self, tracking_number):
        return 'created'

    def get_label(self, tracking_number):
        return _generate_mock_label_pdf(tracking_number, self.carrier_code or 'mock')
