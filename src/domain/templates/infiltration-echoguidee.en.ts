import type { TemplateTranslation } from "../types";

/**
 * English translation of Dr Gross's infiltration form, item for item.
 * Patients see it only after the practitioner approves it on the Modèles page;
 * until then they get the French original.
 */
export const infiltrationTemplateEn: TemplateTranslation = {
  title: "Information sheet and consent before an ultrasound-guided injection",
  subtitle: "Corticosteroid, local anaesthetic, hyaluronic acid, Platelet-Rich Plasma (PRP)",
  intro: [
    "This document supplements your conversation with the doctor. You may ask any questions before signing.",
    "You may accept, refuse, ask for time to think it over, or seek a second opinion.",
    "No individual result, time to improvement or success rate can be guaranteed.",
  ],
  sections: {
    pourquoi: {
      title: "1. Why is this procedure being offered to you?",
      summary: [
        "The doctor places a product in contact with the painful area, using a needle guided in real time by ultrasound.",
        "Ultrasound makes the procedure more precise and reduces the risk to nearby structures, without removing it entirely.",
      ],
      paragraphs: [
        "An injection may be offered for joint, tendon, peri-articular, cyst-related, nerve or spinal pain when a local treatment seems appropriate. The procedure consists of placing a product in contact with the target area, using a needle inserted through the skin, under real-time ultrasound guidance.",
        "Ultrasound makes it possible to see the area to be treated, adjust the path of the needle and reduce the risk of injury to nearby structures. It does not, however, entirely remove the risks of any invasive medical procedure.",
      ],
    },
    produits: {
      title: "2. Products that may be used",
      summary: [
        "Four possible products: corticosteroid, local anaesthetic, hyaluronic acid, or PRP (prepared from your own blood).",
        "The choice depends on your condition, your examination, your imaging and your discussion with the doctor.",
      ],
      paragraphs: [
        "The choice of product, site and any number of sessions depends on your condition, your clinical examination, your imaging, your medication and the medical discussion.",
      ],
      callouts: [
        {
          heading: "The products",
          items: [
            "Corticosteroid: used for its local anti-inflammatory effect.",
            "Local anaesthetic: sometimes added to improve comfort or to confirm where the pain comes from.",
            "Hyaluronic acid: used in particular for certain joint or tendon conditions.",
            "Platelet-Rich Plasma (PRP): obtained from your own blood, which is drawn and then centrifuged.",
          ],
        },
      ],
    },
    benefices: {
      title: "3. Expected benefits and limits of the treatment",
      summary: [
        "Aim: less pain and better function.",
        "The result may be complete, partial, temporary or absent; it may also be delayed.",
        "No result is guaranteed, and the condition may continue to progress even if the procedure is carried out well.",
      ],
      paragraphs: [
        "The aim is to reduce pain, improve function and, in some cases, make rehabilitation or a gradual return to activities easier. Effectiveness varies with the patient, the condition, how long the symptoms have lasted, the extent of the lesions on imaging, previous surgery, relative rest and the associated rehabilitation.",
      ],
      callouts: [
        {
          heading: "Key points",
          items: [
            "An injection may be effective, partly effective, temporarily effective or ineffective.",
            "Improvement may be delayed, especially with hyaluronic acid and PRP.",
            "The treatment aims to relieve symptoms; it does not guarantee repair of the anatomical lesion, permanent disappearance of a cyst, avoidance of surgery or a halt to the progression of osteoarthritis.",
            "The original condition may continue to progress and the pain may persist or increase despite an appropriate and technically well-performed procedure.",
            "Lack of effect or the natural course of the condition is not, in itself, a complication of the procedure.",
          ],
        },
      ],
    },
    prp: {
      title: "4. Specific information about PRP",
      summary: [
        "PRP comes from your own blood. The scientific evidence varies with the indication.",
        "Improvement is gradual, expected between 6 and 12 weeks; temporary pain is possible in the following days.",
        "Side effects of PRP are mostly local and short-lived. The risks of any injection still apply.",
      ],
      paragraphs: [
        "PRP is an autologous product: it comes from your own blood. It is used in musculoskeletal practice for certain tendon conditions, joint conditions or selected meniscal lesions. The scientific data vary with the indication: they may be encouraging in some situations, limited or uncertain in others.",
        "Improvement is often gradual: it is expected between 6 and 12 weeks after the last planned injection. Temporary inflammatory pain may occur in the days following the injection.",
      ],
      callouts: [
        {
          heading: "Tolerance of PRP",
          items: [
            "For PRP, the side effects described are mostly local, inflammatory and short-lived.",
            "According to the GRIIP information sheets, to date no serious incident or adverse effect linked to the use of PRP on the musculoskeletal system has been described.",
            "This reassuring finding does not, however, remove the risks of the injection procedure itself, in particular post-procedure pain, bruising, vasovagal fainting or infection, which remains very rare but potentially serious.",
          ],
        },
      ],
    },
    alternatives: {
      title: "5. Possible alternatives",
      summary: [
        "Other options: monitoring, rehabilitation, medication, a brace, another product, a surgical opinion or a second opinion.",
        "You may refuse, take time to think, or ask for another opinion, with no effect on your care.",
      ],
      paragraphs: [
        "Depending on the case, alternatives may include: no procedure and monitoring, adapting your activities, rehabilitation, pain-relieving or anti-inflammatory treatment if permitted, a brace or insoles, weight loss if needed, an injection of another product, a surgical opinion or another specialist opinion.",
        "You may refuse the proposed procedure, ask for time to think it over or seek a second opinion. Refusing the procedure does not affect your medical care.",
      ],
    },
    deroulement: {
      title: "6. How the procedure is carried out",
      summary: [
        "Bring your imaging and prescriptions, and report any allergy, infection, fever, possible pregnancy, diabetes, high blood pressure or anticoagulant treatment.",
        "The procedure is done under ultrasound, with disinfection and sterile single-use equipment, sometimes under local anaesthetic.",
        "A dressing is applied; relative rest is recommended afterwards.",
      ],
      paragraphs: [],
      callouts: [
        {
          heading: "Steps",
          items: [
            "Before the procedure: bring your recent imaging, your reports and your usual prescription, and report any allergy, recent infection, fever, possible pregnancy, diabetes, high blood pressure, or anticoagulant or antiplatelet treatment.",
            "During the procedure: you are seated or lying down. The skin is carefully disinfected. The equipment used is sterile and single-use. The doctor guides the needle under ultrasound to the target area. A local anaesthetic may be given depending on the case.",
            "After the procedure: a dressing is applied. Relative rest is recommended. The exact instructions depend on the product injected, the site and your work or sporting activity.",
          ],
        },
      ],
    },
    consignes: {
      title: "7. Instructions after the injection",
      summary: [
        "Relative rest for 48 hours, then a gradual return to activities and sport.",
        "If you have pain: ice, rest, paracetamol if permitted. Avoid anti-inflammatories around a PRP injection.",
        "No bath, swimming pool or hot tub for 24 hours.",
      ],
      paragraphs: [],
      callouts: [
        {
          heading: "Instructions",
          items: [
            "Relative rest for 48 hours or as advised: avoid unusual effort, carrying loads and heavy use of the injected area.",
            "Gradual return to sport depending on the site, the product injected and the instructions given.",
            "Post-procedure pain: ice, rest, paracetamol if permitted.",
            "Avoid anti-inflammatories around a PRP injection unless told otherwise.",
            "Do not immerse the puncture site in a bath, swimming pool or hot tub for 24 hours, as instructed.",
          ],
        },
      ],
    },
    risques: {
      title: "8. Possible risks and complications",
      summary: [
        "Most often: temporary pain, a small bruise, feeling faint, or facial flushing after a corticosteroid.",
        "Rare but serious: infection, severe allergy, injury to a nerve or blood vessel, heavy bleeding, tendon rupture.",
        "Fever, increasing pain, redness, warmth or swelling: contact the practice on 06 07 96 03 19, your doctor, or call 15 (French emergency medical service).",
      ],
      paragraphs: [
        "Like any medical procedure, even when carried out with appropriate skill, asepsis and ultrasound guidance, an injection carries risks. Most side effects, when they occur, are mild and short-lived. Serious complications are rare to exceptional, but you should know about them because they may require urgent medical care.",
        "Ultrasound guidance, rigorous asepsis and the use of sterile single-use equipment aim to reduce these risks, but cannot remove them entirely.",
      ],
      callouts: [
        {
          heading: "Fairly common or possible effects, usually mild and short-lived",
          items: [
            "Local pain or a flare-up of pain in the hours or days following the procedure.",
            "Bruising or a small haematoma at the puncture or blood-draw site.",
            "Vasovagal fainting, anxiety, a feeling of warmth, dizziness.",
            "Flushing after a corticosteroid: redness of the face or chest, usually short-lived.",
          ],
        },
        {
          heading: "Rare effects, or effects that need medical advice if they persist or are significant",
          items: [
            "Larger haematoma or bleeding into the joint (haemarthrosis).",
            "A stronger inflammatory reaction after the injection, particularly after PRP.",
            "Unusual pain, or pain that lasts longer than usual.",
            "Temporary imbalance of diabetes or blood pressure after a corticosteroid.",
            "Loss of skin colour or thinning of the skin after a corticosteroid.",
          ],
        },
        {
          heading: "Exceptional but potentially serious complications",
          items: [
            "Infection of the joint, tendon or soft tissues.",
            "Severe allergic reaction to an injected product, a local anaesthetic or an antiseptic.",
            "Injury to a nerve, a blood vessel or a nearby structure.",
            "Heavy bleeding, especially under anticoagulant or antiplatelet treatment or with a clotting disorder.",
            "Tendon rupture, especially after a corticosteroid and/or a return to activity that is too early or too intense.",
            "Neurological complication after a spinal or peri-neural procedure.",
          ],
        },
        {
          heading: "Signs that require prompt medical attention",
          items: [
            "Fever, chills, feeling generally unwell.",
            "Severe, increasing or unusual pain, especially with significant swelling.",
            "Redness, local warmth, discharge, major loss of function.",
            "Any unusual neurological symptom after a spinal or peri-neural procedure.",
            "If you notice any worrying sign, contact the practice immediately on 06 07 96 03 19, your GP, call 15 (French emergency medical service) or go to the nearest emergency department outside the practice's opening hours.",
          ],
        },
      ],
    },
    financier: {
      title: "9. Costs and reimbursement",
      summary: [
        "Some procedures or products are not, or not fully, reimbursed; you will be given a quote if needed.",
        "Payment does not guarantee the result, and an insufficient result does not entitle you to a refund.",
      ],
      paragraphs: [
        "Some procedures, products or techniques may not be covered by French national health insurance (Assurance Maladie) or may be only partly reimbursed by complementary health insurance. A quote or price information is given to you when necessary.",
        "Payment for a procedure that is not, or only partly, reimbursed does not determine its clinical result. Lack of effect or the natural course of the condition is not, in itself, an automatic ground for a refund of the procedure performed.",
      ],
    },
  },
  consentStatement: [
    "I acknowledge that I have received clear, fair and appropriate information about the proposed procedure, its expected benefits, its limits, its alternatives and its risks, in particular the risk of failure, of partial or temporary effect, of post-procedure pain, of a rare direct complication and of an unfavourable course of my condition independent of the treatment performed.",
    "I have had access to the full text of the information sheet provided by the doctor; a summary of it was also presented to me.",
    "I acknowledge that I was able to ask my questions and received the answers I needed. I understand that no specific result, no time to improvement and no individual success rate can be guaranteed to me.",
    "I consent to the following procedure, which the doctor will confirm on the day it is performed.",
  ],
  questions: {
    allergie: {
      text: "Do you have a known allergy to a medicine, an antiseptic, latex, a local anaesthetic or anything else?",
      detailPrompt: "Please specify the allergy",
      patientNotice: "Your allergy will be reported to the doctor before the procedure.",
    },
    infection: {
      text: "Do you currently have a fever, an infection, a wound, or are you taking antibiotics?",
      detailPrompt: "Please specify",
      patientNotice: "The practice may contact you: the procedure may need to be postponed.",
    },
    anticoagulant: {
      text: "Are you taking an anticoagulant or antiplatelet treatment?",
      detailPrompt: "Name of the treatment",
      patientNotice: "The doctor will check your treatment. Do not stop it without medical advice.",
    },
    coagulation: {
      text: "Do you bleed easily, or have a blood disease or a clotting disorder?",
      patientNotice: "This will be reported to the doctor.",
    },
    diabete: {
      text: "Are you being treated for diabetes?",
      detailPrompt: "Latest HbA1c if known",
      patientNotice: "This will be reported to the doctor.",
    },
    cardio: {
      text: "Are you being treated for high blood pressure or a heart condition?",
      patientNotice: "This will be reported to the doctor.",
    },
    grossesse: {
      text: "Are you pregnant, could you be pregnant, or are you breastfeeding?",
      patientNotice: "The practice will contact you before your appointment.",
    },
    complication: {
      text: "Have you ever had a complication after an injection, a puncture, a local anaesthetic or a blood test?",
      detailPrompt: "Please specify",
      patientNotice: "This will be reported to the doctor.",
    },
    rachis: {
      text: "For a spinal procedure: have you had spinal surgery, or are you taking an anticoagulant?",
      detailPrompt: "Please specify",
      patientNotice: "This will be reported to the doctor.",
    },
  },
  acts: {
    "Infiltration de corticoïde": "Corticosteroid injection",
    "Infiltration d'acide hyaluronique": "Hyaluronic acid injection",
    "Injection de PRP": "PRP injection",
    "Ponction / évacuation de kyste ou d'épanchement": "Aspiration / drainage of a cyst or effusion",
    "Infiltration rachidienne": "Spinal injection",
  },
};
