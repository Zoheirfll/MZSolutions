from .ecotrack import EcotrackClient


class WorldexpressClient(EcotrackClient):
    carrier_code = 'worldexpress'
    api_domain = 'https://world-express.ecotrack.dz/'
