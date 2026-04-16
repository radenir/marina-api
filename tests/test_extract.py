#!/usr/bin/env python3
"""
Quick extract test — calls /ai/extract with a hardcoded conversation
from a completed interview to verify performedActions output.
"""
import sys, os, json, time, urllib.request, urllib.error

def load_env(path):
    cfg = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                cfg[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return cfg

ENV_FILE = os.path.join(os.path.dirname(__file__), "..", ".env")
env = load_env(ENV_FILE)
EMAIL    = env.get("MARINA_TEST_EMAIL", "radomski.adr@gmail.com")
PASSWORD = env.get("MARINA_TEST_PASSWORD", "Gierek123")
BASE     = "https://api.marinahealth.eu"

GREEN, RED, BOLD, NC = "\033[0;32m", "\033[0;31m", "\033[1m", "\033[0m"

def api(path, payload, token=None):
    data = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="POST")
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read()), time.monotonic() - t0
    except urllib.error.HTTPError as e:
        try:    body = json.loads(e.read())
        except: body = {"error": str(e)}
        return e.code, body, time.monotonic() - t0

# ── Login ──────────────────────────────────────────────────────────────────────
code, body, ms = api("/auth/login", {"email": EMAIL, "password": PASSWORD})
if code != 200:
    print(f"{RED}Login failed ({code}): {body}{NC}")
    sys.exit(1)
token = body["access_token"]
print(f"{GREEN}✓ Logged in ({ms*1000:.0f}ms){NC}\n")

# ── Conversation reconstructed from the test run ───────────────────────────────
CONVERSATION = [
    {"role": "assistant", "content": "Magandang araw, ako si Marina. Maari mo bang sabihin kung ano ang iyong nararamdaman o kung paano ka makakatulong?"},
    {"role": "user",      "content": "Magandang araw, Marina. Masakit pa rin ang dibdib ko, parang may pumipiga sa dibdib ko. Maaari mo ba akong dalhin sa medical officer o makita kung may gamot akong maaaring inumin?"},
    {"role": "assistant", "content": "Naiintindihan ko ang iyong nararamdaman. Tutulungan kitang makipag-ugnayan sa medical officer.\n\nMaaari mo bang ilarawan nang mas detalyado ang kirot sa dibdib mo?"},
    {"role": "user",      "content": "Nagsimula kahapon ng gabi, mga bandang 9 PM. Parang may pumipiga sa dibdib ko - hindi siya matalim na kirot, kundi parang may biglang sumisikip. Umuulit siya, mga ilang segundo hanggang isang minuto, tapos mawawala. Ngayon, nararamdaman ko ulit siya."},
    {"role": "assistant", "content": "May ibang sintomas ka bang kasabay ng kirot sa dibdib? Halimbawa, hirap sa paghinga, pagpapawis, pagkahilo, o pananakit ng braso o balikat?"},
    {"role": "user",      "content": "Hindi pa naman, pero ngayon lang din naman ako nagising na may kirot pa rin."},
    {"role": "assistant", "content": "Kung naiintindihan ko nang maayos, ang pangunahing reklamo mo ay Chest pain? Maaari mo ba itong i-confirm?"},
    {"role": "user",      "content": "Oo, oo. Confirmed - ang pangunahing reklamo ko ay chest pain, o paninikip ng dibdib. Yun ang pinaka-problema ko ngayon."},
    {"role": "assistant", "content": "Salamat sa pag-confirm. Maaari mo bang sabihin kung ilang taon ka na?"},
    {"role": "user",      "content": "Apatnapu't dalawang taon po."},
    {"role": "assistant", "content": "Maaari mo bang sabihin kung lalaki ka o babae?"},
    {"role": "user",      "content": "Lalaki po ako. Apatnapu't dalawa ang edad ko."},
    {"role": "assistant", "content": "Ang pagsisim ng kirot sa dibdib mo kahapon gabi - bigla ba siyang nagsimula o dahan-dahan siyang lumabas?"},
    {"role": "user",      "content": "Bigla siyang nagsimula, parang biglang pumutok sa dibdib ko. Hindi dahan-dahan."},
    {"role": "assistant", "content": "Nasaan eksakto ang kirot sa dibdib mo? Sa gitna ba, sa kaliwa, o sa kanan? At nararamdaman mo ba siya sa ibang parte ng katawan mo, tulad ng braso, balikat, leeg, o likod?"},
    {"role": "user",      "content": "Sa gitna ng dibdib yung kirot, parang pumipiga. At umaabot siya sa kaliwang braso at leeg ko."},
    {"role": "assistant", "content": "Paano mo ilalarawan ang uri ng kirot - parang pumipiga ba siya, matalim na kutsilyo, o parang nasusunog?"},
    {"role": "user",      "content": "Sa gitna ng dibdib, sa sternum area. Parang may pumipiga talaga, hindi siya matalim na kutsilyo pero may pressure na parang binabalot ang dibdib ko."},
    {"role": "assistant", "content": "Sa isang scale na 0 hanggang 10, gaano katindi ang kirot mo ngayon?"},
    {"role": "user",      "content": "Mga 4 hanggang 5 siguro. Hindi masyadong hindi kaya tiisin, pero hindi rin nawawala."},
    {"role": "assistant", "content": "Ang kirot ba ay patuloy na nararamdaman mo ngayon, o may mga sandali siyang humihina o nawawala?"},
    {"role": "user",      "content": "Nagsimula kahapon ng hapon, at halos tuloy-tuloy siya, pero may mga sandali ring medyo humihina saglit lang. Ngayong araw, mga dalawang oras na siyang masakit ulit."},
    {"role": "assistant", "content": "May mga bagay ba na ginagawa ka na nagpapalala ng kirot mo?"},
    {"role": "user",      "content": "Kapag naglalakad ako ng mabilis o umaakyat ng hagdan, mas lalong sumasama yung kirot."},
    {"role": "assistant", "content": "May mga bagay ba na nakakatulong para mapagaan ang kirot?"},
    {"role": "user",      "content": "Kapag nagpapahinga ako at tumigil sa ginagawa, medyo nababawasan ang kirot. Wala akong iniinom na gamot para dito."},
    {"role": "assistant", "content": "Nakaupo o nakahiga ka ba ng matagal kamakailan?"},
    {"role": "user",      "content": "Hindi naman po, normal lang ang routine ko sa barko. Nakatayo at naglalakad ako most of the day."},
    {"role": "assistant", "content": "May iba pa bang gusto kang idagdag tungkol sa iyong kalusugan o sa mga nararamdaman mo?"},
    {"role": "user",      "content": "May mild na pagkahilo din ako at medyo nanlalamig ang braso ko kanina. Medyo nanlalamig din ang palad ko, parang basa kahit hindi naman. May mga sandaling nagiging malabo ang paningin ko saglit-saglit. Wala pa akong naranasan na ganito dati."},
    {"role": "assistant", "content": "May iba pa bang gusto mong idagdag?"},
    {"role": "user",      "content": "Hindi ko na maalala kung may nangyari pang iba. Wala nang ibang maidadagdag."},
    # Stage 3 - Associated Symptoms
    {"role": "assistant", "content": "Nararamdaman mo ba ang hirap sa paghinga o pangangapos ng hininga?"},
    {"role": "user",      "content": "Hindi naman masyado, pero medyo parang may kabig lang sa dibdib kapag humihinga nang malalim."},
    {"role": "assistant", "content": "Nagpapawis ka ba ng labis o bigla-biglaan?"},
    {"role": "user",      "content": "Hindi naman, hindi ako nagpapawis ng labis. Normal lang pawis ko."},
    {"role": "assistant", "content": "May pagduduwal ka ba o pakiramdam na masusuka ka?"},
    {"role": "user",      "content": "Hindi naman. Pakiramdam ko ayos lang ang sikmura ko."},
    {"role": "assistant", "content": "Nararamdaman mo ba ang mabilis o hindi regular na pagtibok ng puso mo?"},
    {"role": "user",      "content": "Hindi ko masyadong nararamdaman yung pagtibok ng puso ko. Hindi rin ako nahihilo o nahihirapang huminga."},
    {"role": "assistant", "content": "May naranasan ka ba bang pagkahilo na parang malalaglag ka o may time na halos mawalan ka ng malay?"},
    {"role": "user",      "content": "Hindi naman. Ang nararamdaman ko lang talaga ay yung sakit sa dibdib."},
    # Stage 4 - Past Medical History
    {"role": "assistant", "content": "May alta presyon ka ba o hypertension?"},
    {"role": "user",      "content": "Hindi po, wala akong alta presyon. Hindi ako nagta-take ng anumang maintenance na gamot."},
    {"role": "assistant", "content": "May heart disease ka ba o anumang sakit sa puso?"},
    {"role": "user",      "content": "Hindi, wala akong kilala o na-diagnose na heart disease o anumang sakit sa puso."},
    {"role": "assistant", "content": "May naranasan ka ba ng deep vein thrombosis o DVT, o pulmonary embolism?"},
    {"role": "user",      "content": "Hindi po. Wala akong naranasan na DVT o pulmonary embolism noon."},
    {"role": "assistant", "content": "May smoking history ka ba?"},
    {"role": "user",      "content": "Oo, dati akong naninigarilyo, pero huminto na ako limang taon na ang nakakaraan. Humigit-kumulang isang pack kada araw, mga dalawampung stick. Naninigarilyo ako mga labing-anim na taon bago ako tumigil."},
    # Stage 5 - Medications
    {"role": "assistant", "content": "Umiinom ka ba ng anumang gamot nang regular?"},
    {"role": "user",      "content": "Hindi po. Wala akong iniinom na regular na gamot. Healthy naman po ako dati."},
    {"role": "assistant", "content": "May iniinom ka ba na over-the-counter na gamot, bitamina, o supplement?"},
    {"role": "user",      "content": "Hindi, wala akong iniinom na over-the-counter na gamot, bitamina, o herbal supplements."},
    # Stage 6 - Allergies
    {"role": "assistant", "content": "May kilala ka bang allergy sa mga gamot, pagkain, o ibang substances?"},
    {"role": "user",      "content": "Wala po akong kilalang allergy sa mga gamot, pagkain, o anumang substance."},
    # Stage 7 - Vital Signs (MO)
    {"role": "assistant", "content": "Good day, Medical Officer. Please provide the patient's oxygen saturation level in percent."},
    {"role": "user",      "content": "O2 saturation: 98%"},
    {"role": "assistant", "content": "Thank you. Please provide the patient's respiratory rate in breaths per minute."},
    {"role": "user",      "content": "16 breaths per minute."},
    {"role": "assistant", "content": "Thank you. Please provide the patient's heart rate or pulse in beats per minute."},
    {"role": "user",      "content": "The patient's heart rate is 78 beats per minute."},
    {"role": "assistant", "content": "Thank you. Please provide the patient's blood pressure."},
    {"role": "user",      "content": "125/82 mmHg"},
    {"role": "assistant", "content": "Thank you. Please provide the patient's temperature in degrees Celsius."},
    {"role": "user",      "content": "36.9°C"},
    {"role": "assistant", "content": "Thank you. Please provide the patient's level of consciousness using the AVPU scale."},
    {"role": "user",      "content": "Alert."},
    {"role": "assistant", "content": "Do you have anything else to add on vital signs?"},
    {"role": "user",      "content": "Additional findings: capillary refill 2 seconds, general appearance shows mild distress with slight diaphoresis."},
    {"role": "assistant", "content": "Do you have anything else to add on vital signs?"},
    {"role": "user",      "content": "No additional vital signs to report. All relevant findings have been provided."},
    # Stage 8 - Investigations
    {"role": "assistant", "content": "Has an ECG (electrocardiogram) test been performed on this patient?"},
    {"role": "user",      "content": "No, an ECG has not been performed on this patient."},
    {"role": "assistant", "content": "Do you have anything else to add on investigations?"},
    {"role": "user",      "content": "No ECG has been performed to date."},
    # Stage 9 - Physical Exam
    {"role": "assistant", "content": "Can you tell me if the patient can talk freely and answer clearly?"},
    {"role": "user",      "content": "Yes, the patient is alert and able to talk freely and answer clearly."},
    {"role": "assistant", "content": "Is breathing difficult for the patient? Does the patient breathe through their mouth?"},
    {"role": "user",      "content": "No respiratory difficulty observed. No mouth breathing noted."},
    {"role": "assistant", "content": "Does the person look more pale or grey than usual?"},
    {"role": "user",      "content": "General appearance notes mild distress and slight diaphoresis, but no specific mention of pallor or grey discoloration."},
    {"role": "assistant", "content": "Is the skin sweaty or warm to the touch?"},
    {"role": "user",      "content": "Yes, patient is slightly diaphoretic (sweaty)."},
    {"role": "assistant", "content": "Are there any signs of trauma, such as wounds or bruising?"},
    {"role": "user",      "content": "No visible wounds or bruising observed on examination."},
    {"role": "assistant", "content": "Can you ask the patient to stand up and walk a few meters? Can they do it without assistance?"},
    {"role": "user",      "content": "The patient was able to stand and walk several meters without assistance. No significant worsening of chest pain was noted during ambulation."},
    {"role": "assistant", "content": "Do you have anything else to add on the examination?"},
    {"role": "user",      "content": "No additional general appearance findings to report. Examination complete."},
]

# ── Call extract ───────────────────────────────────────────────────────────────
print(f"Calling /ai/extract with {len(CONVERSATION)} messages...")
code, body, ms = api("/ai/extract", {"conversation": CONVERSATION}, token)

if code != 200:
    print(f"{RED}Extract failed ({code}): {body}{NC}")
    sys.exit(1)

print(f"{GREEN}✓ Done ({ms*1000:.0f}ms){NC}\n")

summary = body.get("summary", {})
for key, val in summary.items():
    if val not in (None, "", False, []):
        print(f"  {BOLD}{key}{NC}: {val}")
