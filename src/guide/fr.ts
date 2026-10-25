import type { Guides } from "./types";

// Le guide d'utilisation du cabinet, texte de référence. Les boutons sont nommés exactement comme
// à l'écran. La version anglaise (en.ts) suit ce fichier ligne pour ligne : `guideProblems` refuse
// une ligne en trop, en moins, ou dont les liens et le code ne correspondent plus.
//
// Trois marques dans une ligne, rendues par guide-text.tsx :
//   `code`          → texte à taper, format de fichier
//   [Libellé](/x)   → lien vers une page du cabinet
//   **gras**        → le bouton ou le champ dont parle l'étape

export const GUIDES_FR: Guides = {
  agenda: {
    title: "Agenda : les consentements du jour",
    intro:
      "L'agenda montre, jour par jour, chaque rendez-vous dont le geste demande un consentement : où en est le patient, ce qu'il a répondu au questionnaire, et les réponses à vérifier avant le geste.",
    sections: [
      {
        heading: "Chaque matin",
        steps: [
          "Ouvrez [Agenda](/cabinet). Les flèches et **Aujourd'hui** changent de jour.",
          "Lisez les quatre compteurs : **Gestes avec consentement**, **Signés**, **En attente** et **Alertes à vérifier**.",
          "Traitez la carte **À vérifier avant les gestes** : pour chaque alerte, appelez le patient si besoin avec **Appeler**, puis cliquez **Marquer vérifié**. Un second clic annule la vérification ; les deux sont tracés dans le journal.",
          "Une alerte marquée **Peut nécessiter un report** (fièvre, grossesse, infection…) mérite un appel avant le jour du geste.",
          "Dans **Patients du jour**, relancez ceux qui n'ont pas signé avec **Relancer**, ou **Envoyer maintenant** si le lien n'est pas encore parti.",
        ],
      },
      {
        heading: "Lire le tableau",
        items: [
          "**Consentement** : l'étape où en est le patient (Créé, Envoyé, Ouvert, Fiche lue, Questionnaire rempli, Code SMS en attente, Signature en cours, Signé, Expiré, Annulé). **Programmé** indique un lien qui partira automatiquement à l'heure affichée.",
          "**Questionnaire** : **Non rempli**, **RAS** (aucune réponse à risque) ou **Alerte**.",
          "**Preuve d'information** : le temps de lecture, le nombre de parties lues et combien de fois le texte intégral a été ouvert.",
          "Le badge **AES** signale une signature avancée (pièce d'identité et SMS) pour ce motif.",
          "Cliquez sur le nom du patient pour ouvrir le détail de la demande. Une fois signé, **PDF signé** télécharge le document.",
        ],
      },
      {
        heading: "Copier un lien ou relancer",
        items: [
          "**Copier un lien** crée un nouveau lien et le copie, à coller dans le message de rendez-vous Doctolib. L'ancien lien cesse de fonctionner.",
          "**Relancer** envoie un nouveau lien par SMS ou e-mail ; le patient garde sa progression. Sans mobile ni e-mail, copiez un lien.",
          "Un lien est valable 10 jours. Après 5 dates de naissance erronées, il se bloque : créez-en un nouveau.",
        ],
      },
    ],
  },

  import: {
    title: "Importer l'agenda de la semaine",
    intro:
      "Déposez l'export CSV de votre agenda : chaque rendez-vous dont le motif demande un consentement reçoit son lien automatiquement, par SMS ou e-mail, avant le rendez-vous. Les autres motifs sont ignorés.",
    sections: [
      {
        heading: "Préparer le fichier",
        kind: "install",
        steps: [
          "Exportez l'agenda de la semaine depuis votre logiciel en CSV. Un fichier Excel doit d'abord être enregistré en CSV (**Fichier › Enregistrer sous › CSV**).",
          "Colonnes reconnues, dans n'importe quel ordre : date, heure, nom, prénom (ou patient), date de naissance, téléphone, e-mail, motif. 2 Mo maximum.",
          "Le fichier contient des données de patients : supprimez-le de votre ordinateur une fois l'import terminé. Éclaira n'en garde que l'empreinte.",
        ],
      },
      {
        heading: "Importer",
        steps: [
          "Ouvrez [Importer l'agenda](/cabinet/import) et choisissez le fichier dans **Fichier de l'agenda (CSV)**.",
          "Choisissez le **Canal** : **SMS si mobile, sinon e-mail**, **E-mail si connu, sinon SMS**, ou **SMS et e-mail**.",
          "Choisissez l'**Envoi** : **Automatique**, quelques heures avant chaque rendez-vous (72 h par défaut), ou **Tout envoyer maintenant**.",
          "Vérifiez l'**Aperçu** : les colonnes détectées et le statut de chaque ligne. Les filtres montrent une catégorie à la fois.",
          "Cliquez **Créer N demande(s)**. Le résultat indique les liens envoyés, programmés et les lignes en échec.",
        ],
      },
      {
        heading: "Statuts des lignes",
        items: [
          "**À envoyer** : une demande sera créée. « sans date de naissance : code » signifie que le patient recevra un code pour ouvrir son lien.",
          "**Sans consentement** : le motif n'est relié à aucun modèle.",
          "**Passé** : le rendez-vous est déjà passé. **Déjà créé** : une demande existe déjà pour ce rendez-vous.",
          "**À corriger** : une donnée manque ou est illisible (date, heure, nom, contact). Corrigez le fichier et importez-le de nouveau ; les lignes déjà créées sont reconnues.",
        ],
      },
      {
        heading: "Un motif n'est pas reconnu",
        steps: [
          "La carte **Motifs sans consentement** liste les motifs du fichier qui ne sont reliés à aucun modèle.",
          "Si ce motif demande un consentement, choisissez le **Modèle** et le **Geste prérempli**, puis cliquez **Demander un consentement pour ce motif**.",
          "L'association est enregistrée une fois pour toutes ; l'aperçu se met à jour aussitôt.",
        ],
      },
    ],
  },

  nouveau: {
    title: "Créer une demande à la main",
    intro:
      "Pour un rendez-vous pris hors import : le patient reçoit un lien par SMS ou e-mail, ou vous collez le lien vous-même dans le message de rendez-vous Doctolib.",
    sections: [
      {
        heading: "Remplir le formulaire",
        steps: [
          "Ouvrez [Nouvelle demande](/cabinet/nouveau).",
          "**Patient** : prénom, nom, et de préférence la **Date de naissance**, qui sert à vérifier l'identité à l'ouverture du lien. Sans elle, le patient reçoit un code.",
          "Ajoutez le **Téléphone mobile** et/ou l'**E-mail** pour l'envoi.",
          "**Rendez-vous** : date, heure et **Motif Doctolib**. Le geste et le niveau de signature se remplissent selon le motif.",
          "Précisez la **Localisation prévue** (par exemple `genou droit`) et la **Langue du patient**.",
          "**Envoi** : SMS, e-mail, les deux, ou **Je colle le lien moi-même dans Doctolib**. Cliquez **Créer la demande**.",
        ],
      },
      {
        heading: "Après la création",
        items: [
          "Le lien patient s'affiche une seule fois : **Copier** pour le coller dans Doctolib. Un nouveau lien se crée ensuite depuis l'agenda avec **Copier un lien**.",
          "**Voir la demande** ouvre son détail ; **Créer une autre demande** repart d'un formulaire vide.",
          "Une langue dont la traduction n'est pas encore validée sur la page [Modèles](/cabinet/modeles) est remplacée par le français pour ce patient.",
        ],
      },
    ],
  },

  modeles: {
    title: "Modèles : fiches, questionnaires et traductions",
    intro:
      "Chaque modèle regroupe la fiche d'information, la déclaration de consentement et le questionnaire avant le geste. Une version publiée est figée : un patient signe toujours la version exacte qu'il a lue.",
    sections: [
      {
        heading: "Ce que montre la page",
        items: [
          "**Motifs Doctolib reliés** : quel motif déclenche quel modèle, avec le geste prérempli et le niveau de signature.",
          "Pour chaque modèle : la version, la date de publication, les parties de la fiche (résumé patient et texte intégral) et les questions.",
          "Les pastilles des questions : **Report** (une réponse « oui » peut faire reporter le geste), **Alerte** (à vérifier) ou **Info**.",
          "Modifier un texte ou ajouter un modèle demande une nouvelle version : écrivez à l'équipe Éclaira. Les preuves déjà signées ne changent jamais.",
        ],
      },
      {
        heading: "Valider les résumés (médecin)",
        steps: [
          "Ouvrez chaque partie de la **Fiche d'information** et relisez le **Résumé patient** à côté du **Texte intégral**.",
          "Cliquez **J'ai relu et je valide les résumés**. Seul le médecin voit ce bouton.",
          "Tant que les résumés ne sont pas validés, les patients lisent le texte intégral.",
        ],
      },
      {
        heading: "Valider une traduction (médecin)",
        steps: [
          "Sous le modèle, ouvrez **Relire côte à côte** pour lire la traduction ligne à ligne à côté du français.",
          "Cliquez **J'ai relu la traduction en … et je la valide**. Une traduction incomplète ne peut pas être validée.",
          "Avant validation, un patient qui demande cette langue reçoit le français. Après, SMS, écrans et document signé suivent sa langue ; le PDF mentionne qui a validé la traduction et que l'original français fait référence.",
        ],
      },
    ],
  },

  demande: {
    title: "Détail d'une demande",
    intro:
      "Tout ce qui concerne un patient et son geste : réponses au questionnaire, preuve d'information, documents, journal horodaté, confirmation du geste et actions.",
    sections: [
      {
        heading: "Avant le geste",
        steps: [
          "Ouvrez la demande depuis l'[Agenda](/cabinet) en cliquant sur le nom du patient.",
          "Lisez **Alertes du questionnaire** et cliquez **Marquer vérifié** pour chacune une fois traitée.",
          "Parcourez **Questionnaire avant le geste** : les réponses « Oui » sont en couleur, avec le détail donné par le patient.",
          "**Preuve d'information** indique le temps de lecture et l'heure de lecture de chaque partie, et si le texte intégral ou le PDF complet ont été ouverts.",
        ],
      },
      {
        heading: "Le jour du geste (médecin)",
        steps: [
          "Une fois le consentement signé, la carte **Confirmation du geste** propose le **Geste réalisé** et la **Localisation**.",
          "Corrigez-les si besoin et cliquez **Confirmer le geste**. Seul le médecin peut confirmer.",
          "Si le geste confirmé diffère du geste consenti, la page le signale : un nouveau consentement est conseillé.",
        ],
      },
      {
        heading: "Documents et preuves",
        items: [
          "**Documents** : le consentement signé (PDF), le document avant signature, le fichier de preuve du prestataire de signature, et le **Dossier de preuve (PDF)** qui rassemble lectures, réponses, alertes vérifiées et journal.",
          "**Journal horodaté** : chaque événement avec son heure, son auteur et son adresse IP. **Journal intègre** confirme que rien n'a été modifié ; **Journal altéré** demande de contacter l'équipe Éclaira sans attendre.",
          "**Alertes remplacées** : les réponses d'un questionnaire renvoyé par le patient, conservées comme preuve.",
          "Chaque téléchargement de document est tracé.",
        ],
      },
      {
        heading: "Actions",
        items: [
          "**Copier un lien** et **Relancer** fonctionnent comme dans l'agenda ; un nouveau lien désactive le précédent.",
          "**Langue du patient** puis **Changer** modifie la langue tant que le patient n'a pas donné son consentement.",
          "**Annuler la demande** clôt la demande : le lien ne fonctionne plus. Pour un rendez-vous déplacé, créez une nouvelle demande.",
        ],
      },
    ],
  },

  patient: {
    title: "Ce que voit le patient",
    intro:
      "Le parcours du patient sur son téléphone, pour répondre à ses questions au téléphone. Il dure environ 5 minutes.",
    sections: [
      {
        heading: "Les étapes",
        steps: [
          "Il reçoit un SMS ou un e-mail avec le nom du praticien, la date et un lien personnel. Aucune donnée de santé dans le message.",
          "Il confirme son identité avec sa date de naissance, ou avec un code reçu par SMS ou e-mail quand le cabinet ne l'a pas.",
          "**Fiche d'information** : un résumé par partie, le texte intégral du médecin à un clic et le PDF complet.",
          "**Questionnaire** : les questions avant le geste ; un « oui » demande parfois une précision.",
          "**Consentement** : il coche la déclaration et signe au doigt, ou tape son nom.",
          "**Code SMS** : il saisit le code reçu pour valider sa signature. En signature avancée, il passe en plus par la vérification de pièce d'identité du prestataire.",
        ],
      },
      {
        heading: "Quand le patient appelle",
        items: [
          "Le lien ne s'ouvre plus : il a expiré (10 jours), un lien plus récent l'a remplacé, ou 5 dates de naissance erronées l'ont bloqué. Envoyez-en un nouveau avec **Relancer**.",
          "Le code n'arrive pas : vérifiez le numéro dans le détail de la demande, puis relancez. Le code est valable 10 minutes, 5 essais.",
          "Il préfère une autre langue : il peut changer lui-même sur son lien tant qu'il n'a pas consenti, ou vous la changez dans le détail de la demande.",
          "Il a interrompu le parcours : sa progression est gardée, il reprend là où il s'était arrêté avec le même lien ou un nouveau.",
        ],
      },
    ],
  },
};
