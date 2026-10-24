import type { ConsentBlock, InfoSection, Question } from "../types";

/**
 * Dr Jimmy Gross, "Fiche d'information et consentement avant infiltration
 * échoguidée" (corticoïde, anesthésique local, acide hyaluronique, PRP).
 * Transcribed from the practice's own form. Section 4's "attendue 6 et 12
 * semaines" is corrected to "entre 6 et 12 semaines" pending the doctor's OK.
 */
export const infiltrationTemplate = {
  slug: "infiltration-echoguidee",
  title: "Fiche d'information et consentement avant infiltration échoguidée",
  subtitle: "Corticoïde, anesthésique local, acide hyaluronique, Plasma Riche en Plaquettes (PRP)",
  intro: [
    "Ce document complète l'échange oral avec le médecin. Vous pouvez poser toutes vos questions avant de signer.",
    "Vous pouvez accepter, refuser, demander un délai de réflexion ou solliciter un second avis.",
    "Aucun résultat, délai d'amélioration ou pourcentage de réussite individuel ne peut être garanti.",
  ],
  sections: [
    {
      id: "pourquoi",
      title: "1. Pourquoi ce geste vous est-il proposé ?",
      summary: ["Le médecin dépose un produit au contact de la zone douloureuse, avec une aiguille guidée en temps réel par échographie.", "L'échographie rend le geste plus précis et limite le risque pour les structures voisines, sans le supprimer totalement."],
      paragraphs: [
        "Une infiltration peut être proposée pour une douleur articulaire, tendineuse, péri-articulaire, kystique, nerveuse ou rachidienne lorsqu'un traitement local paraît indiqué. Le geste consiste à déposer un produit au contact de la zone ciblée, avec une aiguille introduite à travers la peau, sous guidage échographique en temps réel.",
        "L'échographie permet de visualiser la zone à traiter, d'adapter la trajectoire de l'aiguille et de limiter le risque de lésion des structures voisines. Elle ne supprime toutefois pas totalement les risques liés à tout geste médical invasif.",
      ],
    },
    {
      id: "produits",
      title: "2. Produits pouvant être utilisés",
      summary: ["Quatre produits possibles : corticoïde, anesthésique local, acide hyaluronique, ou PRP (préparé à partir de votre propre sang).", "Le choix dépend de votre pathologie, de votre examen, de vos imageries et de la discussion avec le médecin."],
      paragraphs: [
        "Le choix du produit, de la localisation et du nombre éventuel de séances dépend de votre pathologie, de votre examen clinique, de vos imageries, de vos traitements et de la discussion médicale.",
      ],
      callouts: [
        {
          heading: "Les produits",
          tone: "neutral",
          items: [
            "Corticoïde : utilisé pour son effet anti-inflammatoire local.",
            "Anesthésique local : parfois associé pour améliorer le confort ou confirmer l'origine douloureuse.",
            "Acide hyaluronique : utilisé notamment dans certaines atteintes articulaires ou tendineuses.",
            "Plasma Riche en Plaquettes (PRP) : obtenu à partir de votre propre sang après prélèvement puis centrifugation.",
          ],
        },
      ],
    },
    {
      id: "benefices",
      title: "3. Bénéfices attendus et limites du traitement",
      summary: ["Objectif : moins de douleur et une meilleure fonction.", "Le résultat peut être complet, partiel, temporaire ou nul ; il peut aussi être différé.", "Aucun résultat n'est garanti, et la maladie peut continuer à évoluer même si le geste est bien réalisé."],
      paragraphs: [
        "L'objectif est de diminuer la douleur, d'améliorer la fonction et, dans certains cas, de faciliter la rééducation ou la reprise progressive des activités. L'efficacité est variable selon les patients, les pathologies, l'ancienneté des symptômes, l'importance des lésions sur l'imagerie, les antécédents chirurgicaux, le repos relatif et la rééducation associée.",
      ],
      callouts: [
        {
          heading: "À retenir",
          tone: "info",
          items: [
            "Une infiltration peut être efficace, partiellement efficace, temporairement efficace ou inefficace.",
            "Une amélioration peut être différée, surtout avec l'acide hyaluronique et le PRP.",
            "Le traitement vise le soulagement des symptômes ; il ne garantit pas la réparation de la lésion anatomique, la disparition définitive d'un kyste, l'évitement d'une chirurgie ou l'arrêt d'une évolution arthrosique.",
            "La pathologie initiale peut continuer à évoluer et les douleurs peuvent persister ou augmenter malgré un geste indiqué et techniquement bien réalisé.",
            "L'absence d'efficacité ou l'évolution naturelle de la pathologie ne constitue pas, en soi, une complication du geste.",
          ],
        },
      ],
    },
    {
      id: "prp",
      title: "4. Information spécifique concernant le PRP",
      summary: ["Le PRP vient de votre propre sang. Les preuves scientifiques varient selon les indications.", "L'amélioration est progressive, attendue entre 6 et 12 semaines ; une douleur passagère est possible les jours suivants.", "Effets indésirables du PRP : le plus souvent locaux et passagers. Les risques propres à toute injection restent possibles."],
      paragraphs: [
        "Le PRP est un produit autologue : il provient de votre propre sang. Il est utilisé en pratique musculo-squelettique dans certaines tendinopathies, atteintes articulaires ou lésions méniscales sélectionnées. Les données scientifiques sont variables selon les indications : elles peuvent être encourageantes dans certaines situations, limitées ou incertaines dans d'autres.",
        "Le délai d'amélioration est souvent progressif : elle est attendue entre 6 et 12 semaines après la dernière injection proposée. Une douleur inflammatoire transitoire peut survenir dans les jours suivant l'injection.",
      ],
      callouts: [
        {
          heading: "Tolérance du PRP",
          tone: "ok",
          items: [
            "Concernant le PRP, les effets indésirables décrits sont le plus souvent locaux, inflammatoires et transitoires.",
            "Selon les fiches d'information du GRIIP, à ce jour, aucun incident ou effet indésirable grave lié à l'usage du PRP sur l'appareil locomoteur n'a été décrit.",
            "Cette donnée rassurante ne supprime toutefois pas les risques liés au geste infiltratif lui-même, notamment douleur post-geste, hématome, malaise vagal ou infection, qui reste très rare mais potentiellement grave.",
          ],
        },
      ],
    },
    {
      id: "alternatives",
      title: "5. Alternatives possibles",
      summary: ["Autres options : surveillance, rééducation, médicaments, orthèse, autre produit, avis chirurgical ou second avis.", "Vous pouvez refuser, prendre le temps de réfléchir ou demander un autre avis, sans conséquence sur votre suivi."],
      paragraphs: [
        "Selon les cas, les alternatives peuvent comprendre : absence de geste et surveillance, adaptation des activités, rééducation, traitement antalgique ou anti-inflammatoire si autorisé, orthèse ou semelles, perte de poids si nécessaire, infiltration d'un autre produit, avis chirurgical ou autre avis spécialisé.",
        "Vous pouvez refuser le geste proposé, demander un délai de réflexion ou solliciter un second avis. Le refus du geste ne remet pas en cause votre prise en charge médicale.",
      ],
    },
    {
      id: "deroulement",
      title: "6. Déroulement pratique du geste",
      summary: ["Apportez vos imageries et ordonnances, et signalez allergie, infection, fièvre, grossesse possible, diabète, hypertension ou traitement anticoagulant.", "Le geste se fait sous échographie, avec désinfection et matériel stérile à usage unique, parfois sous anesthésie locale.", "Un pansement est posé ; un repos relatif est recommandé ensuite."],
      paragraphs: [],
      callouts: [
        {
          heading: "Étapes",
          tone: "neutral",
          items: [
            "Avant le geste : apportez vos examens d'imagerie récents, vos comptes rendus, votre ordonnance de traitement habituel, et signalez toute allergie, infection récente, fièvre, grossesse possible, diabète, hypertension, traitement anticoagulant ou antiagrégant.",
            "Pendant le geste : vous êtes installé(e) assis(e) ou allongé(e). La peau est désinfectée soigneusement. Le matériel utilisé est stérile et à usage unique. Le médecin guide l'aiguille sous échographie jusqu'à la zone ciblée. Une anesthésie locale peut être réalisée selon les cas.",
            "Après le geste : un pansement est mis en place. Un repos relatif est recommandé. Les consignes précises dépendent du produit injecté, de la localisation et de votre activité professionnelle ou sportive.",
          ],
        },
      ],
    },
    {
      id: "consignes",
      title: "7. Consignes après infiltration",
      summary: ["Repos relatif 48 heures, puis reprise progressive des activités et du sport.", "En cas de douleur : glace, repos, paracétamol si autorisé. Évitez les anti-inflammatoires autour d'une injection de PRP.", "Pas de bain, piscine ni jacuzzi pendant 24 heures."],
      paragraphs: [],
      callouts: [
        {
          heading: "Consignes",
          tone: "neutral",
          items: [
            "Repos relatif pendant 48 heures ou selon les recommandations données : éviter les efforts inhabituels, ports de charges et sollicitations importantes de la zone infiltrée.",
            "Reprise sportive progressive selon la localisation, le produit injecté et les consignes données.",
            "Douleur post-geste : glaçage, repos, paracétamol si autorisé.",
            "Éviter les anti-inflammatoires autour d'une injection de PRP sauf consigne contraire.",
            "Ne pas immerger le point de ponction dans un bain, une piscine ou un jacuzzi pendant 24 heures selon les consignes données.",
          ],
        },
      ],
    },
    {
      id: "risques",
      title: "8. Risques et complications possibles",
      summary: ["Le plus souvent : douleur passagère, petit hématome, malaise ou rougeur du visage après corticoïde.", "Rares mais graves : infection, allergie sévère, atteinte d'un nerf ou d'un vaisseau, saignement important, rupture de tendon.", "Fièvre, douleur qui augmente, rougeur, chaleur ou gonflement : contactez le cabinet au 06 07 96 03 19, votre médecin, ou le 15."],
      paragraphs: [
        "Comme tout geste médical, même réalisé dans des conditions adaptées de compétence, d'asepsie et de guidage échographique, une infiltration comporte des risques. La majorité des effets indésirables, lorsqu'ils surviennent, sont bénins et transitoires. Les complications graves sont rares à exceptionnelles, mais doivent être connues car elles peuvent nécessiter une prise en charge médicale urgente.",
        "Le guidage échographique, l'asepsie rigoureuse et l'utilisation de matériel stérile à usage unique visent à diminuer ces risques, sans pouvoir les supprimer totalement.",
      ],
      callouts: [
        {
          heading: "Effets assez fréquents ou possibles, habituellement bénins et transitoires",
          tone: "neutral",
          items: [
            "Douleur locale ou recrudescence douloureuse dans les heures ou jours suivant le geste.",
            "Ecchymose ou petit hématome au point de ponction ou de prélèvement sanguin.",
            "Malaise vagal, anxiété, sensation de chaleur, étourdissement.",
            "Flush après corticoïde : rougeur du visage/décolleté, généralement transitoire.",
          ],
        },
        {
          heading: "Effets rares ou nécessitant un avis médical si persistants ou importants",
          tone: "info",
          items: [
            "Hématome plus important ou hémarthrose.",
            "Réaction inflammatoire plus marquée après infiltration, notamment après PRP.",
            "Douleur inhabituelle ou persistante au-delà du délai habituel.",
            "Déséquilibre transitoire du diabète ou de la tension après corticoïde.",
            "Dépigmentation ou amincissement cutané après corticoïde.",
          ],
        },
        {
          heading: "Complications exceptionnelles mais potentiellement graves",
          tone: "danger",
          items: [
            "Infection articulaire, tendineuse ou des tissus mous.",
            "Réaction allergique sévère à un produit injecté, un anesthésique local ou un antiseptique.",
            "Atteinte d'un nerf, d'un vaisseau ou d'une structure voisine.",
            "Saignement important, surtout sous anticoagulant/antiagrégant ou en cas de trouble de coagulation.",
            "Rupture tendineuse, surtout après corticoïde et/ou reprise trop précoce ou excessive.",
            "Complication neurologique après geste rachidien ou péri-nerveux.",
          ],
        },
        {
          heading: "Signes devant faire consulter rapidement",
          tone: "warn",
          items: [
            "Fièvre, frissons, malaise général.",
            "Douleur intense, croissante ou inhabituelle, surtout si elle s'associe à un gonflement important.",
            "Rougeur, chaleur locale, écoulement, impotence fonctionnelle majeure.",
            "Tout symptôme neurologique inhabituel après un geste rachidien ou péri-nerveux.",
            "En cas de signe inquiétant, contactez immédiatement le cabinet au 06 07 96 03 19, votre médecin traitant, le 15 ou le service d'urgences le plus proche en dehors des horaires d'ouverture du cabinet.",
          ],
        },
      ],
    },
    {
      id: "financier",
      title: "9. Données financières et remboursement",
      summary: ["Certains gestes ou produits ne sont pas, ou pas entièrement, remboursés ; un devis vous est remis si nécessaire.", "Le paiement ne garantit pas le résultat, et un résultat insuffisant ne donne pas droit à un remboursement."],
      paragraphs: [
        "Certains gestes, produits ou techniques peuvent ne pas être pris en charge par l'Assurance Maladie ou peuvent faire l'objet d'un remboursement incomplet par les complémentaires santé. Un devis ou une information tarifaire vous est remis lorsque cela est nécessaire.",
        "Le paiement d'un geste non remboursé ou partiellement remboursé ne préjuge pas de son résultat clinique. L'absence d'efficacité ou l'évolution naturelle de la pathologie ne constitue pas, en soi, une indication automatique de remboursement du geste réalisé.",
      ],
    },
  ] satisfies InfoSection[],
  consent: {
    statement: [
      "Je reconnais avoir reçu une information claire, loyale et adaptée concernant le geste proposé, ses bénéfices attendus, ses limites, ses alternatives et ses risques, notamment le risque d'échec, d'efficacité partielle ou temporaire, de douleur post-geste, de complication directe rare et d'évolution défavorable de ma pathologie indépendamment du traitement réalisé.",
      "J'ai eu accès au texte intégral de la fiche d'information remise par le médecin ; un résumé m'en a également été présenté.",
      "Je reconnais avoir pu poser mes questions et avoir obtenu les réponses nécessaires. Je comprends qu'aucun résultat précis, aucun délai d'amélioration et aucun pourcentage individuel de réussite ne peuvent m'être garantis.",
      "Je consens à la réalisation du geste suivant, qui sera confirmé par le médecin le jour de l'acte.",
    ],
    actOptions: [
      "Infiltration de corticoïde",
      "Infiltration d'acide hyaluronique",
      "Injection de PRP",
      "Ponction / évacuation de kyste ou d'épanchement",
      "Infiltration rachidienne",
    ],
    collectEmergencyContact: true,
  } satisfies ConsentBlock,
  questions: [
    {
      id: "allergie",
      text: "Avez-vous une allergie connue à un médicament, produit antiseptique, latex, anesthésique local ou autre ?",
      detailPrompt: "Précisez l'allergie",
      flag: { severity: "warn", message: "Allergie déclarée", patientNotice: "Votre allergie sera signalée au médecin avant le geste." },
    },
    {
      id: "infection",
      text: "Avez-vous actuellement de la fièvre, une infection, une plaie ou une prise d'antibiotiques ?",
      detailPrompt: "Précisez",
      flag: {
        severity: "block",
        message: "Fièvre, infection ou antibiotiques en cours",
        patientNotice: "Le cabinet pourra vous contacter : le geste devra peut-être être reporté.",
      },
    },
    {
      id: "anticoagulant",
      text: "Prenez-vous un traitement anticoagulant ou antiagrégant ?",
      detailPrompt: "Nom du traitement",
      flag: {
        severity: "warn",
        message: "Anticoagulant ou antiagrégant déclaré",
        patientNotice: "Votre traitement sera vérifié par le médecin. Ne l'arrêtez pas sans avis médical.",
      },
    },
    {
      id: "coagulation",
      text: "Avez-vous des saignements fréquents, une maladie du sang ou des troubles de la coagulation ?",
      flag: { severity: "warn", message: "Trouble de la coagulation déclaré", patientNotice: "Ce point sera signalé au médecin." },
    },
    {
      id: "diabete",
      text: "Êtes-vous suivi(e) pour un diabète ?",
      detailPrompt: "Dernière HbA1c si connue",
      flag: { severity: "info", message: "Diabète suivi", patientNotice: "Ce point sera signalé au médecin." },
    },
    {
      id: "cardio",
      text: "Êtes-vous suivi(e) pour une hypertension artérielle ou une maladie cardiaque ?",
      flag: { severity: "info", message: "Hypertension ou maladie cardiaque", patientNotice: "Ce point sera signalé au médecin." },
    },
    {
      id: "grossesse",
      text: "Êtes-vous enceinte, susceptible de l'être ou allaitez-vous ?",
      flag: {
        severity: "block",
        message: "Grossesse possible ou allaitement",
        patientNotice: "Le cabinet vous contactera avant votre rendez-vous.",
      },
    },
    {
      id: "complication",
      text: "Avez-vous déjà eu une complication après infiltration, ponction, anesthésie locale ou prise de sang ?",
      detailPrompt: "Précisez",
      flag: { severity: "warn", message: "Antécédent de complication", patientNotice: "Ce point sera signalé au médecin." },
    },
    {
      id: "rachis",
      text: "Pour un geste rachidien : avez-vous été opéré(e) du rachis ou avez-vous un traitement anticoagulant ?",
      detailPrompt: "Précisez",
      onlyForActs: ["rachid", "rachis"],
      flag: { severity: "warn", message: "Chirurgie du rachis ou anticoagulant (geste rachidien)", patientNotice: "Ce point sera signalé au médecin." },
    },
  ] satisfies Question[],
};
