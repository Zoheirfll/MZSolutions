"""Contenu par défaut des pages légales publiques (/legal/terms/ et
/legal/privacy-policy/), servi tant qu'aucune version n'a été éditée dans
l'administration (« Contenu du site »).

Format : texte brut, paragraphes séparés par une ligne vide ; un paragraphe qui
commence par « ## » devient un titre, un paragraphe dont toutes les lignes
commencent par « - » devient une liste. Le rendu échappe tout le HTML.

⚠️ Rédigé à partir du fonctionnement réel de la plateforme. Il ne remplace pas
une relecture juridique : l'identité de l'exploitant (raison sociale, adresse,
registre du commerce) n'y figure volontairement pas, faute d'information fiable
dans le projet — à compléter depuis l'administration.
"""
from datetime import date

LEGAL_DEFAULTS_UPDATED = date(2026, 10, 9)

CONTACT_EMAIL = 'mzsolutions31@gmail.com'

TERMS_TITLE = "Conditions d'utilisation"
TERMS_BODY = f"""## 1. Objet

MZSolutions est une plateforme en ligne (SaaS) destinée aux vendeurs algériens. Elle permet de créer une boutique en ligne, de recevoir et confirmer des commandes, de les expédier via des sociétés de livraison, de suivre les retours et les paiements, et de gérer une équipe.

Les présentes conditions encadrent l'utilisation du site et du tableau de bord MZSolutions. En créant un compte ou en utilisant le service, vous les acceptez.

## 2. Compte et accès

Vous devez fournir des informations exactes lors de l'inscription et les tenir à jour. Vous êtes responsable de la confidentialité de vos identifiants et de toute action réalisée depuis votre compte, y compris par les membres de votre équipe que vous invitez.

Prévenez-nous sans délai à {CONTACT_EMAIL} si vous pensez que votre compte a été utilisé sans votre accord.

## 3. Essai gratuit et abonnement

Un essai gratuit est proposé à l'inscription, dans la limite d'une durée et d'un nombre de commandes indiqués sur le site. À l'issue de l'essai ou une fois la limite atteinte, la poursuite du service nécessite de souscrire un palier d'abonnement.

Les paliers, leurs limites et leurs prix sont affichés dans le tableau de bord, rubrique Abonnement. Le paiement s'effectue en ligne par l'intermédiaire de SofizPay ; MZSolutions ne conserve aucune donnée de carte bancaire. Une facture est mise à disposition dans le tableau de bord.

Toute demande de remboursement est à adresser à {CONTACT_EMAIL} et examinée par MZSolutions.

## 4. Vos obligations de vendeur

Vous êtes seul responsable de votre activité commerciale : produits proposés, prix, descriptions, stocks, délais, respect de la réglementation applicable (notamment en matière de consommation et de commerce électronique) et relation avec vos clients.

Vous vous engagez à :

- ne pas vendre de produits ou services illicites ou interdits ;
- ne pas utiliser la plateforme pour tromper vos clients ou envoyer des communications abusives ;
- ne pas tenter de contourner les limites techniques ou la sécurité du service ;
- respecter les droits de tiers sur les contenus que vous publiez (images, textes, marques).

## 5. Données de vos clients

Les données de vos clients (nom, téléphone, adresse, commandes) sont collectées pour votre compte. Vous en êtes le responsable de traitement et MZSolutions agit comme sous-traitant, dans les conditions décrites dans la politique de confidentialité. Vous devez informer vos clients de l'usage de leurs données et respecter la loi n° 18-07 relative à la protection des données à caractère personnel.

## 6. Sociétés de livraison et services tiers

Vous connectez vous-même vos comptes auprès des sociétés de livraison, des moyens de paiement et des autres services tiers. Les contrats, tarifs et délais relèvent de votre relation avec ces prestataires. MZSolutions n'est pas responsable de leurs défaillances, ni des retards, pertes ou dommages de colis.

L'intégration de certains transporteurs repose sur leurs interfaces publiques ; leur disponibilité et leur exactitude dépendent de ces prestataires.

## 7. Assistant IA

Le service peut proposer un assistant fondé sur l'intelligence artificielle (génération de fiches produit, suggestions de réponses, synthèses, prévisions). Ses réponses peuvent être inexactes ou incomplètes : vérifiez-les avant de vous y fier. Toute modification de vos données proposée par l'assistant n'est appliquée qu'après votre confirmation explicite.

## 8. Disponibilité du service

Nous faisons le nécessaire pour assurer un service continu, sans pouvoir garantir une disponibilité permanente ni l'absence d'erreur. Des interruptions peuvent survenir pour maintenance ou en raison d'incidents techniques ou de prestataires tiers.

## 9. Suspension et résiliation

Vous pouvez cesser d'utiliser le service à tout moment. MZSolutions peut suspendre ou fermer un compte en cas de manquement aux présentes conditions, d'usage abusif ou frauduleux, ou de non-paiement, après avoir indiqué le motif lorsque c'est possible.

## 10. Propriété intellectuelle

La plateforme, son code, son design et sa marque restent la propriété de MZSolutions. Vous conservez la propriété des contenus que vous y publiez et nous accordez le droit de les héberger et de les afficher dans le seul but de fournir le service.

## 11. Responsabilité

Dans les limites permises par la loi, MZSolutions ne répond pas des pertes indirectes (perte de ventes, de bénéfices ou de données) liées à l'usage ou à l'indisponibilité du service, ni des actes de vos clients, de vos équipes ou de prestataires tiers. Pensez à exporter régulièrement les données importantes pour votre activité.

## 12. Modification des conditions

Nous pouvons faire évoluer ces conditions. La date de dernière mise à jour figure en haut de la page ; la poursuite de l'utilisation du service après modification vaut acceptation.

## 13. Droit applicable et contact

Les présentes conditions sont soumises au droit algérien. À défaut de règlement amiable, les juridictions algériennes compétentes seront saisies.

Pour toute question : {CONTACT_EMAIL}."""

PRIVACY_TITLE = 'Politique de confidentialité'
PRIVACY_BODY = f"""## 1. Qui traite vos données

MZSolutions est une plateforme de gestion e-commerce pour les vendeurs. Cette politique décrit les données personnelles que nous traitons et pourquoi, conformément à la loi n° 18-07 du 10 juin 2018 relative à la protection des personnes physiques dans le traitement des données à caractère personnel.

Deux situations sont à distinguer :

- Pour les données de votre compte vendeur et de votre équipe, MZSolutions est responsable du traitement.
- Pour les données des clients de votre boutique (acheteurs), le vendeur est responsable du traitement et MZSolutions agit comme son sous-traitant, uniquement pour fournir le service.

## 2. Données que nous traitons

Compte vendeur et équipe : nom, prénom, adresse email, numéro de téléphone, photo de profil facultative, mot de passe (stocké sous forme chiffrée irréversible), rôle et permissions, informations de la boutique (nom, adresse web, coordonnées, réseaux sociaux).

Historique de sécurité : dates de connexion et de déconnexion, adresse IP et navigateur utilisé, journal des actions effectuées dans le tableau de bord.

Clients de la boutique : nom, numéro de téléphone, adresse email facultative, wilaya, commune et adresse de livraison, contenu des commandes, notes, réclamations et échanges, statut de livraison et de paiement.

Paiement : référence de transaction et statut fournis par SofizPay. MZSolutions ne reçoit ni ne conserve les numéros de carte bancaire.

Assistant IA : les questions que vous posez et les extraits de données de votre boutique nécessaires pour y répondre.

## 3. Pourquoi nous les utilisons

- fournir le service : gérer les commandes, les stocks, les expéditions, les paiements et l'équipe ;
- authentifier les utilisateurs et protéger les comptes contre les accès non autorisés ;
- facturer les abonnements ;
- répondre à vos demandes d'assistance ;
- améliorer et sécuriser la plateforme (journaux d'erreurs sans données personnelles de requête).

Nous ne vendons pas vos données et ne les utilisons pas à des fins publicitaires.

## 4. Avec qui elles sont partagées

Les données ne sont communiquées qu'à des prestataires nécessaires au service :

- SofizPay, pour les paiements en ligne ;
- les sociétés de livraison que vous connectez, pour créer et suivre les expéditions (nom, téléphone, adresse, montant à encaisser) ;
- Google, si vous vous connectez avec votre compte Google ;
- un service d'envoi d'emails, pour les messages de vérification, d'invitation et de réinitialisation ;
- un fournisseur d'intelligence artificielle, uniquement lorsque vous utilisez l'assistant IA ;
- Shopify, si vous connectez votre boutique Shopify : nous traitons automatiquement les demandes d'accès et de suppression de données qu'il nous transmet ;
- les services de mesure et de publicité (Facebook, TikTok, Google) que le vendeur choisit d'activer sur sa boutique, uniquement après le consentement du visiteur.

Des données peuvent être transmises aux autorités lorsque la loi l'exige.

## 5. Cookies et stockage local

Nous utilisons des cookies strictement nécessaires à la connexion (sécurisés et inaccessibles au code JavaScript du navigateur). Votre navigateur conserve aussi des préférences : langue, thème clair ou sombre, panier de la boutique et votre choix concernant les cookies.

Les pixels de mesure et de publicité d'une boutique ne se chargent qu'après votre acceptation dans la bannière affichée sur la boutique. Vous pouvez refuser sans perdre l'accès à la boutique.

## 6. Sécurité

Les connexions utilisent le chiffrement HTTPS. Les clés d'accès aux services tiers sont chiffrées en base de données, les mots de passe ne sont jamais stockés en clair, les accès sont limités selon le rôle de chaque membre d'équipe et les actions sensibles sont consignées dans un journal d'audit. Aucun système n'étant infaillible, nous vous invitons à utiliser un mot de passe unique et à nous signaler tout incident.

## 7. Durée de conservation

Les données sont conservées tant que le compte est actif et que le service l'exige. L'historique de connexion est conservé pour une durée limitée. À la fermeture d'un compte ou sur demande, les données sont supprimées ou anonymisées, sous réserve des obligations légales de conservation (notamment comptables et de facturation).

## 8. Vos droits

Conformément à la loi n° 18-07, vous disposez d'un droit d'information, d'accès, de rectification et d'opposition pour motif légitime sur vos données, ainsi que du droit de demander leur suppression dans les conditions prévues par la loi.

Si vous êtes un client d'une boutique, adressez votre demande directement au vendeur, qui est responsable du traitement ; nous l'aidons à y répondre. Pour les données de votre compte vendeur, écrivez à {CONTACT_EMAIL}. Nous répondons dans un délai raisonnable.

Vous pouvez également saisir l'Autorité nationale de protection des données à caractère personnel (ANPDP).

## 9. Mineurs

Le service s'adresse à des professionnels et n'est pas destiné aux personnes mineures.

## 10. Modifications

Cette politique peut évoluer ; la date de dernière mise à jour figure en haut de la page. En cas de changement important, les vendeurs en sont informés dans le tableau de bord.

## 11. Contact

Pour toute question relative à vos données : {CONTACT_EMAIL}."""

DEFAULT_PAGES = {
    'terms': (TERMS_TITLE, TERMS_BODY),
    'privacy-policy': (PRIVACY_TITLE, PRIVACY_BODY),
}
