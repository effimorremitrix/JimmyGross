import type { Guides } from "./types";

// The practice guide in English, line for line with fr.ts (the reference). The cabinet screens are
// in French, so buttons and fields keep their on-screen French name in bold, followed by an English
// gloss in brackets: the reader looks for the French word on screen.

export const GUIDES_EN: Guides = {
  agenda: {
    title: "Agenda: today's consents",
    intro:
      "The agenda shows, day by day, every appointment whose procedure needs consent: how far the patient has got, what they answered in the questionnaire, and which answers need a look before the procedure.",
    sections: [
      {
        heading: "Every morning",
        steps: [
          "Open [Agenda](/cabinet). The arrows and **Aujourd'hui** (today) change the day.",
          "Read the four counters: **Gestes avec consentement** (procedures with consent), **Signés** (signed), **En attente** (pending) and **Alertes à vérifier** (alerts to check).",
          "Work through the **À vérifier avant les gestes** card (check before procedures): call the patient if needed with **Appeler** (call), then click **Marquer vérifié** (mark checked). A second click undoes it; both are recorded in the log.",
          "An alert marked **Peut nécessiter un report** (may need postponing: fever, pregnancy, infection…) deserves a call before the day of the procedure.",
          "In **Patients du jour** (today's patients), chase those who have not signed with **Relancer** (remind), or **Envoyer maintenant** (send now) if the link has not gone out yet.",
        ],
      },
      {
        heading: "Reading the table",
        items: [
          "**Consentement** (consent): the patient's step (Créé, Envoyé, Ouvert, Fiche lue, Questionnaire rempli, Code SMS en attente, Signature en cours, Signé, Expiré, Annulé: created, sent, opened, sheet read, questionnaire done, SMS code pending, signing, signed, expired, cancelled). **Programmé** (scheduled) means a link that will go out automatically at the time shown.",
          "**Questionnaire**: **Non rempli** (not filled in), **RAS** (nothing to report) or **Alerte** (alert).",
          "**Preuve d'information** (proof of information): reading time, number of parts read and how many times the full text was opened.",
          "The **AES** badge marks an advanced signature (ID document and SMS) for this visit reason.",
          "Click the patient's name to open the request detail. Once signed, **PDF signé** (signed PDF) downloads the document.",
        ],
      },
      {
        heading: "Copying a link or reminding",
        items: [
          "**Copier un lien** (copy a link) creates a new link and copies it, to paste into the Doctolib appointment message. The old link stops working.",
          "**Relancer** (remind) sends a new link by SMS or e-mail; the patient keeps their progress. With no mobile or e-mail, copy a link.",
          "A link is valid for 10 days. After 5 wrong birth dates it locks: create a new one.",
        ],
      },
    ],
  },

  import: {
    title: "Importing the week's agenda",
    intro:
      "Drop your agenda's CSV export: every appointment whose visit reason needs consent gets its link automatically, by SMS or e-mail, before the appointment. Other visit reasons are ignored.",
    sections: [
      {
        heading: "Preparing the file",
        kind: "install",
        steps: [
          "Export the week's agenda from your software as CSV. An Excel file must first be saved as CSV (**Fichier › Enregistrer sous › CSV**, File › Save as › CSV).",
          "Recognised columns, in any order: date, time, last name, first name (or patient), birth date, phone, e-mail, visit reason. 2 MB maximum.",
          "The file contains patient data: delete it from your computer once the import is done. Éclaira keeps only its fingerprint.",
        ],
      },
      {
        heading: "Importing",
        steps: [
          "Open [Importer l'agenda](/cabinet/import) and choose the file under **Fichier de l'agenda (CSV)** (agenda file).",
          "Choose the **Canal** (channel): **SMS si mobile, sinon e-mail** (SMS if mobile, else e-mail), **E-mail si connu, sinon SMS** (e-mail if known, else SMS), or **SMS et e-mail** (both).",
          "Choose the **Envoi** (sending): **Automatique** (automatic), a few hours before each appointment (72 h by default), or **Tout envoyer maintenant** (send everything now).",
          "Check the **Aperçu** (preview): the columns detected and each row's status. The filters show one category at a time.",
          "Click **Créer N demande(s)** (create N requests). The result shows the links sent, the links scheduled and the rows that failed.",
        ],
      },
      {
        heading: "Row statuses",
        items: [
          "**À envoyer** (to send): a request will be created. \"sans date de naissance : code\" (no birth date: code) means the patient gets a code to open their link.",
          "**Sans consentement** (no consent): the visit reason is not linked to any template.",
          "**Passé** (past): the appointment is over. **Déjà créé** (already created): a request already exists for this appointment.",
          "**À corriger** (to fix): a value is missing or unreadable (date, time, name, contact). Fix the file and import it again; rows already created are recognised.",
        ],
      },
      {
        heading: "A visit reason is not recognised",
        steps: [
          "The **Motifs sans consentement** card (visit reasons without consent) lists the file's visit reasons that are not linked to any template.",
          "If that visit reason needs consent, choose the **Modèle** (template) and the **Geste prérempli** (prefilled procedure), then click **Demander un consentement pour ce motif** (ask for consent for this reason).",
          "The link is saved once and for all; the preview updates straight away.",
        ],
      },
    ],
  },

  nouveau: {
    title: "Creating a request by hand",
    intro:
      "For an appointment booked outside the import: the patient gets a link by SMS or e-mail, or you paste the link yourself into the Doctolib appointment message.",
    sections: [
      {
        heading: "Filling in the form",
        steps: [
          "Open [Nouvelle demande](/cabinet/nouveau).",
          "**Patient**: first name, last name, and preferably the **Date de naissance** (birth date), which checks identity when the link is opened. Without it, the patient gets a code.",
          "Add the **Téléphone mobile** (mobile) and/or **E-mail** for sending.",
          "**Rendez-vous** (appointment): date, time and **Motif Doctolib** (Doctolib visit reason). The procedure and the signature level fill in from the visit reason.",
          "Give the **Localisation prévue** (planned site, for example `right knee`) and the **Langue du patient** (patient's language).",
          "**Envoi** (sending): SMS, e-mail, both, or **Je colle le lien moi-même dans Doctolib** (I paste the link into Doctolib myself). Click **Créer la demande** (create the request).",
        ],
      },
      {
        heading: "After creating it",
        items: [
          "The patient link is shown only once: **Copier** (copy) it to paste into Doctolib. A new link is created later from the agenda with **Copier un lien**.",
          "**Voir la demande** (see the request) opens its detail; **Créer une autre demande** (create another) starts a blank form.",
          "A language whose translation is not yet approved on the [Modèles](/cabinet/modeles) page is replaced with French for this patient.",
        ],
      },
    ],
  },

  modeles: {
    title: "Templates: sheets, questionnaires and translations",
    intro:
      "Each template holds the information sheet, the consent statement and the pre-procedure questionnaire. A published version is frozen: a patient always signs the exact version they read.",
    sections: [
      {
        heading: "What the page shows",
        items: [
          "**Motifs Doctolib reliés** (linked Doctolib visit reasons): which visit reason triggers which template, with the prefilled procedure and the signature level.",
          "For each template: the version, the publication date, the parts of the sheet (patient summary and full text) and the questions.",
          "Question badges: **Report** (a \"yes\" may postpone the procedure), **Alerte** (to check) or **Info**.",
          "Changing a text or adding a template needs a new version: write to the Éclaira team. Proofs already signed never change.",
        ],
      },
      {
        heading: "Approving the summaries (doctor)",
        steps: [
          "Open each part of the **Fiche d'information** (information sheet) and read the **Résumé patient** (patient summary) next to the **Texte intégral** (full text).",
          "Click **J'ai relu et je valide les résumés** (I have read and approve the summaries). Only the doctor sees this button.",
          "Until the summaries are approved, patients read the full text.",
        ],
      },
      {
        heading: "Approving a translation (doctor)",
        steps: [
          "Under the template, open **Relire côte à côte** (read side by side) to read the translation line by line next to the French.",
          "Click **J'ai relu la traduction en … et je la valide** (I have read the translation and approve it). An incomplete translation cannot be approved.",
          "Before approval, a patient who asks for that language gets French. After it, SMS, screens and the signed document follow their language; the PDF names who approved the translation and states that the French original is the reference.",
        ],
      },
    ],
  },

  demande: {
    title: "Request detail",
    intro:
      "Everything about one patient and their procedure: questionnaire answers, proof of information, documents, timestamped log, confirmation of the procedure and actions.",
    sections: [
      {
        heading: "Before the procedure",
        steps: [
          "Open the request from the [Agenda](/cabinet) by clicking the patient's name.",
          "Read **Alertes du questionnaire** (questionnaire alerts) and click **Marquer vérifié** (mark checked) on each once handled.",
          "Go through **Questionnaire avant le geste** (pre-procedure questionnaire): \"Oui\" (yes) answers are highlighted, with the detail the patient gave.",
          "**Preuve d'information** (proof of information) shows the reading time and time of reading for each part, and whether the full text or the complete PDF were opened.",
        ],
      },
      {
        heading: "On the day (doctor)",
        steps: [
          "Once consent is signed, the **Confirmation du geste** card (confirm the procedure) offers the **Geste réalisé** (procedure performed) and the **Localisation** (site).",
          "Correct them if needed and click **Confirmer le geste** (confirm). Only the doctor can confirm.",
          "If the confirmed procedure differs from the one consented to, the page says so: a new consent is advised.",
        ],
      },
      {
        heading: "Documents and proof",
        items: [
          "**Documents**: the signed consent (PDF), the document before signature, the signature provider's audit trail, and the **Dossier de preuve (PDF)** (evidence file) that brings together reading, answers, checked alerts and the log.",
          "**Journal horodaté** (timestamped log): every event with its time, author and IP address. **Journal intègre** (log intact) confirms nothing was changed; **Journal altéré** (log altered) means contact the Éclaira team at once.",
          "**Alertes remplacées** (replaced alerts): the answers of a questionnaire the patient sent again, kept as proof.",
          "Every document download is logged.",
        ],
      },
      {
        heading: "Actions",
        items: [
          "**Copier un lien** (copy a link) and **Relancer** (remind) work as in the agenda; a new link disables the previous one.",
          "**Langue du patient** (patient's language) then **Changer** (change) switches the language until the patient has given consent.",
          "**Annuler la demande** (cancel the request) closes it: the link stops working. For a moved appointment, create a new request.",
        ],
      },
    ],
  },

  patient: {
    title: "What the patient sees",
    intro: "The patient's journey on their phone, to answer their questions on the phone. It takes about 5 minutes.",
    sections: [
      {
        heading: "The steps",
        steps: [
          "They receive an SMS or e-mail with the practitioner's name, the date and a personal link. No health data in the message.",
          "They confirm their identity with their birth date, or with a code sent by SMS or e-mail when the practice doesn't have it.",
          "**Fiche d'information** (information sheet): a summary per part, the doctor's full text one tap away, and the complete PDF.",
          "**Questionnaire**: the pre-procedure questions; a \"yes\" sometimes asks for a detail.",
          "**Consentement** (consent): they tick the statement and sign with a finger, or type their name.",
          "**Code SMS** (SMS code): they enter the code received to validate their signature. For an advanced signature they also go through the provider's ID document check.",
        ],
      },
      {
        heading: "When the patient calls",
        items: [
          "The link no longer opens: it expired (10 days), a newer link replaced it, or 5 wrong birth dates locked it. Send a new one with **Relancer** (remind).",
          "The code doesn't arrive: check the number in the request detail, then remind. The code is valid for 10 minutes, 5 attempts.",
          "They prefer another language: they can switch it themselves on their link until they have consented, or you change it in the request detail.",
          "They stopped half-way: their progress is kept, and they pick up where they left off with the same link or a new one.",
        ],
      },
    ],
  },
};
