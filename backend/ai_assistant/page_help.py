"""Registre central de l'aide contextuelle par page — texte fixe rédigé à
l'avance, jamais généré par un modèle (fiabilité garantie, aucune
description imprécise/datée). Source unique consommée à la fois par le
"?" du dashboard (`GET /api/ai/page-help/`) et par le chat (outil
`get_page_help`) — le chat réutilise EXACTEMENT le même texte, jamais une
paraphrase inventée.

Clé = route exacte (segments dynamiques `:id` conservés tels quels dans
App.jsx) — `PAGE_HELP.get(pathname)` côté frontend résout d'abord la route
exacte, puis retombe sur le préfixe le plus proche si la route contient un
paramètre (ex. `/dashboard/commandes/42` → `/dashboard/commandes/:id`)."""

PAGE_HELP = {
    '/dashboard': "Tableau de bord analytique — 4 onglets (Livraisons, Revenus, Confirmation, KPI) partageant le même filtre de période. L'onglet Livraisons montre l'entonnoir commandes → confirmées → expédiées avec des tuiles cliquables vers la liste filtrée.",
    '/dashboard/boutique': "Informations publiques de votre boutique (nom, logo, réseaux sociaux, devise) — ce qui apparaît sur votre boutique en ligne.",
    '/dashboard/parametres': "Vos informations de compte (avatar, mot de passe), les réglages généraux de la boutique (seuils, limites de commande, notifications) et votre historique de connexion.",
    '/dashboard/faq': "Questions fréquentes sur l'utilisation de la plateforme.",
    '/dashboard/contact': "Contacter le support MZSolutions.",
    '/dashboard/boutique/theme': "Personnalise l'apparence de votre boutique publique (couleurs, police, modèle visuel).",
    '/dashboard/boutique/pages': "Pages statiques personnalisées de votre boutique (À propos, CGV...) — éditeur de texte riche.",
    '/dashboard/boutique/pages/nouvelle': "Créer une nouvelle page statique pour votre boutique publique.",
    '/dashboard/boutique/pages/:id/modifier': "Modifier le contenu d'une page statique existante.",
    '/dashboard/boutique/menu': "Organise les liens du menu de navigation de votre boutique publique.",
    '/dashboard/boutique/fichiers': "Bibliothèque de fichiers/images réutilisables sur votre boutique (dossiers, upload, suivi de l'espace utilisé).",
    '/dashboard/stock': "Alertes de stock bas et inventaire complet paginé/recherchable — inclut une estimation du nombre de jours avant rupture pour chaque article, basée sur le rythme de vente réel des 14 derniers jours.",
    '/dashboard/stock/mouvements': "Historique complet et immuable de chaque changement de stock (vente, retour, annulation, ajustement manuel) — lecture seule, traçabilité totale.",
    '/dashboard/stock/retour-vendeur': "Même registre que Mouvement des stocks, filtré sur les entrées liées à un retour de commande, une annulation ou un échange.",
    '/dashboard/parametres-livraison': "Connecte vos comptes transporteurs (clé/jeton API), définit le transporteur par défaut, et configure votre grille tarifaire de livraison par wilaya/commune.",
    '/dashboard/produits': "Liste de votre catalogue produit — recherche, pagination, statut actif/inactif, aperçu de la fiche publique.",
    '/dashboard/produits/nouveau': "Créer un nouveau produit — détails, description, images, variantes, SEO. Peut être pré-rempli automatiquement si vous arrivez depuis un scan photo.",
    '/dashboard/produits/:id/modifier': "Modifier un produit existant — mêmes sections que la création (détails, description, images, variantes, SEO, autres réglages).",
    '/dashboard/produits/brouillons-ia': "Brouillons de fiches produit générés par un scan (photo ou facture fournisseur) — à valider avant création réelle. Rien n'est créé automatiquement.",
    '/dashboard/produits/scanner': "Prenez en photo un produit ou une facture fournisseur — l'IA propose une fiche produit pré-remplie (photo unique) ou plusieurs brouillons (facture multi-articles).",
    '/dashboard/produits/categories': "Gestion des catégories produit, avec corbeille (soft delete) avant suppression définitive.",
    '/dashboard/produits/fournisseurs': "Liste de vos fournisseurs — coordonnées, produits associés.",
    '/dashboard/produits/fournisseurs/credits': "Crédits accordés par vos fournisseurs (marchandise reçue non encore payée).",
    '/dashboard/produits/fournisseurs/versements': "Versements effectués à vos fournisseurs pour solder les crédits.",
    '/dashboard/produits/avis': "Modération des avis clients déposés sur votre boutique publique — approuver ou rejeter avant publication.",
    '/dashboard/produits/promotions/coupons': "Codes promo (% ou montant fixe) que le client saisit au checkout — fenêtre de validité et nombre d'utilisations optionnels.",
    '/dashboard/produits/promotions/auto': "Réductions automatiques appliquées sans code, ciblées sur des produits ou catégories précis.",
    '/dashboard/commandes': "Liste de toutes vos commandes — filtre par statut, recherche, changement de statut rapide, historique par commande.",
    '/dashboard/commandes/nouvelle': "Créer une commande manuellement (vente en magasin, commande téléphonique...).",
    '/dashboard/commandes/programmees': "Commandes préparées à l'avance avec une date d'envoi future — s'activent automatiquement à l'heure prévue.",
    '/dashboard/dispatch/confirmateur': "Règles qui routent automatiquement une commande vers un confirmateur précis selon le produit commandé.",
    '/dashboard/dispatch/transporteur': "Règles qui routent automatiquement une commande vers un transporteur précis selon le produit commandé.",
    '/dashboard/dispatch/wilaya': "Règles qui routent automatiquement une commande (confirmateur et/ou transporteur) selon la wilaya du client.",
    '/dashboard/commandes/raisons-echec': "Configuration des motifs d'échec d'appel, historique des tentatives ratées, et suivi des commandes en transit chez le transporteur.",
    '/dashboard/commandes/taux-confirmation': "Taux de confirmation par confirmateur sur une période — identifie qui traite bien (ou mal) ses commandes.",
    '/dashboard/commandes/:id': "Détail d'une commande — changer son statut, voir l'historique complet, gérer le transporteur, corriger une erreur client (wilaya/quantité).",
    '/dashboard/commandes/paniers-abandonnes': "Paniers créés côté boutique publique mais jamais transformés en commande — possibilité de relancer le client.",
    '/dashboard/commandes/annulations/demandes': "Demandes d'annulation client en attente de traitement.",
    '/dashboard/commandes/annulations/confirmees': "Historique des annulations déjà traitées.",
    '/dashboard/expeditions': "Vue centralisée des commandes expédiées — synchronisation manuelle du statut transporteur, téléchargement d'étiquette.",
    '/dashboard/boite-reception': "Boîte de réception unifiée : réclamations, échanges, et (à terme) messages Messenger/WhatsApp/Instagram, avec le contexte de la commande liée.",
    '/dashboard/boite-reception/:id': "Fil de discussion d'une conversation précise — répondre, changer le statut, voir le contexte de la commande associée.",
    '/dashboard/echanges': "Demandes d'échange produit déposées par vos clients — approuver ou rejeter, impact automatique sur le stock si approuvé.",
    '/dashboard/echanges/:id': "Détail d'une demande d'échange — article rendu, variante demandée, mouvements de stock générés.",
    '/dashboard/clients': "Liste de vos clients, agrégée par numéro de téléphone (pas de compte client) — historique de commandes, indicateur de risque.",
    '/dashboard/clients/risque': "Clients détectés à risque (annulations/retours répétés) ou marqués manuellement — réglage des seuils de détection automatique.",
    '/dashboard/clients/liste-noire': "Numéros de téléphone bloqués — toute nouvelle commande de ce numéro est automatiquement refusée.",
    '/dashboard/dropshipping': "Liste de vos dropshippers actifs avec leur solde (gagné/payé/à payer).",
    '/dashboard/dropshipping/:id': "Détail d'un dropshipper — configuration des commissions par produit, historique des paiements.",
    '/dashboard/mes-produits': "(Dropshipper) Sélection de produits du catalogue du vendeur que vous choisissez de revendre.",
    '/dashboard/mes-commissions': "(Dropshipper) Votre solde de commissions et l'historique des paiements reçus.",
    '/dashboard/finances/couts': "Saisie de vos coûts opérationnels et marketing, par période, pour le calcul de rentabilité.",
    '/dashboard/finances/rentabilite': "Revenus, coûts et profit net sur une période — détail par produit, wilaya ou canal de vente.",
    '/dashboard/paiements/pret': "Commandes livrées payées à la livraison (COD) pas encore reversées par le transporteur — pointage en masse.",
    '/dashboard/paiements/recupere': "Commandes COD déjà reversées — vérification de cohérence entre montant attendu et montant reçu.",
    '/dashboard/paiements/import-excel': "Importer le rapport de versement Excel d'un transporteur pour rapprochement automatique par numéro de suivi.",
    '/dashboard/canaux-vente': "Connecte votre boutique à Shopify, Google Sheets, ou expose votre catalogue à Meta Commerce.",
    '/dashboard/marketing': "Identifiants de pixels marketing (Facebook, TikTok, Google Analytics/Tag Manager) pour suivre vos conversions.",
    '/dashboard/webhooks': "Notifie automatiquement des outils externes (Zapier, Make...) des événements de votre boutique, ou reçoit des données depuis eux.",
    '/dashboard/assistant-ia': (
        "Chat avec l'assistant IA de la boutique, en trois volets :\n\n"
        "🔍 Répondre à des questions sur vos données — commandes, stock, clients à risque, "
        "rentabilité, équipe, retours, échanges, réclamations, coûts, paiements, abonnement, "
        "recommandations produit — et juger un chiffre en le comparant à la période précédente "
        "ou à un audit global de la boutique, jamais un chiffre isolé sans contexte.\n\n"
        "✏️ Proposer des modifications — produits (prix/stock/statut, un ou plusieurs à la fois, "
        "création), statut d'une commande précise, équipe (activer/désactiver un membre), "
        "transporteur par défaut, tarifs de livraison par wilaya, clients (risque manuel, liste "
        "noire), réglages boutique (seuils, frais d'assurance). Toujours un aperçu avant/après, "
        "jamais d'écriture sans votre confirmation.\n\n"
        "📷 Scanner un produit — depuis une photo (fiche pré-remplie) ou une facture fournisseur "
        "(plusieurs brouillons à valider), accessible via le lien dédié dans le menu IA."
    ),
    '/dashboard/produits/scanner': "Prenez en photo un produit ou une facture fournisseur — l'IA propose une fiche produit pré-remplie ou plusieurs brouillons à valider.",
    '/dashboard/expeditions/etiquettes': "Pipeline d'impression des étiquettes de livraison — en attente, générées, imprimées — avec fusion PDF pour plusieurs commandes.",
    '/dashboard/expeditions/preparees': "Commandes marquées comme physiquement préparées avant expédition.",
    '/dashboard/expeditions/retour-predictif': "Commandes en transit présentant un risque de retour (client à risque ou signal transporteur défavorable).",
    '/dashboard/expeditions/retours': "Commandes réellement retournées par le transporteur — confirmer la réception physique, restockage automatique.",
    '/dashboard/stats': "Statistiques globales — commandes, taux de confirmation, livrées/retournées/annulées, chiffre d'affaires, panier moyen.",
    '/dashboard/stats/commandes': "Évolution quotidienne des commandes et répartition par statut sur une période.",
    '/dashboard/stats/retours': "Nombre et taux de retour sur une période, avec évolution quotidienne.",
    '/dashboard/stats/echecs': "Répartition des échecs d'appel par motif configuré.",
    '/dashboard/stats/vente-stock': "Unités vendues par produit sur une période, basé sur les mouvements de stock réels.",
    '/dashboard/stats/produits': "Par produit : nombre de commandes, taux de confirmation, meilleure wilaya, meilleure source de vente.",
    '/dashboard/stats/confirmateurs': "Taux de confirmation par confirmateur — identique à la page Taux de confirmation sous Commandes.",
    '/dashboard/stats/wilayas': "Commandes, confirmations et revenu par wilaya.",
    '/dashboard/stats/sources': "Commandes, confirmations et revenu par canal de vente (boutique en ligne, dropshipper, vente manuelle).",
    '/dashboard/previsions-ventes': "Prévision du volume de ventes sur un horizon ajustable — toujours une fourchette basse/haute, jamais un chiffre présenté comme certain.",
    '/dashboard/previsions-retours': "Prévision du taux de retour sur un horizon ajustable, même principe que la prévision de ventes.",
    '/dashboard/recommandations': "Produits à mettre en avant (marge/stock/vélocité), produits en tendance, et associations de vente croisée — calcul déterministe, explication IA à la demande.",
    '/dashboard/audit-boutique': "Score global de santé de votre boutique (catalogue, confirmation/logistique, stock, retours) avec synthèse IA des points forts/faibles.",
    '/dashboard/suivi-confirmateurs': "Signaux de performance et d'anomalie par confirmateur (retards, échecs d'appel, taux d'annulation) sur les 30 derniers jours.",
    '/dashboard/equipe': "Gestion de votre équipe — inviter, désactiver, changer de rôle, voir qui est en ligne.",
    '/dashboard/equipe/permissions': "Matrice de permissions par rôle — ce que chaque confirmateur/admin/dropshipper peut voir et faire.",
    '/dashboard/audit': "Journal d'audit — historique de toutes les actions des membres de votre équipe (et de l'IA), qui a fait quoi et quand.",
    '/dashboard/abonnement': "Votre palier d'abonnement actuel, quota de commandes restant, et options de mise à niveau.",
}
