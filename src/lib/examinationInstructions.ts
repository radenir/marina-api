// @ts-nocheck
import { examinationIds, examinationDisplayNames } from './symptomGuidelines';
/**
 * Maps examination IDs to their detailed instructions
 * These instructions are taken directly from examinations.md
 */
export const examinationInstructions = {
  [examinationIds.CAPILLARY_REFILL]: `
  Capillary Refill test:Q1/1:
    • How many seconds did it take for color to return after pressing on the fingernail? [Normal: ≤3s adults, ≤2s children]
  `,
  [examinationIds.EYE_EXAM]: `
  Eye examination:Q1/9:
    • Is there redness around the iris, which is the colored part of the eye?
  
  Eye examination:Q2/9:
    • Is there redness around the white part?
  
  Eye examination:Q3/9:
    • Is there secretion or fluid, and if yes which color?
  
  Eye examination:Q4/9:
    • Are the pupils round?
  
  Eye examination:Q5/9:
    • Are the pupils the same size? 
  
  Eye examination:Q6/9:
    • How many millimeters in size would you estimate?
  
  Eye examination:Q7/9:
    • Do the pupils shrink when you shine light into one eye?
  
  Eye examination:Q8/9:
    • Can the person correctly count fingers at a 1 meter distance?
  
  Eye examination:Q9/9:
    • Gently pull down the lower eyelid and lift the upper eyelid. Is there any dust, foreign body or particles?
  `,
  [examinationIds.NOSE_CHECK]: `
  Nose check:Q1/9:
    • Is there swelling, bruising, or deformity around the nose?
  
  Nose check:Q2/9:
    • Is there redness or yellow secretion around the nose or in the nostrils? [infection]
  
  Nose check:Q3/9:
    • Is one or both nostrils blocked when breathing?
  
  Nose check:Q4/9:
    • Is there active bleeding? If yes, from one or both nostrils?
  
  Nose check:Q5/9:
    • [If there is active bleeding] Pinch the soft part of the nose for 5 minutes to control the bleeding. Let me know if we can continue.
  
  Nose check:Q6/9:
    • Is there any blood in the mouth or throat? [back-of-nose bleeding]
  
  Nose check:Q7/9:
    • Use a light to look inside the nostrils, is there crusting or clots?
  
  Nose check:Q8/9:
    • Can you see any foreign bodies in the nose?
  
  Nose check:Q9/9:
    • Press on both sides above eyebrows and cheeks below the eyes, does it hurt? [Sinusitis]
  `,
  [examinationIds.EARS_CHECK]: `
  Ears check:Q1/7:
    • Check the outer ear, is there any redness, swelling, or warmth?
  
  Ears check:Q2/7:
    • Press behind the ear and on the ear canal, does this hurt? 
  
  Ears check:Q3/7:
    • Check the ear canal: Is it swollen or filled with wax or fluid?
  
  Ears check:Q4/7:
    • If you can see the eardrum, is it shiny and grey? Or is it red or leaking fluid? 
  
  Ears check:Q5/7:
    • Press the underside of the jaw, can you feel any large or tender lymph nodes?
  
  Ears check:Q6/7:
    • Press from the jawline down the front/side of the neck, can you feel any large or tender lymph nodes?
  
  Ears check:Q7/7:
    • Can the person hear whispered words or finger rubbing near each ear? Test one ear at a time.
  `,
  [examinationIds.THROAT_CHECK]: `
  Throat check:Q1/6:
    • Use a flashlight. Push the tongue down with a tongue depressor or spoon. 
  
  Throat check:Q2/6:
    • Are the tonsils swollen or can you see white or yellowish patches?
  
  Throat check:Q3/6:
    • Is there any yellow secretion or redness?
  
  Throat check:Q4/6:
    • Are the tonsils symmetrical and of similar size?
  
  Throat check:Q5/6:
    • Does the patient have difficulty swallowing or breathing when asked?
  
  Throat check:Q6/6:
    • Can the patient open their mouth normally? How many fingers can you stack between their upper and lower teeth? [Trismus is suspected if the patient can only open their mouth ≤2 fingers vertically between upper and lower front teeth]
  `,
  [examinationIds.SIMPLE_NEURO]: `
  Simple neurologic check:Q1/6:
    • Ask the patient to smile. Does the face look symmetrical and normal? [Facial asymmetry]
  
  Simple neurologic check:Q2/6:
    • Ask the patient to show teeth. Does the face look symmetrical and normal? [Facial asymmetry]
  
  Simple neurologic check:Q3/6:
    • Ask the patient to raise eyebrows. Does the face look symmetrical and normal? [Facial asymmetry]
  
  Simple neurologic check:Q4/6:
    • Ask the patient to lift both arms, is there normal strength on both sides? [Motor strength]
  
  Simple neurologic check:Q5/6:
    • Ask the patient to lift one leg after the other, is there normal strength on both sides? [Motor strength]
  
  Simple neurologic check:Q6/6:
    • Is the speech clear or slurred? [Speech]
  `,
  [examinationIds.ADVANCED_NEURO]: `
  Advanced neurologic check:Q1/17:
    • Does the patient know their name, where they are and what day it is? [Orientation]
  
  Advanced neurologic check:Q2/17:
    • Is the speech clear or slurred? [Speech]
  
  Advanced neurologic check:Q3/17:
    • Show the patient a common item, like a pen or flash light. Can the patient name the item properly? [Aphasia]
  
  Advanced neurologic check:Q4/17:
    • Check the pupils [Pupils], are they similar in size and round?
  
  Advanced neurologic check:Q5/17:
    • Shine with a flashlight into one eye, then the other. Do the pupils get smaller when exposed to light?
  
  Advanced neurologic check:Q6/17:
    • Move a finger slowly from one side to the other, have the patient only follow with their eyes. Can they follow without jerky eye movements? [Nystagmus] Does this lead to double vision?
  
  Advanced neurologic check:Q7/17:
    • Ask the patient to smile. Does the face look symmetrical and normal? [Facial asymmetry]
  
  Advanced neurologic check:Q8/17:
    • Ask the patient to show teeth. Does the face look symmetrical and normal? [Facial asymmetry]
  
  Advanced neurologic check:Q9/17:
    • Ask the patient to raise eyebrows. Does the face look symmetrical and normal? [Facial asymmetry]
  
  Advanced neurologic check:Q10/17:
    • Ask the patient to swallow. Do they cough or choke afterwards?
  
  Advanced neurologic check:Q11/17:
    • Ask the patient to open their mouth. Are there any wounds on the tongue or lips?
  
  Advanced neurologic check:Q12/17:
    • Ask the patient to lift their shoulders. Is one side weaker?
  
  Advanced neurologic check:Q13/17:
    • Ask the patient to squeeze your hands in a handshake. Is one side weaker?
  
  Advanced neurologic check:Q14/17:
    • Ask the patient, while lying down, to lift one leg at a time from the bed. Then push it down. Is one side weaker?
  
  Advanced neurologic check:Q15/17:
    • Ask the patient to lift both arms straight and to close their eyes. Does one arm drift down?
  
  Advanced neurologic check:Q16/17:
    • Can the patient stand and walk across the room without any support?
  
  Advanced neurologic check:Q17/17:
    • Ask the patient to put their chin on their chest, is that possible? [Neck stiffness]
  `,
  [examinationIds.ABDOMEN_EXAM]: `
  Abdomen examination:Q1/5:
    • First, please look at the patient's abdomen. Is the belly more swollen or distended than normal?
  
  Abdomen examination:Q2/5:
    • Examine the abdomen visually. Are there any visible scars, surgical wounds, or lumps on the surface?
  
  Abdomen examination:Q3/5:
    • Observe the patient's general appearance. Does the person look pale or unwell?
  
  Abdomen examination:Q4/5:
    • Now press gently on all four quadrants of the abdomen. Is there pain in any specific area or quadrant?
  
  Abdomen examination:Q5/5:
    • Press firmly and then quickly release pressure on the abdomen. Is there pain when letting go (rebound tenderness) or do you notice tight belly muscles (guarding)?
  `,
  [examinationIds.BACK_PAIN]: `
  Back pain assessment:Q1/6:
    • Can you see any bruising, swelling or wounds on the back?
  
  Back pain assessment:Q2/6:
    • Press with your fingers on the bone along the spine, from the neck down to lower back. Does this hurt?
  
  Back pain assessment:Q3/6:
    • Press with your fingers 4 cm to each side of the spine along the muscles, from neck to lower back. Does this hurt?
  
  Back pain assessment:Q4/6:
    • Ask the patient to stand on tiptoes [tests S1] and to walk on heels [tests L4-L5]. Can they do it?
  
  Back pain assessment:Q5/6:
    • Ask the patient to bend their knee into a shallow squat and then stand up again [tests L3–L4]. Can they do it?
  
  Back pain assessment:Q6/6:
    • Touch the skin around the buttocks, the inner thighs, as well as the front and back of the thighs. Can the patient feel the touch normally? [saddle anaesthesia]
  `,
  [examinationIds.DEHYDRATION]: `
  Dehydration check:Q1/2:
    • Pull the skin up on the back of the patient´s hand. Does the skin quickly return to its original form? [Skin turgor]
  
  Dehydration check:Q2/2:
    • Are the tongue, lips or mouth rather dry?
  `,
  [examinationIds.LIMB_CIRCULATION]: `
  Limb circulation check:Q1/3:
    • [Always perform #1 Capillary refill time test as part of this exam]
    • [If the extremity is an arm] Place two fingers on the wrist, just below the base of the thumb. Can you feel the pulse equally on both sides? [Distal pulses]
    • [If the extremity is a leg] Try to feel the pulse on the top of each foot, just in front of the ankle. Can you feel the pulse equally on both sides?
  
  Limb circulation check:Q2/3:
    • Are both sides equally warm and have a similar color? If not, please explain. [Perfusion].
  
  Limb circulation check:Q3/3:
    • Compare the color of the nails, fingertips or toes between the affected and unaffected limbs. Do they look similar?
  `,
  [examinationIds.TESTICULAR]: `
  Testicular examination:Q1/4:
    • Can you see any swelling or redness?
  
  Testicular examination:Q2/4:
    • Does one testicle sit higher or in another position?
  
  Testicular examination:Q3/4:
    • Are the testicles similar in size?
  
  Testicular examination:Q4/4:
    • Feel each testicle with your fingers. Is there any tenderness, hard areas, or swelling?
  `,
  [examinationIds.PAIN_ASSESSMENT]: `
  Basic pain assessment:Q1/3:
    • Ask the patient how bad their pain is on a scale from 0 (no pain) to 10 (worst imaginable). [numeric pain rating scale = NPRS]
  
  Basic pain assessment:Q2/3:
    • In case of children younger than 8 years old, consider using Wong-Baker faces.
  
  Basic pain assessment:Q3/3:
    • Reassess 1-2 hours after treatment (e.g., paracetamol, ibuprofen). 
  `,
  [examinationIds.GENERAL_APPEARANCE]: `
  General appearance:Q1/6:
    • Can the patient talk freely and answer clearly?
  
  General appearance:Q2/6:
    • Is breathing difficult? Does the patient breathe through their mouth? 
  
  General appearance:Q3/6:
    • Does the person look more pale or grey than usual?
  
  General appearance:Q4/6:
    • Is the skin sweaty or warm to the touch?
  
  General appearance:Q5/6:
    • Are there any signs of trauma, such as wounds or bruising?
  
  General appearance:Q6/6:
    • Ask them to stand up and walk a few meters. Can they do it without assistance?
  `,
  [examinationIds.INFECTION_FOCUS]: `
  Infection focus check:Q1/5:
    • Ask the patient to take several deep breaths. Is there any cough or difficulty breathing? [Lungs]
  
  Infection focus check:Q2/5:
    • Look in the throat and around tonsils, is there redness or swelling? Any white patches or yellow fluid? [Throat]
  
  Infection focus check:Q3/5:
    • Check the chest, back, legs and arms. Can you see any redness, swelling, wounds, or insect bites? [Rash]
  
  Infection focus check:Q4/5:
    • Press on the whole belly and flanks, is there any pain? [Abdomen]
  
  Infection focus check:Q5/5:
    • Press the joints in both elbows, wrists, shoulders and knees. Does this hurt? [Joint]
  `,
  [examinationIds.CABCDE]: `
  C-ABCDE assessment:Q1/6:
    • Is the patient bleeding heavily? If yes, apply pressure. If pressure alone does not reduce the bleeding considerably, apply a tourniquet now. [C - Catastrophic bleeding]
  
  C-ABCDE assessment:Q2/6:
    • Can the person speak clearly? Is there noisy breathing or choking? Is there a foreign body or vomit in the mouth? [A - Airway]
  
  C-ABCDE assessment:Q3/6:
    • Is the breathing regular? Are both sides of the chest moving symmetrically? What is the oxygen saturation and how many breaths per minute? [B - Breathing]
  
  C-ABCDE assessment:Q4/6:
    • What are the pulse and blood pressure? Is the skin cold or pale, or warm and sweaty? How is the capillary refill time [perform #1]? [C - Circulation]
  
  C-ABCDE assessment:Q5/6:
    • Is the person alert? What is their AVPU score? What is their blood sugar if possible to measure? [D - Disability]
  
  C-ABCDE assessment:Q6/6:
    • Can you see any injuries, rashes or bruising? What is the body temperature? [E - Exposure]
  `,
  [examinationIds.THROMBOSIS_EDEMA]: `
  Thrombosis and edema check:Q1/5:
    • Are the legs, feet, or ankles swollen?
  
  Thrombosis and edema check:Q2/5:
    • Is one leg more swollen and clearly larger than the other?
  
  Thrombosis and edema check:Q3/5:
    • Press with both hands on the calf. Does it hurt?
  
  Thrombosis and edema check:Q4/5:
    • Press with your fingers into the groin area. Does it hurt?
  
  Thrombosis and edema check:Q5/5:
    • Press your thumb above the ankle, then release. Does a dent or dipped area remain in the skin? [pitting edema]
  `,
  [examinationIds.BREATHING_CHECK]: `
  Breathing check:Q1/8:
    • Can the person speak clearly? 
  
  Breathing check:Q2/8:
    • Is there noisy breathing or wheezing?
  
  Breathing check:Q3/8:
    • Is there a foreign body or vomit in the mouth? If yes, remove it. 
  
  Breathing check:Q4/8:
    • Is the breathing regular, with an even rhythm? 
  
  Breathing check:Q5/8:
    • Are both sides of the chest moving symmetrically? 
  
  Breathing check:Q6/8:
    • Is the breathing extremely deep and labored? [Kuss-Maul breathing]
  
  Breathing check:Q7/8:
    • If the patient reports pain in the chest, press where the pain sits. Is the area painful when pressed? 
  
  Breathing check:Q8/8:
    • [Only perform if the patient has pain] Now move your fingers further down from the pain, where the belly starts below the ribcage. Is this area painful when pressed?
  `,
  [examinationIds.SKIN_ASSESSMENT]: `
  Skin assessment:Q1/8:
    • Where is the skin condition located?
  
  Skin assessment:Q2/8:
    • Does the skin condition spread to other areas?
  
  Skin assessment:Q3/8:
    • Is it symmetrical or not?
  
  Skin assessment:Q4/8:
    • Is it flat? Or rather swollen or raised?
  
  Skin assessment:Q5/8:
    • Is it dry or weeping?
  
  Skin assessment:Q6/8:
    • Are there any blisters or open wounds?
  
  Skin assessment:Q7/8:
    • Gently press the rash: does the redness fade or stay?
  
  Skin assessment:Q8/8:
    • Gently touch the rash, is the skin warm or painful?
  `,
  [examinationIds.DENTAL_EXAM]: `
  Dental examination:Q1/10:
    • Is the face swollen or red? Is the face symmetrical?
  
  Dental examination:Q2/10:
    • Press on jaw and cheeks, does it hurt? If yes, where?
  
  Dental examination:Q3/10:
    • Feel beneath the jaw, can you feel any swollen or tender lymph nodes?
  
  Dental examination:Q4/10:
    • Can the patient open their mouth normally? How many fingers can you stack between their upper and lower teeth? [Trismus is suspected if the patient can only open their mouth ≤2 fingers vertically between upper and lower front teeth]
  
  Dental examination:Q5/10:
    • Can you see any sores or blisters on the lips or inside the mouth?
  
  Dental examination:Q6/10:
    • Is there any redness, yellow fluid, bleeding or swelling around the gums?
  
  Dental examination:Q7/10:
    • Are there cracks, chips, broken or missing teeth?
  
  Dental examination:Q8/10:
    • Are there any teeth that are more black or brown than the others?
  
  Dental examination:Q9/10:
    • Are there loose teeth?
  
  Dental examination:Q10/10:
    • Press on gums near the affected tooth, does it hurt?
  `,
  [examinationIds.WOUND_EXAM]: `
  Wound examination:Q1/9:
    • How long and wide is the wound in centimeters?
  
  Wound examination:Q2/9:
    • Are the edges even and smooth, or uneven and jagged?
  
  Wound examination:Q3/9:
    • Do the edges gap open, or are they close together?
  
  Wound examination:Q4/9:
    • Can you see fat, muscle, bone or tendons? Tendons are white and cord-like.
  
  Wound examination:Q5/9:
    • Is there sign of infection, like redness or yellow secretion?
  
  Wound examination:Q6/9:
    • Is there any dirt, metal or other debris inside the wound? Rinse with clean water if necessary and look again.
  
  Wound examination:Q7/9:
    • [Only if the wound is located on an extremity like arm or leg] Check the skin further down from the wound, for example in fingers. Is the skin warm and of normal color?
  
  Wound examination:Q8/9:
    • [Only if the wound is located on an extremity like arm or leg] Gently touch the skin, can the person feel it?
  
  Wound examination:Q9/9:
    • [Only if the wound is located on an extremity like arm or leg] Can the patient move the extremity with limitation?
  `,
  [examinationIds.ABDOMINAL_PAIN]: `
  Abdominal pain exam:Q1/6:
    • Please position the patient lying flat on their back with abdomen exposed from below the chest to the groin. Can you see any distension, asymmetry, discoloration, or surgical scars?

  Abdominal pain exam:Q2/6:
    • Using the pads of your fingers, gently press (about 1 cm deep) across all four quadrants of the abdomen. Is there any area of tenderness or guarding when you press?

  Abdominal pain exam:Q3/6:
    • Now using the flat of your hand, apply deeper pressure (4-5 cm) systematically across all quadrants. Do you feel any masses, organ enlargement, or areas of deep tenderness?

  Abdominal pain exam:Q4/6:
    • Place your hand under the right rib cage and ask the patient to take a deep breath while maintaining pressure. Does the patient stop breathing or wince in pain during inspiration?

  Abdominal pain exam:Q5/6:
    • Press firmly on the left lower quadrant of the abdomen. Does this cause pain on the right side of the abdomen?

  Abdominal pain exam:Q6/6:
    • Locate a point approximately one-third of the way from the right hip bone to the umbilicus. Apply gentle but firm pressure at this point. Is there localized pain or tenderness at McBurney's point?
  `,
  [examinationIds.JOINT_EXAM]: `
  Joint examination:Q1/7:
    • Compare the joints to the other side, is there any swelling?
  
  Joint examination:Q2/7:
    • Is the joint or area around red and warm?
  
  Joint examination:Q3/7:
    • Is the joint deformed or looks unusual?
  
  Joint examination:Q4/7:
    • When you press on the joint, is it hard and bony or soft?
  
  Joint examination:Q5/7:
    • When you press, does it hurt?
  
  Joint examination:Q6/7:
    • Ask the person to move the joint as far as they can. Can they move it fully, partly, or not at all?
  
  Joint examination:Q7/7:
    • Does it hurt when they move it?
  `,
  [examinationIds.MENTAL_EVAL]: `
  Mental health check:Q1/3:
    • Does the patient seem to hallucinate or appear out of touch with reality? Ask: "Have you seen or heard things that others don't see or hear?" "Do you feel someone is watching or following you?" "Do you believe others want to harm you?"
  
  Mental health check:Q2/3:
    • Does the patient show signs of aggression or could they be a danger to others? Observe for threatening behavior, agitation, or hostile statements.
  
  Mental health check:Q3/3:
    • Is the patient having thoughts of harming themselves? Ask directly: "Are you thinking about hurting yourself?" "Have you thought about ending your life?" "Do you have a plan to do it?"
  `,
  [examinationIds.PULSE_CHECK]: `
  Pulse check:Q1/3:
    • Use your index and middle fingers and place them on the wrist on the thumb side, or on the neck beside the windpipe.
  
  Pulse check:Q2/3:
    • Press gently until you feel the pulse beat. Is it regular?
  
  Pulse check:Q3/3:
    • [If the user is unsure, you can explain that: A regular pulse has an even rhythm, "beat–beat–beat–beat" like a steady drum. An irregular pulse may skip beats, have pauses, vary in timing: "beat–beat–pause–beat–beat"]
  `,
  [examinationIds.VIOLENCE_CHECK]: `
  Violence checklist:Q1/6:
    • [Based on Brøset Violence checklist, each symptom present gives 1 point, maximum of 6 points]
    • Does the patient appear confused or disoriented? They may not know where they are, what time it is, or who people are [Confusion]
  
  Violence checklist:Q2/6:
    • Does the patient react with anger or frustration to minor issues, appear annoyed, or easily lose patience? [Irritability]
  
  Violence checklist:Q3/6:
    • Does the patient behave in an excessively noisy or rowdy manner, possibly talking loudly, shouting, or making disruptive noises? [Boisterousness]
  
  Violence checklist:Q4/6:
    • Does the patient make threats of harm toward others or themselves, use threatening language, or exhibit aggressive speech patterns? [Verbal threats]
  
  Violence checklist:Q5/6:
    • Does the patient show threatening physical gestures, postures, or behavior that indicates potential for violent action? (e.g., clenched fists, invading personal space aggressively) [Physical threats]
  
  Violence checklist:Q6/6:
    • Does the patient strike or damage objects, such as throwing items, hitting walls or slamming doors? [Attacking objects]
  `,
  [examinationIds.INJURY_ASSESSMENT]: `
  Local Injury Assessment:Q1/8:
    • Does the injury look crooked, deformed or out of place?
  
  Local Injury Assessment:Q2/8:
    • Is there any open wound, bruising, or swelling? 
  
  Local Injury Assessment:Q3/8:
    • Is it painful when touched?
  
  Local Injury Assessment:Q4/8:
    • Can you feel any abnormal bumps, gaps, or crunching under the skin?
  
  Local Injury Assessment:Q5/8:
    • Can the person move the joint or limb normally?
  
  Local Injury Assessment:Q6/8:
    • Ask them to bend and straighten the part. Is the motion limited?
  
  Local Injury Assessment:Q7/8:
    • Is the strength similar to the other side?
  
  Local Injury Assessment:Q8/8:
    • Touch the skin below the injury. Does it feel normal, or is there any numbness, tingling, or loss of feeling?
    • [For ankle area injury]: Press along the outside of the lower leg, where the fibula bone runs up to the knee. Does it hurt?
    • [For wrist, hand or forearm injury]: Can the patient bend and straighten the elbow without limitations or pain?
    • [For upper arm, shoulder injury]: Can the patient bend and straighten the elbow without limitations or pain? Can the patient lift the whole arm out to the side and back down without pain or difficulty?
    • [For knee area injury]: Can the patient bend the ankle up and down, and move the foot side to side, without pain or difficulty? Can the patient move the hip by lifting the leg forward, backward, and sideways without pain or trouble?
  `,
  [examinationIds.MALE_GENITAL]: `
  Male Genital inspection:Q1/6:
    • Put on gloves. Does the patient give consent to the exam?
  
  Male Genital inspection:Q2/6:
    • Look at the penis and foreskin, can you see any wounds, warts or blisters?
  
  Male Genital inspection:Q3/6:
    • Is there any sign of redness, swelling or discharge? 
  
  Male Genital inspection:Q4/6:
    • Gently press on the penis, are there any painful areas?
  
  Male Genital inspection:Q5/6:
    • Gently press on the shaft and testicles, is there swelling or pain?
  
  Male Genital inspection:Q6/6:
    • Can you see any rash or skin lesions inside the mouth, around the anus, the hands, or the foot soles?
  `,
  [examinationIds.MALARIA_RISK]: `
  Malaria risk:Q1/2:
    • Has the patient traveled to Africa, South America, South Asia, or Southeast Asia in the past 3 months?
  
  Malaria risk:Q2/2:
    • If yes, which specific country? [We can check if it's a malaria risk country]
  `,
  [examinationIds.VITAL_SIGNS]: `
  Vital signs:Q1/6:
    • Measure the patient's body temperature using a thermometer. What is the reading in Celsius or Fahrenheit?
  
  Vital signs:Q2/6:
    • Count the patient's respiratory rate for 30 seconds and multiply by 2. How many breaths per minute?
  
  Vital signs:Q3/6:
    • Check the patient's pulse for 30 seconds and multiply by 2. How many beats per minute? Is the rhythm regular or irregular?
  
  Vital signs:Q4/6:
    • Measure the patient's blood pressure using a blood pressure monitor. What is the systolic and diastolic reading?
  
  Vital signs:Q5/6:
    • If available, measure the patient's oxygen saturation (SpO2) using a pulse oximeter. What is the SpO2 percentage?
  
  Vital signs:Q6/6:
    • Assess the patient's level of consciousness using the AVPU scale (Alert, responds to Verbal stimuli, responds to Pain, Unresponsive). What is the AVPU score?
  `
};

/**
 * Get detailed instructions for a given examination ID
 * @param {number} examinationId - The examination ID to retrieve instructions for
 * @return {string} The detailed examination instructions
 */
export function getExaminationInstructions(examinationId) {
  return examinationInstructions[examinationId] || 
    `No detailed instructions available for ${examinationDisplayNames[examinationId] || `Examination ${examinationId}`}`;
}

/**
 * Get instructions for multiple examinations
 * @param {Array<number>} examinationIds - Array of examination IDs
 * @return {string} Combined instructions for all examinations
 */
export function getMultipleExaminationInstructions(examinationIds) {
  if (!Array.isArray(examinationIds) || examinationIds.length === 0) {
    return '';
  }
  
  return examinationIds.map(id => {
    const displayName = examinationDisplayNames[id] || `Examination ${id}`;
    const marker = `PHYSICAL_EXAMINATION:${displayName}`;
    const instructions = getExaminationInstructions(id);
    return `### For ${marker}\n${instructions.trim()}`;
  }).join('\n\n');
}

