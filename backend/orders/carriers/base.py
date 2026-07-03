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
