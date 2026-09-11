from .yalidine import YalidineClient
from .zr_express import ZRExpressClient
from .noest import NoestClient
from .guepex import GuepexClient
from .maystro import MaystroClient
from .imir import ImirClient
from .dhd import DhdClient
from .speedmail import SpeedMailClient
from .worldexpress import WorldexpressClient
from .ups import UpsClient
from .anderson import AndersonClient
from .ontime import OnTimeClient
from .yalitec import YalitecClient
from .assil_delivery import AssilDeliveryClient
from .zimou_express import ZimouExpressClient
from .tikjdadelivery import TikjdadeliveryClient
from .ecomdz import EcomDzClient
from .colireli import ColireliClient
from .expediachrono import ExpediachronoClient
from .navex import NavexClient
from .courier48hr import Courier48HRClient
from .pachers import PachersClient
from .lynx import LynxClient
from .tls import TlsClient
from .siexpress import SiexpressClient
from .chronorex import ChronorexClient
from .mdm import MdmClient
from .colivraison import ColivraisonClient
from .elogistia import ElogistiaClient
from .near_delivery import NearDeliveryClient
from .easy_speed import EasySpeedClient
from .economiqua import EconomiquaClient
from .wecan import WeCanClient
from .speeddelivery import SpeedDeliveryClient
from .gsecommerce import GsEcommerceClient

_CLIENTS = {
    'yalidine':       YalidineClient,
    'zr_express':     ZRExpressClient,
    'noest':          NoestClient,
    'guepex':         GuepexClient,
    'maystro':        MaystroClient,
    'imir':           ImirClient,
    'dhd':            DhdClient,
    'speedmail':      SpeedMailClient,
    'worldexpress':   WorldexpressClient,
    'ups':            UpsClient,
    'anderson':       AndersonClient,
    'ontime':         OnTimeClient,
    'yalitec':        YalitecClient,
    'assil_delivery': AssilDeliveryClient,
    'zimou_express':  ZimouExpressClient,
    'tikjdadelivery': TikjdadeliveryClient,
    'ecomdz':         EcomDzClient,
    'colireli':       ColireliClient,
    'expediachrono':  ExpediachronoClient,
    'navex':          NavexClient,
    'courier48hr':    Courier48HRClient,
    'pachers':        PachersClient,
    'lynx':           LynxClient,
    'tls':            TlsClient,
    'siexpress':      SiexpressClient,
    'chronorex':      ChronorexClient,
    'mdm':            MdmClient,
    'colivraison':    ColivraisonClient,
    'elogistia':      ElogistiaClient,
    'near_delivery':  NearDeliveryClient,
    'easy_speed':     EasySpeedClient,
    'economiqua':     EconomiquaClient,
    'wecan':          WeCanClient,
    'speeddelivery':  SpeedDeliveryClient,
    'gsecommerce':    GsEcommerceClient,
}


def get_carrier_client(carrier_account):
    cls = _CLIENTS.get(carrier_account.carrier)
    if not cls:
        raise ValueError(f"Transporteur inconnu: {carrier_account.carrier}")
    return cls(carrier_account)
