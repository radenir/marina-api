"""Generate public/templates/radio-medical-record.html.

Run from the marina-api root, then build the fillable PDF:
  python3 scripts/gen-radio-medical-record.py
  npx tsx scripts/build-seafarer-form.ts radio-medical-record

English Radio Medical Record (based on the Danish layout), branded
Mariners Medico Guide (Radio Medico, Helse Bergen HF), Marina in the footer.
"""
import base64, os

T = os.path.join(os.getcwd(), 'public', 'templates')  # run from the marina-api root

def b64(path):
    return base64.b64encode(open(path, 'rb').read()).decode()

MMG = 'data:image/png;base64,' + b64(f'{T}/mariners-medico-guide-logo.png')
# Marina ship-wheel mark: reuse the inline SVG from the Marina seafarer template
# so both forms carry the identical logo.
_src = open(f'{T}/seafarer-medical-report.html').read()
_start = _src.index('<svg class="logo"')
MARINA_MARK = _src[_start:_src.index('</svg>', _start) + len('</svg>')].replace('class="logo"', 'class="marina"')

TOTAL_PAGES = 4
PROBLEM_H = 198  # fills page 1 down to the footer

# M-EWS reference table as supplied by Radio Medico. Columns are the score
# bands 3 2 1 0 1 2 3 (low side → high side); '' = no band at that score.
EWS_SCORES = [3, 2, 1, 0, 1, 2, 3]
EWS_TABLE = [
    ('rr',   'Respiration rate per minute', ['≤8', '', '9–11', '12–20', '', '21–24', '≥25']),
    ('spo2', 'SpO₂ %',                      ['≤91', '92–93', '94–95', '≥96', '', '', '']),
    ('o2',   'Air or oxygen',               ['Oxygen', '', '', 'Air', '', '', '']),
    ('sbp',  'Blood pressure systolic / mmHg', ['≤90', '91–100', '101–110', '111–180', '', '181–219', '≥220']),
    ('hr',   'Heart rate per minute',       ['≤40', '', '41–50', '51–90', '91–110', '111–130', '≥131']),
    ('avpu', 'Consciousness',               ['', '', '', 'Awake and alert', '', '', 'Reduced consciousness or not alert']),
    ('temp', 'Body temperature in Celsius', ['≤35.0', '', '35.1–35.5', '35.6–38.0', '38.1–39.0', '39.1–39.5', '≥39.6']),
]

SIL = ('M100,8 C121,8 136,24 136,45 C136,62 127,73 117,79 C115,85 115,89 118,95 C129,99 144,104 154,114 '
       'C164,123 170,134 174,156 C179,186 181,214 182,252 C183,272 182,300 178,322 C177,332 170,335 165,328 '
       'C161,320 161,300 159,280 C157,250 155,212 150,182 C148,170 144,162 138,152 C139,182 141,212 139,242 '
       'C138,257 137,272 137,300 C136,338 135,378 133,418 C132,432 131,440 131,447 L146,457 C149,461 148,464 143,464 '
       'L119,464 C115,463 114,457 114,448 C112,400 109,340 106,286 L100,273 L94,286 C91,340 88,400 86,448 '
       'C86,457 85,463 81,464 L57,464 C52,464 51,461 54,457 L69,447 C69,440 68,432 67,418 C65,378 64,338 63,300 '
       'C63,272 62,257 61,242 C59,212 61,182 62,152 C56,162 52,170 50,182 C45,212 43,250 41,280 C39,300 39,320 35,328 '
       'C30,335 23,332 22,322 C18,300 17,272 18,252 C19,214 21,186 26,156 C30,134 36,123 46,114 C56,104 71,99 82,95 '
       'C85,89 85,85 83,79 C73,73 64,62 64,45 C64,24 79,8 100,8 Z')


# ---------- tiny helpers ----------
def field(label, name, cls='', span='', kind='text', style=''):
    sp = f' {span}' if span else ''
    st = f' style="{style}"' if style else ''
    return (f'<div class="field{sp}"><label>{label}</label>'
            f'<div class="box{(" " + cls) if cls else ""}"{st} data-field="{name}" data-type="{kind}"></div></div>')

def inl(name, w=60):
    """inline text box sitting on a line of text"""
    return f'<span class="box inl" style="width:{w}px" data-field="{name}" data-type="text"></span>'

def radio(name, value, text):
    return f'<span class="check"><span class="tick" data-field="{name}" data-type="radio" data-value="{value}"></span> {text}</span>'

def cb(name, text):
    return f'<span class="check"><span class="tick" data-field="{name}" data-type="checkbox"></span> {text}</span>'

def yes_no(name):
    return radio(name, 'yes', 'Yes') + radio(name, 'no', 'No')

def bar(title):
    return f'<h2>{title}</h2>'

def abc_section(title, rows, head=('Investigate', 'Action')):
    cols = len(head)
    hdr = ''.join(f'<div class="th">{h}</div>' for h in head)
    body = ''
    for r in rows:
        body += ''.join(f'<div class="td">{c}</div>' for c in r)
    return (f'<section class="section">{bar(title)}'
            f'<div class="abc cols{cols}">{hdr}{body}</div></section>')

def header(page_title):
    return f'''
  <header>
    <div></div>
    <div class="titles">
      <h1>{page_title}</h1>
    </div>
    <img class="brand-logo right" src="{MMG}" alt="Mariners Medico Guide" />
  </header>'''

def footer(n):
    return f'''
  <footer>
    <div class="marina-brand">{MARINA_MARK}<span>Marina</span></div>
    <div class="disclaimer">Form prepared by Marina Health Denmark ApS · support@marinahealth.eu · marinahealth.eu</div>
    <div class="pageno">Page {n} of {TOTAL_PAGES}</div>
  </footer>'''


# ---------- M-EWS ----------
def ews_section():
    band = ['s3', 's2', 's1', 's0', 's1', 's2', 's3']
    head = ('<div class="eh ep rs">Physiological parameter</div><div class="eh span7">Score</div>'
            '<div class="eh rs">Patient value</div><div class="eh rs">Points</div>'
            + ''.join(f'<div class="eh">{n}</div>' for n in EWS_SCORES))
    rows = ''
    for key, label, cells in EWS_TABLE:
        rows += f'<div class="ep">{label}</div>'
        rows += ''.join(f'<div class="band {b}">{c}</div>' for b, c in zip(band, cells))
        rows += f'<div class="pv"><div class="box" data-field="ews_{key}_value" data-type="text"></div></div>'
        rows += f'<div class="pv"><div class="box" data-field="ews_{key}_points" data-type="text"></div></div>'
    return f'''
  <section class="section">{bar('Early Warning Score (M-EWS)')}
    <div class="section-body">
      <div class="ewst">{head}{rows}</div>
      <div class="ews-total">
        <span class="lbl">M-EWS total score:</span>
        <span class="box inl total" data-field="ews_total" data-type="text"></span>
        <span class="lbl gap">Status:</span>
        <span class="checks">{radio('ews_status', 'complete', 'Complete — all values provided')}{radio('ews_status', 'incomplete', 'Incomplete — values missing')}</span>
      </div>
    </div>
  </section>'''


# ---------- page 1 ----------
C_SECTION = abc_section('C: Circulation', [
    ('Capillary response',
     f'<div class="line">Number of seconds: {inl("cap_refill", 40)} <span class="hint">(normal &lt; 2 seconds)</span></div>'),
    ('Skin colour',
     f'<div class="checks">{radio("skin_colour","pale","Pale")}{radio("skin_colour","reddish","Reddish")}'
     f'{radio("skin_colour","bluish","Bluish")}{radio("skin_colour","normal","Normal")}</div>'),
    ('Skin temperature and humidity', f'<div class="line">How does the skin feel? {inl("skin_feel", 380)}</div>'),
    ('Heart rate',
     f'<div class="line">Heart rate per min.: {inl("heart_rate", 50)} <span class="hint">(normal 60–80)</span></div>'
     f'<div class="checks"><span class="lbl">Measured at:</span>{radio("pulse_site","wrist","the wrist")}'
     f'{radio("pulse_site","neck","the neck")}{radio("pulse_site","groin","the groin")}</div>'),
    ('Blood pressure',
     f'<div class="line">Blood pressure: {inl("bp_systolic", 45)} / {inl("bp_diastolic", 45)} mmHg <span class="hint">(normal 120–140 / 60–90)</span></div>'),
])

p1 = header('Radio Medical Record') + f'''
  <section class="section">{bar('Patient &amp; vessel')}
    <div class="section-body"><div class="grid cols-6">
      {field('Name / title', 'patient_name', span='span-2')}
      {field('Date of birth <span class="fmt">dd/mm/yyyy</span>', 'dob')}
      <div class="field"><label>Gender</label><div class="checks">{radio('gender','male','Male')}{radio('gender','female','Female')}</div></div>
      {field('Nationality', 'nationality')}
      <div class="grid cols-2 inner">{field('Date', 'report_date')}{field('UTC', 'report_utc')}</div>
      {field('Shipping company', 'shipping_company')}
      {field('Ship name', 'ship_name')}
      {field('Ship e-mail', 'ship_email', span='span-2')}
      {field('Satellite call no.', 'satellite_phone')}
      {field('Call signal', 'call_sign')}
      {field('Coordinates', 'coordinates')}
      {field('Destination / ETA', 'destination_eta')}
      {field('Nearest port and ETA', 'nearest_port_eta', span='span-2')}
      {field('Medicine chest', 'medicine_chest')}
      {field('Number of pages sent', 'pages_total')}
    </div></div>
  </section>

  <div class="two-up">
    <section class="section">{bar('Does the patient take any medicine?')}
      <div class="section-body">
        {field('If so, which one(s)', 'medicines', cls='lg', kind='multiline')}
        <div class="checks mt">{radio('medicines_status','no','No')}{radio('medicines_status','unknown',"Don't know")}</div>
      </div>
    </section>
    <section class="section">{bar('Does the patient have any allergies?')}
      <div class="section-body">
        {field('If so, which one(s)', 'allergies', cls='lg', kind='multiline')}
        <div class="checks mt">{radio('allergies_status','no','No')}{radio('allergies_status','unknown',"Don't know")}</div>
      </div>
    </section>
  </div>

  <section class="section">{bar('Problem description')}
    <div class="section-body">
      {field('What has happened — where did it happen — when did it happen — what are the patient&#39;s symptoms', 'problem_description', kind='multiline', style=f'height:{PROBLEM_H}px')}
    </div>
  </section>
''' + ews_section() + abc_section('A: Airway', [
    ('Clear airways',
     f'<div class="checks">{yes_no("airway_clear")}<span class="lbl">If no:</span>'
     f'{cb("airway_jaw_lift","Jaw lift")}{cb("airway_suction","Suction applied")}{cb("airway_guedel","Guedel® airway")}</div>'
     f'<div class="line">If no breathing, or insufficient gasping for air, CPR initiated at {inl("cpr_started_at", 70)} <span class="fmt">hh:mm</span></div>'),
    ('Oxygen', f'<div class="line">Oxygen administered: {inl("oxygen_lpm", 50)} litres per min.</div>'),
    ('Neck / back<br/>Suspicion of injury',
     f'<div class="checks">{yes_no("neck_injury_suspected")}<span class="lbl gap">Fitted neck collar:</span>{yes_no("neck_collar")}</div>'),
]) + abc_section('B: Breathing', [
    ('Breathing frequency and depth<br/><span class="hint">(see – listen – feel)</span>',
     f'<div class="checks"><span class="lbl">Description:</span>{cb("breath_fast","Fast")}{cb("breath_slow","Slow")}'
     f'{cb("breath_shallow","Shallow")}{cb("breath_deep","Deep")}{cb("breath_normal","Normal")}'
     f'<span class="lbl gap">Other:</span>{inl("breath_other", 130)}</div>'
     f'<div class="line">Number of breaths per min.: {inl("resp_rate", 50)} <span class="hint">(normal 12–16)</span></div>'),
    ('Oxygen saturation',
     f'<div class="line">Oxygen saturation in %: {inl("spo2", 50)} <span class="hint">(normal 95–100 %)</span></div>'),
]) + footer(1)


# ---------- page 2 ----------
p2 = header('Radio Medical Record') + C_SECTION + abc_section('D: Disability', [
    ('Level of consciousness',
     '<div class="stack">'
     + radio('consciousness', '1', '1. Awake, alert and well orientated')
     + radio('consciousness', '2', '2. Unclear, but responds to questions')
     + radio('consciousness', '3', '3. Does not respond to questions but to pain stimuli')
     + radio('consciousness', '4', '4. Unconscious and unresponsive to pain stimuli')
     + '</div>'
     f'<div class="checks mt"><span class="lbl">Convulsions:</span>{yes_no("convulsions")}'
     f'<span class="lbl gap">Paralysis:</span>{yes_no("paralysis")}</div>'),
    ('Pupil reaction',
     f'<div class="checks"><span class="lbl">Normal (uniform contraction):</span>{yes_no("pupils_normal")}</div>'
     f'{field("If no, describe what you see", "pupils_description", cls="lg", kind="multiline")}'),
]) + abc_section('E: Expose', [
    ('Top to toe examination.<br/><span class="hint">Signs of injury / illness not recognised under A-B-C-D</span>',
     f'<div class="checks">{yes_no("top_to_toe")}</div>',
     field('If yes, describe any symptoms / findings', 'top_to_toe_findings', cls='lg', kind='multiline')),
    ('Signs of hypothermia or overheating',
     f'<div class="checks">{yes_no("temp_disorder")}</div>',
     field('If yes, describe any symptoms / findings', 'temp_disorder_findings', cls='lg', kind='multiline')),
    ('Temperature measurement',
     f'<div class="checks">{yes_no("temp_measured")}</div>',
     f'<div class="line">Body temperature: {inl("temperature", 50)} °C <span class="lbl gap">Measured where?</span> {inl("temp_site", 200)}</div>'),
], head=('Investigate', 'Performed', 'Action')) + f'''
  <section class="section">{bar('Performed actions not described above')}
    <div class="section-body">
      <div class="box" style="height:174px" data-field="performed_actions" data-type="multiline"></div>
      <p class="note">If possible, attach image(s) when sending e-mail.</p>
    </div>
  </section>

  <section class="section">{bar('If you gave any medication before contact with Radio Medico, please list here')}
    <div class="section-body"><div class="grid medlist">
      {''.join(f'<div class="field"><label>Time</label><div class="box" data-field="premed_{i}_time" data-type="text"></div></div>'
               f'<div class="field"><label>Medication, strength, dose</label><div class="box" data-field="premed_{i}" data-type="text"></div></div>'
               for i in range(1, 5))}
    </div></div>
  </section>

  <section class="section">{bar('Medical officer')}
    <div class="section-body"><div class="grid cols-2">
      {field('The name and title of the medical officer', 'medical_officer')}
      {field('Signature', 'medical_officer_signature')}
    </div></div>
  </section>
''' + footer(2)


# ---------- page 3: continued documentation ----------
doc_rows = ''.join(
    f'<div class="box" data-field="log_{i}_time" data-type="text"></div>'
    f'<div class="box" data-field="log_{i}" data-type="text"></div>'
    for i in range(1, 40))
p3 = header('Radio Medical Record — continued documentation') + f'''
  <section class="section">{bar('Documentation of prescriptions and actions')}
    <div class="section-body">
      <p class="note top">Radio Medico&#39;s prescriptions must include: medication name, strength, number and duration.</p>
      <div class="log"><div class="th">Time</div><div class="th">Documentation</div>{doc_rows}</div>
    </div>
  </section>
''' + footer(3)


# ---------- page 4: body map ----------
def sil(view):
    return (f'<div class="bodymap"><div class="bodymap-cap">{view.title()}</div>'
            f'<div class="silhouette big" data-bodymap="{view}"><svg viewBox="0 0 200 480" xmlns="http://www.w3.org/2000/svg">'
            f'<path class="sil" d="{SIL}"/></svg></div></div>')

p4 = header('Radio Medical Record') + f'''
  <section class="section">{bar('Please indicate in the pictures below: pain, injuries or symptoms')}
    <div class="section-body">
      <div class="bodymap-row">{sil('back')}{sil('front')}</div>
      {field('Description of marked areas', 'body_notes', kind='multiline', style='height:150px')}
    </div>
  </section>
''' + footer(4)


CSS = '''
  :root { --navy:#0a4b78; --accent:#1d6fa5; --tint:#eef4f9; --tint-line:#d6e3ee;
          --ink:#000; --muted:#000; --border:#d8e0ea; --field:#f7fafc; --radius:10px; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#eaeef3; color:var(--ink);
    font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    font-size:9px; line-height:1.35; -webkit-font-smoothing:antialiased; }
  .page { position:relative; display:flex; flex-direction:column; width:210mm; height:297mm;
    margin:8mm auto; background:#fff; padding:10mm 12mm 8mm; box-shadow:0 4px 24px rgba(15,23,42,.12);
    page-break-after:always; overflow:hidden; }
  .page:last-child { page-break-after:auto; }
  header, .section, .two-up { flex:none; }

  /* header: hospital logo left, app logo right, title centred */
  header { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px;
    padding-bottom:7px; border-bottom:2px solid var(--navy); margin-bottom:9px; }
  .brand-logo { height:30px; width:auto; }
  .brand-logo.left { justify-self:start; }
  .brand-logo.right { justify-self:end; height:40px; border-radius:7px; }
  .titles { text-align:center; }
  header h1 { margin:0; font-size:15px; font-weight:700; color:var(--ink); }
  header .sub { margin:1px 0 0; font-size:8px; color:var(--muted); letter-spacing:.3px; }

  .section { border:1px solid var(--border); border-radius:var(--radius); margin-bottom:6px; overflow:hidden; }
  .section > h2 { margin:0; padding:4px 10px; background:var(--navy); color:#fff;
    font-size:9px; font-weight:700; letter-spacing:.5px; }
  .section-body { padding:6px 10px; }
  .two-up { display:grid; grid-template-columns:1fr 1fr; gap:8px; }

  .grid { display:grid; gap:4px 10px; }
  .cols-2 { grid-template-columns:1fr 1fr; } .cols-3 { grid-template-columns:repeat(3,1fr); }
  .cols-6 { grid-template-columns:repeat(6,1fr); }
  .span-2 { grid-column:span 2; }
  .grid.inner { gap:0 6px; }
  .medlist { grid-template-columns:60px 1fr 60px 1fr; }

  .field { display:flex; flex-direction:column; }
  .field > .box { margin-top:auto; }
  .field label { display:block; font-size:7.5px; font-weight:600; letter-spacing:.3px; text-transform:uppercase;
    color:var(--muted); margin-bottom:2px; white-space:nowrap; }
  .fmt { font-weight:400; text-transform:none; letter-spacing:0; }
  .box { border:.5px solid var(--border); background:#fff; border-radius:4px; height:16px; }
  .box.lg { height:34px; }
  .box.inl { display:inline-block; height:14px; vertical-align:middle; margin:0 2px; }

  .checks { display:flex; flex-wrap:wrap; gap:3px 12px; align-items:center; min-height:16px; }
  .checks.mt, .mt { margin-top:4px; }
  .check { display:inline-flex; align-items:center; gap:4px; font-size:8.5px; }
  .check .tick { width:11px; height:11px; flex:none; background:transparent; }
  .stack { display:flex; flex-direction:column; gap:3px; }
  .lbl { font-weight:600; color:var(--ink); }
  .lbl.gap { margin-left:8px; }
  .line { min-height:16px; display:flex; align-items:center; flex-wrap:wrap; gap:0 2px; margin:1px 0; }
  .hint { color:var(--ink); font-style:italic; font-size:7.5px; }

  /* A-B-C-D-E investigate / action tables */
  .abc { display:grid; }
  .abc.cols2 { grid-template-columns:130px 1fr; }
  .abc.cols3 { grid-template-columns:130px 80px 1fr; }
  .abc .th { padding:3px 10px; font-weight:700; font-size:8px; background:var(--tint);
    border-bottom:1px solid var(--tint-line); color:var(--ink); }
  .abc .td { padding:2px 10px; border-bottom:1px solid var(--tint-line); }
  .abc.cols2 .td:nth-last-child(-n+2), .abc.cols3 .td:nth-last-child(-n+3) { border-bottom:none; }
  .abc.cols2 .td:nth-child(odd), .abc.cols3 .td:nth-child(3n+1) { font-weight:600; color:var(--ink); }

  .note { margin:5px 0 0; font-size:8px; font-style:italic; font-weight:600; color:var(--ink); text-align:center; }
  .note.top { margin:0 0 6px; text-align:left; font-weight:400; color:var(--muted); }

  .log { display:grid; grid-template-columns:60px 1fr; gap:3px 8px; }
  .log .th, .obs .th, .ews .th { font-weight:700; font-size:8px; color:var(--ink); }
  .ewst { display:grid; grid-template-columns:118px repeat(7,1fr) 62px 44px;
    border:1px solid #000; font-size:7.5px; line-height:1.2; }
  .ewst > div { border-right:1px solid #000; border-bottom:1px solid #000; padding:2px 3px; }
  .ewst .eh { background:#d9d9d9; font-weight:700; text-align:center; }
  .ewst .eh.ep { text-align:left; }
  .ewst .rs { grid-row:span 2; display:flex; align-items:center; justify-content:center; }
  .ewst .eh.ep.rs { justify-content:flex-start; }
  .ewst .span7 { grid-column:span 7; }
  .ewst .ep { background:#d9d9d9; font-weight:600; }
  .ewst .band { text-align:center; font-weight:600; display:flex; align-items:center; justify-content:center; }
  .ewst .s3 { background:#b0241a; color:#fff; }
  .ewst .s2 { background:#f4c042; }
  .ewst .s1 { background:#fdfd5a; }
  .ewst .s0 { background:#a3d063; }
  .ewst .pv { background:#fff; padding:2px; }
  .ewst .pv .box { height:100%; min-height:14px; }
  .ews { display:grid; grid-template-columns:50px repeat(7,1fr); gap:3px 6px; align-items:center; }
  .ews .th.c { text-align:center; font-size:7.5px; }
  .ews .rowlbl { font-weight:600; font-size:8px; }
  .ews-total { display:flex; align-items:center; flex-wrap:wrap; gap:4px; margin-top:6px; }
  .ews-total .box.total { width:60px; height:18px; }
  .ews-total .checks { display:inline-flex; }
  .log .box { height:20px; }

  .obs { display:grid; grid-template-columns:170px repeat(6,1fr); gap:3px 5px; align-items:center; }
  .obs .rowlbl { font-size:8px; }
  .obs .box { height:26px; }

  .code { font-size:7.5px; line-height:1.5; color:var(--ink); }
  .subhead { font-size:7.5px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:var(--ink);
    border-bottom:1px solid var(--tint-line); margin-bottom:3px; padding-bottom:2px; }

  .bodymap-row { display:flex; justify-content:center; gap:40px; margin-bottom:8px; }
  .bodymap { text-align:center; }
  .bodymap-cap { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:var(--ink); margin-bottom:5px; }
  .silhouette { position:relative; border:1px solid var(--border); border-radius:8px; background:var(--field); padding:8px; }
  .silhouette.big { height:700px; width:320px; }
  .silhouette svg { height:100%; width:auto; display:block; margin:0 auto; }
  .sil { fill:#fff; stroke:var(--navy); stroke-width:3; stroke-linejoin:round; }

  /* Marina sits only in the footer: small mark + disclaimer + contact */
  footer { flex:none; margin-top:auto; padding-top:5px; border-top:1px solid var(--border);
    display:flex; align-items:center; gap:10px; font-size:7px; color:var(--muted); }
  footer .marina-brand { display:flex; align-items:center; gap:5px; flex:none; }
  footer .marina { width:18px; height:18px; display:block; }
  footer .marina-brand span { font-size:10px; font-weight:600; color:var(--navy); white-space:nowrap; }
  footer .disclaimer { flex:1; line-height:1.4; }
  footer .pageno { flex:none; font-weight:600; }

  @media print {
    html, body { background:#fff; }
    .page { margin:0; box-shadow:none; }
    @page { size:A4; margin:0; }
  }
'''

pages = [p1, p2, p3, p4]
html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Radio Medical Record — Radio Medico / Mariners Medico Guide</title>
<!-- Generated: English Radio Medical Record (fluid chart omitted).
     Logos are embedded as data URIs because the build script loads this file via
     page.setContent(), which cannot resolve relative image paths. -->
<style>{CSS}</style>
</head>
<body>
''' + '\n'.join(f'<!-- ===================== PAGE {i} ===================== -->\n<div class="page">{p}\n</div>'
               for i, p in enumerate(pages, 1)) + '\n</body>\n</html>\n'

open(f'{T}/radio-medical-record.html', 'w').write(html)
print('wrote', f'{T}/radio-medical-record.html', len(html))
