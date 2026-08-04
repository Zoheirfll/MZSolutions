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

    def get_label(self, tracking_number):
        raise NotImplementedError


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
