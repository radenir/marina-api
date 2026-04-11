# Marina Interview Test Cases

Reference index for `simple_test.py`. Run a single case with `python3 tests/simple_test.py <number>`.
Output files saved to `tests/runs/<slug>.txt`.

## Batch A — Cases 1–30: Seafarer Clinical Categories (30 most common seafarer languages)

| # | Slug | Patient lang | MO lang | Clinical Category | Scenario |
|---|------|-------------|---------|-------------------|---------|
| 1 | `vertigo_fil_en` | Filipino | English | Dizziness / Vertigo | Sudden severe rotational vertigo + nausea x2h, Dix-Hallpike positive |
| 2 | `skin_zh_ru` | Chinese | Russian | Skin Infections / Rash | Cellulitis left lower leg spreading x3 days, fever |
| 3 | `dental_id_en` | Indonesian | English | Dental Pain | Dental abscess lower right molar, facial swelling, penicillin allergy |
| 4 | `laceration_ua_pl` | Ukrainian | Polish | Laceration / Open Wounds | Deep left forearm laceration, partial tendon visible, bleeding |
| 5 | `chemical_hi_en` | Hindi | English | Burns / Chemical Injuries | Acid cleaner splash to face and both eyes x20 min |
| 6 | `eyepain_gr_en` | Greek | English | Eye Pain | Acute angle-closure glaucoma — halos, fixed mid-dilated pupil |
| 7 | `ear_ru_ua` | Russian | Ukrainian | Ear Pain / Hearing | Sudden sensorineural hearing loss + tinnitus after engine room blast |
| 8 | `urinary_my_en` | Burmese | English | Urinary Symptoms | Pyelonephritis — dysuria, frequency, right flank pain, fever |
| 9 | `dyspnea_vi_en` | Vietnamese | English | Shortness of Breath | Acute decompensated heart failure — orthopnoea, bilateral crackles, oedema |
| 10 | `joint_bn_en` | Bengali | English | Joint Pain / Swelling | Acute gout — first MTP joint, cannot walk |
| 11 | `fatigue_ta_en` | Tamil | English | Fatigue / Exhaustion | Chronic fatigue, weight loss, night sweats, cough x6 weeks (TB suspicion) |
| 12 | `diarrhea_ur_en` | Urdu | English | Diarrhea | Profuse watery diarrhea x3 days, severe dehydration, BP 96/60 |
| 13 | `anxiety_pl_de` | Polish | German | Psychological Stress / Anxiety | Panic disorder — attacks x1 week, hyperventilation, tingling |
| 14 | `unspecific_ro_fr` | Romanian | French | Unspecific Symptoms | Constitutional symptoms — weight loss, night sweats, low fever x4 weeks |
| 15 | `anaphylaxis_hr_it` | Croatian | Italian | Anaphylaxis / Allergic Reactions | Severe anaphylaxis after shellfish — urticaria, stridor, BP 88/56 |
| 16 | `palpitation_tr_en` | Turkish | English | Palpitations / Irregular Heartbeat | New-onset atrial fibrillation — HR 138 irregular x3h |
| 17 | `confusion_ar_en` | Arabic | English | Altered Consciousness / Confusion | Acute ischaemic stroke — FAST positive, BP 188/114, onset 45 min ago |
| 18 | `mental_es_en` | Spanish | English | Mental Health Crisis | Active suicidal ideation, not eating x3 days, flat affect |
| 19 | `syncope_no_en` | Norwegian | English | Syncope / Presyncope | Witnessed cardiac syncope on deck, now bradycardic HR 46, known IHD |
| 20 | `trauma_de_en` | German | English | Trauma | Blunt left chest trauma from heavy door — rib tenderness, reduced BS left base |
| 21 | `cold_it_en` | Italian | English | Cold Exposure / Hypothermia | MOB hypothermia after 20 min cold water immersion — Temp 32.5°C, HR 44 |
| 22 | `heatstroke_ko_en` | Korean | English | Heat Stroke / Heat Exhaustion | Heat stroke in engine room — Temp 40.8°C, hot dry skin, GCS 10 |
| 23 | `tropical_ms_en` | Malay | English | Tropical Disease | Suspected malaria — cyclical fever with rigors, returned West Africa 10 days ago |
| 24 | `poison_lv_en` | Latvian | English | Poisoning / Overdose | Tricyclic antidepressant overdose — drowsy, hypotensive, dilated pupils |
| 25 | `muscle_ja_en` | Japanese | English | Musculoskeletal Injuries | Acute lumbar disc prolapse after lifting — SLR+, reduced ankle reflex right |
| 26 | `eyefb_th_en` | Thai | English | Eye Foreign Body | Metallic corneal foreign body left eye from angle grinding |
| 27 | `epistaxis_da_en` | Danish | English | Nosebleed | Epistaxis x30 min, on warfarin + amlodipine, BP 172/104 |
| 28 | `std_nl_en` | Dutch | English | Sexually Transmitted Diseases | Urethral discharge + dysuria after port visit, penicillin allergy |
| 29 | `female_sv_en` | Swedish | English | Female Health | Suspected ectopic pregnancy — amenorrhoea 6 weeks, RIF pain, ↑βHCG |
| 30 | `diabetes_en_hi` | English | Hindi | Diabetic Complications | Infected diabetic foot ulcer — crepitus, glucose 18.2 mmol/L |

### Uncovered categories from the original 35 requested
The following 5 categories were not included in Batch A (may be covered in Batch B or future additions):
- **Drowning / Near Drowning**
- **Throat Pain** (tonsillitis appears in Batch B #38)
- **Red Eye & Discharge** (conjunctivitis — angle-closure glaucoma used instead)
- **Neurological Symptoms** (non-acute neuro distinct from stroke/confusion)
- **Obstipation** (constipation appears in Batch B #42)

---

## Batch B — Cases 31–60: Original Diverse Scenarios

| # | Slug | Patient lang | MO lang | Scenario |
|---|------|-------------|---------|---------|
| 31 | `ankle_fil_ua` | Filipino | Ukrainian | Ankle sprain after fall on deck |
| 32 | `shoulder_hi_de` | Hindi | German | Shoulder pain + inability to raise arm |
| 33 | `epistaxis_zh_ru` | Chinese | Russian | Nosebleed uncontrolled x20 min (hypertensive) |
| 34 | `burn_pt_en` | Portuguese | English | Steam burn to right hand, blisters |
| 35 | `seasick_nl_en` | Dutch | English | Severe seasickness + repeated vomiting |
| 36 | `palpitation_no_en` | Norwegian | English | Irregular palpitations + chest discomfort (known AF) |
| 37 | `laceration_hr_en` | Croatian | English | Deep finger laceration from sheet metal |
| 38 | `throat_sr_en` | Serbian | English | Severe sore throat + dysphagia + fever (tonsillitis) |
| 39 | `allergy_ro_fr` | Romanian | French | Allergic reaction post-meal — urticaria + angioedema + stridor |
| 40 | `heat_tr_ru` | Turkish | Russian | Heat exhaustion after prolonged deck work |
| 41 | `seizure_ar_fr` | Arabic | French | Post-ictal state after tonic-clonic seizure (epilepsy, missed meds) |
| 42 | `constipation_fa_en` | Persian | English | Constipation x4 days + abdominal bloating |
| 43 | `sting_sw_en` | Swahili | English | Jellyfish sting to forearm |
| 44 | `elbow_fil_es` | Filipino | Spanish | Elbow injury from machinery impact |
| 45 | `shoulder_id_fr` | Indonesian | French | Shoulder dislocation after fall |
| 46 | `ankle_ms_nl` | Malay | Dutch | Ankle fracture after stair fall |
| 47 | `trauma_th_en` | Thai | English | Blunt abdominal trauma from falling cargo |
| 48 | `cornea_vi_es` | Vietnamese | Spanish | Corneal abrasion from flying debris |
| 49 | `hypoglycemia_ja_fr` | Japanese | French | Hypoglycaemia episode (T1DM on insulin) |
| 50 | `panic_ko_de` | Korean | German | Panic attack — rapid HR + hyperventilation |
| 51 | `rib_zh_es` | Chinese | Spanish | Rib injury from cargo impact, pain on breathing |
| 52 | `crush_bn_fr` | Bengali | French | Hand crush injury in machinery |
| 53 | `neck_hi_ru` | Hindi | Russian | Neck stiffness + fever (meningism signs) |
| 54 | `hypertension_ur_en` | Urdu | English | Hypertensive crisis (BP 196/118, out of meds) |
| 55 | `palpitation_ta_en` | Tamil | English | Rapid regular tachycardia + near-syncope |
| 56 | `lymph_ka_en` | Georgian | English | Generalised lymphadenopathy + fever x1 week |
| 57 | `hypothermia_kk_ru` | Kazakh | Russian | Hypothermia after cold exposure (Temp 33.8°C) |
| 58 | `fishhook_az_en` | Azerbaijani | English | Fish hook embedded in finger |
| 59 | `headache_pl_de` | Polish | German | Migraine with visual aura, no sumatriptan available |
| 60 | `ankle_gr_it` | Greek | Italian | Ankle sprain/suspected fracture, Ottawa rules positive |

---

## Notes
- Run all cases: `python3 tests/simple_test.py`
- Run one case: `python3 tests/simple_test.py <number>` (e.g. `python3 tests/simple_test.py 17`)
- All vitals are fixed per case and embedded in the MO system prompt
- Patient LLM replies in native language; MO LLM replies in MO language
- Logs saved to `tests/runs/<slug>.txt` (ANSI-stripped plain text)
- LLM: MiniMaxAI/MiniMax-M2.1 via Nebius (`NEBIUS_MODEL` in `.env`)
- HTTP timeout: 120 s per request (socket timeout — `HTTP 0` in output means timeout, not server error)
