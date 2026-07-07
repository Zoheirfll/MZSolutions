"""Codes wilaya (1-58) — miroir de frontend/src/data/wilayas.js, nécessaire
côté backend pour les API transporteurs (ex: Ecotrack) qui attendent un code
numérique plutôt que le nom stocké dans Order.wilaya."""
WILAYA_CODES = {
    'Adrar': 1, 'Chlef': 2, 'Laghouat': 3, 'Oum El Bouaghi': 4, 'Batna': 5,
    'Béjaïa': 6, 'Biskra': 7, 'Béchar': 8, 'Blida': 9, 'Bouira': 10,
    'Tamanrasset': 11, 'Tébessa': 12, 'Tlemcen': 13, 'Tiaret': 14, 'Tizi Ouzou': 15,
    'Alger': 16, 'Djelfa': 17, 'Jijel': 18, 'Sétif': 19, 'Saïda': 20,
    'Skikda': 21, 'Sidi Bel Abbès': 22, 'Annaba': 23, 'Guelma': 24, 'Constantine': 25,
    'Médéa': 26, 'Mostaganem': 27, "M'Sila": 28, 'Mascara': 29, 'Ouargla': 30,
    'Oran': 31, 'El Bayadh': 32, 'Illizi': 33, 'Bordj Bou Arréridj': 34, 'Boumerdès': 35,
    'El Tarf': 36, 'Tindouf': 37, 'Tissemsilt': 38, 'El Oued': 39, 'Khenchela': 40,
    'Souk Ahras': 41, 'Tipaza': 42, 'Mila': 43, 'Aïn Defla': 44, 'Naâma': 45,
    'Aïn Témouchent': 46, 'Ghardaïa': 47, 'Relizane': 48, 'Timimoun': 49,
    'Bordj Badji Mokhtar': 50, 'Ouled Djellal': 51, 'Béni Abbès': 52, 'In Salah': 53,
    'In Guezzam': 54, 'Touggourt': 55, 'Djanet': 56, "El M'Ghair": 57, 'El Meniaa': 58,
}


def wilaya_code(name):
    return WILAYA_CODES.get((name or '').strip())
