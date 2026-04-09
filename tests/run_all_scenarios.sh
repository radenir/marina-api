#!/usr/bin/env bash
# =============================================================================
# Marina API — Parallel Interview Scenario Runner
# Runs all 61 scenarios against api.marinahealth.eu in parallel.
#
# Usage:
#   MARINA_TEST_EMAIL=... MARINA_TEST_PASSWORD=... NEBIUS_API_KEY=... \
#   ./tests/run_all_scenarios.sh [BASE_URL] [CONCURRENCY]
#
# Defaults: BASE_URL=https://api.marinahealth.eu  CONCURRENCY=30
# Results:  tests/runs/<scenario_name>.txt
# =============================================================================

BASE="${1:-https://api.marinahealth.eu}"
CONCURRENCY="${2:-30}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNS_DIR="$SCRIPT_DIR/runs"
PY="$SCRIPT_DIR/interview_test.py"

# Load .env if credentials not already in environment
ENV_FILE="$SCRIPT_DIR/../.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

if [[ -z "$MARINA_TEST_EMAIL" || -z "$MARINA_TEST_PASSWORD" ]]; then
  echo -e "${RED}ERROR: Set MARINA_TEST_EMAIL and MARINA_TEST_PASSWORD${NC}"; exit 2
fi
if [[ -z "$NEBIUS_API_KEY" ]]; then
  echo -e "${RED}ERROR: Set NEBIUS_API_KEY${NC}"; exit 2
fi

mkdir -p "$RUNS_DIR"

# =============================================================================
# Scenario definitions: "NAME|PATIENT_LANG|MO_LANG|SYMPTOM"
# =============================================================================
SCENARIOS=(
  "01_chest_en_en|English|English|I have chest pain in the center of my chest, it started this morning"
  "01_chest_fil_en|Filipino|English|Masakit ang dibdib ko, parang may pumipiga, nagsimula kahapon"
  "01_chest_fil_fil|Filipino|Filipino|Masakit ang dibdib ko, parang may pumipiga, nagsimula kahapon"
  "02_abdomen_es_en|Spanish|English|Tengo un dolor abdominal muy fuerte en la parte inferior derecha desde ayer"
  "02_fever_id_en|Indonesian|English|Saya demam tinggi sudah dua hari dan batuk tidak berhenti dengan dahak kuning"
  "02_fever_id_no|Indonesian|Norwegian|Saya demam tinggi sudah tiga hari dan batuk berdahak kuning"
  "03_headache_fr_fr|French|French|J'ai une tres forte migraine, la pire de ma vie, elle a commence il y a deux heures"
  "03_headache_hi_da|Hindi|Danish|Mujhe bahut tej sar dard ho raha hai aur aankhon ke saamne andhera aa raha hai"
  "03_headache_hi_en|Hindi|English|Mujhe bahut tej sar dard ho raha hai aur aankhon ke saamne andhera aa raha hai"
  "04_abdomen_zh_en|Chinese|English|我的腹部右下方非常疼痛，从昨晚开始，走路也很困难"
  "04_abdomen_zh_sv|Chinese|Swedish|我右下腹部剧烈疼痛，从昨晚开始，走路很困难"
  "04_fever_pt_en|Portuguese|English|Tenho febre de 39 graus ha dois dias com tosse produtiva e muco amarelo"
  "05_backpain_pl_pl|Polish|Polish|Mam ostry bol w dolnej czesci plecow po podniesieniu ciezkiego sprzetu"
  "05_backpain_ua_pl|Ukrainian|Polish|У мене сильний біль у попереку після того як я підняв важке обладнання"
  "05_backpain_ua_ua|Ukrainian|Ukrainian|У мене сильний біль у попереку після того, як я підняв важке обладнання"
  "05_backpain_uk_uk|Ukrainian|Ukrainian|У мене сильний біль у попереку після того, як я підняв важке обладнання"
  "06_chest_ro_en|Romanian|English|Am durere puternică în piept și mă simt foarte slăbit de dimineață"
  "06_dizzy_ro_fr|Romanian|French|Am amețeli severe și greață, mă simt că se învârte totul în jurul meu"
  "06_dyspnea_de_de|German|German|Ich habe seit einer Stunde starke Atemnot, die sich beim Hinlegen verschlimmert"
  "07_knee_gr_en|Greek|English|Έχω έντονο πόνο στο γόνατο μετά από πτώση στο κατάστρωμα πριν από μία ώρα"
  "07_knee_gr_it|Greek|Italian|Έπεσα στο κατάστρωμα και έχω έντονο πόνο στο γόνατο"
  "07_nausea_it_en|Italian|English|Ho vomitato per 6 ore e mi sento molto nauseato, non riesco a tenere niente nello stomaco"
  "08_redeye_en_ar|English|Arabic|I have a very red and painful eye with discharge since this morning, I can barely open it"
  "08_redeye_tr_en|Turkish|English|Sabahtan beri sol gözüm çok kırmızı ve yanıyor, göremiyorum iyi"
  "08_redeye_tr_nl|Turkish|Dutch|Sol gözüm sabahtan beri çok kırmızı ve yanıyor, göremiyorum iyi"
  "09_breath_bn_ru|Bengali|Russian|আমার বুকে ব্যথা এবং শ্বাস নিতে অনেক কষ্ট হচ্ছে"
  "09_chest_bn_en|Bengali|English|আমার বুকে খুব ব্যথা করছে এবং শ্বাস নিতে কষ্ট হচ্ছে"
  "09_trauma_en_ru|English|Russian|My knee is very swollen and painful after I slipped and fell on the wet deck an hour ago"
  "10_abdomen_my_en|Burmese|English|ငါ့ဗိုက်ထဲမှာ အရမ်းနာတယ်၊ အော့အန်နေတယ်"
  "10_fever_fil_en|Filipino|English|Mayroon akong matinding sakit ng ulo at nanginginig ako, malamig ang katawan ko ngayon"
  "10_nausea_my_de|Burmese|German|ငါ့ဗိုက်ထဲမှာ အရမ်းနာတယ်၊ အော့အန်နေတယ်"
  "11_cough_vi_ms|Vietnamese|Malay|Tôi ho rất nhiều và khó thở đặc biệt về đêm"
  "12_syncope_ar_es|Arabic|Spanish|أشعر بدوار شديد وأغمي علي مرتين اليوم"
  "13_urinary_pt_hr|Portuguese|Croatian|Estou com dor ao urinar e urina com sangue há dois dias"
  "14_rash_es_pt|Spanish|Portuguese|Tengo sarpullido con ampollas en el brazo desde ayer"
  "15_ear_pl_ua|Polish|Ukrainian|Mam bardzo silny ból ucha i gorączkę od wczoraj wieczoru"
  "16_dental_ru_fil|Russian|Filipino|У меня очень сильная зубная боль справа, не могу жевать уже два дня"
  "17_diarrhea_th_ro|Thai|Romanian|ฉันท้องเสียมากตั้งแต่เมื่อคืน อุจจาระเป็นน้ำ ปวดท้องมาก"
  "18_fatigue_ka_el|Georgian|Greek|ვგრძნობ უკიდურეს დაღლილობას და სიცხეს უკვე სამი დღეა"
  "19_wrist_hr_tr|Croatian|Turkish|Imam jaku bol u zapešću nakon pada na palubi, ne mogu pomicati ruku"
  "20_fever_de_hi|German|Hindi|Ich habe seit gestern Abend hohes Fieber und Schüttelfrost"
  "21_palpit_ja_bg|Japanese|Bulgarian|動悸がして胸が苦しい、昨日から息切れも続いています"
  "22_shoulder_ko_sk|Korean|Slovak|어깨가 너무 아파서 팔을 위로 들 수가 없어요"
  "23_fever_am_sl|Amharic|Slovenian|ትኩሳት አለብኝ እና ጭንቅላቴ ያምኛል ሁለት ቀን ሆኖኛል"
  "24_abdomen_sw_et|Swahili|Estonian|Nina maumivu makali ya tumbo na kutapika kwa siku mbili"
  "25_chest_ur_hy|Urdu|Armenian|مجھے سینے میں درد ہو رہا ہے اور سانس لینے میں تکلیف ہے"
  "26_eye_ta_kk|Tamil|Kazakh|என் கண் வலிக்கிறது மற்றும் சிவப்பாக இருக்கிறது, காலையிலிருந்து"
  "27_headache_fa_ne|Persian|Nepali|سردرد شدیدی دارم که از دیشب شروع شده و حالت تهوع هم دارم"
  "28_back_he_si|Hebrew|Sinhala|יש לי כאב גב חזק מאז שהרמתי ציוד כבד על הסיפון"
  "29_abdomen_sr_pa|Serbian|Punjabi|Imam jake bolove u stomaku i mučninu od juče ujutru"
  "30_fatigue_cs_lo|Czech|Lao|Mám silnou únavu a horečku, necítím se dobře již dva dny"
  "31_rash_hu_sq|Hungarian|Albanian|Erős kiütések vannak a karomon és nagyon viszket, tegnap este jelent meg"
  "32_ear_fi_mk|Finnish|Macedonian|Minulla on todella kova korvakipu ja lämpöä jo kahden päivän ajan"
  "33_urinary_lt_bs|Lithuanian|Bosnian|Skauda šlapinantis, matosi kraujas ir turiu karščio"
  "34_dizzy_az_wo|Azerbaijani|Wolof|Başım çox gicəllənir, ürəyim bulanır, bu səhərdən başlayıb"
  "35_cough_uz_zu|Uzbek|Zulu|Kuchli yo'tal bor va nafas olish qiyin bo'lib qoldi"
  "36_trauma_mn_so|Mongolian|Somali|Унасны дараа гарны үе маш хүчтэй өвдөж эхэлсэн"
  "37_dental_km_ig|Khmer|Igbo|ធ្មេញខ្ញុំឈឺខ្លាំងណាស់ ហើយថ្គាមមុខហើម"
  "38_breath_yo_lv|Yoruba|Latvian|Mo ni irora ninu àyà àti ìṣòro mímí, ó bẹrẹ lálẹ àná"
  "39_fever_af_ky|Afrikaans|Kyrgyz|Ek het hoë koors en rillings sedert gisteroggend en voel baie siek"
  "40_abdomen_ha_te|Hausa|Telugu|Ina jin zafi sosai a cikin ciki kuma ina amai tun dare"
)

TOTAL=${#SCENARIOS[@]}
echo -e "${BOLD}${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${BLUE}  Marina API — Parallel Scenario Runner${NC}"
echo -e "${BOLD}${BLUE}  ${TOTAL} scenarios · concurrency=${CONCURRENCY} · $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${BOLD}${BLUE}  BASE: ${BASE}${NC}"
echo -e "${BOLD}${BLUE}════════════════════════════════════════════════════${NC}"
echo ""
printf "  %-32s  %s\n" "Scenario" "Started"
printf "  %s\n" "$(printf '%.0s─' $(seq 1 55))"

# =============================================================================
# Launch up to CONCURRENCY scenarios at a time using a semaphore file approach
# =============================================================================

RUNNING=0
PIDS=()
PNAMES=()

for entry in "${SCENARIOS[@]}"; do
  # Throttle to CONCURRENCY
  while [[ $RUNNING -ge $CONCURRENCY ]]; do
    # Poll for any finished job
    NEW_PIDS=()
    NEW_NAMES=()
    for i in "${!PIDS[@]}"; do
      pid="${PIDS[$i]}"
      nm="${PNAMES[$i]}"
      if ! kill -0 "$pid" 2>/dev/null; then
        wait "$pid" 2>/dev/null
        RUNNING=$((RUNNING - 1))
        out="$RUNS_DIR/${nm}.txt"
        if grep -q "INTERVIEW COMPLETED SUCCESSFULLY" "$out" 2>/dev/null; then
          printf "  %-32s  ${GREEN}PASS${NC}  %s\n" "$nm" "$(date '+%H:%M:%S')"
        else
          reason=$(grep -oP "STUCK in stage \d+ \([^)]+\)" "$out" 2>/dev/null | tail -1)
          [[ -z "$reason" ]] && reason=$(grep -oP "HTTP \d+:" "$out" 2>/dev/null | tail -1)
          [[ -z "$reason" ]] && reason="FAILED"
          printf "  %-32s  ${RED}FAIL${NC}  %s  (%s)\n" "$nm" "$(date '+%H:%M:%S')" "$reason"
        fi
      else
        NEW_PIDS+=("$pid")
        NEW_NAMES+=("$nm")
      fi
    done
    PIDS=("${NEW_PIDS[@]}")
    PNAMES=("${NEW_NAMES[@]}")
    [[ $RUNNING -ge $CONCURRENCY ]] && sleep 2
  done

  # Parse entry
  IFS='|' read -r name p_lang mo_lang symptom <<< "$entry"

  # Launch background process
  (
    MARINA_TEST_EMAIL="$MARINA_TEST_EMAIL" \
    MARINA_TEST_PASSWORD="$MARINA_TEST_PASSWORD" \
    NEBIUS_API_KEY="$NEBIUS_API_KEY" \
    MARINA_SYMPTOM="$symptom" \
    MARINA_PATIENT_LANG="$p_lang" \
    MARINA_MO_LANG="$mo_lang" \
    python3 -u "$PY" "$BASE" > "$RUNS_DIR/${name}.txt" 2>&1
  ) &
  bgpid=$!
  PIDS+=("$bgpid")
  PNAMES+=("$name")
  RUNNING=$((RUNNING + 1))
  printf "  %-32s  ${YELLOW}RUNNING${NC}  %s\n" "$name" "$(date '+%H:%M:%S')"
done

# Wait for all remaining jobs
while [[ ${#PIDS[@]} -gt 0 ]]; do
  NEW_PIDS=()
  NEW_NAMES=()
  for i in "${!PIDS[@]}"; do
    pid="${PIDS[$i]}"
    nm="${PNAMES[$i]}"
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" 2>/dev/null
      out="$RUNS_DIR/${nm}.txt"
      if grep -q "INTERVIEW COMPLETED SUCCESSFULLY" "$out" 2>/dev/null; then
        printf "  %-32s  ${GREEN}PASS${NC}  %s\n" "$nm" "$(date '+%H:%M:%S')"
      else
        reason=$(grep -oP "STUCK in stage \d+ \([^)]+\)" "$out" 2>/dev/null | tail -1)
        [[ -z "$reason" ]] && reason=$(grep -oP "HTTP \d+:" "$out" 2>/dev/null | tail -1)
        [[ -z "$reason" ]] && reason="FAILED"
        printf "  %-32s  ${RED}FAIL${NC}  %s  (%s)\n" "$nm" "$(date '+%H:%M:%S')" "$reason"
      fi
    else
      NEW_PIDS+=("$pid")
      NEW_NAMES+=("$nm")
    fi
  done
  PIDS=("${NEW_PIDS[@]}")
  PNAMES=("${NEW_NAMES[@]}")
  [[ ${#PIDS[@]} -gt 0 ]] && sleep 2
done

# =============================================================================
# Summary
# =============================================================================
PASS=0; FAIL=0
FAILED_LIST=()
for entry in "${SCENARIOS[@]}"; do
  IFS='|' read -r name _ _ _ <<< "$entry"
  out="$RUNS_DIR/${name}.txt"
  if grep -q "INTERVIEW COMPLETED SUCCESSFULLY" "$out" 2>/dev/null; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    reason=$(grep -oP "STUCK in stage \d+ \([^)]+\)" "$out" 2>/dev/null | tail -1)
    [[ -z "$reason" ]] && reason=$(grep -oP "HTTP \d+:" "$out" 2>/dev/null | tail -1)
    [[ -z "$reason" ]] && reason="unknown"
    FAILED_LIST+=("  ${RED}✗${NC} $name  ($reason)")
  fi
done

echo ""
echo -e "${BOLD}${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  SUMMARY — $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${BOLD}${BLUE}════════════════════════════════════════════════════${NC}"
printf "  Total  : %d\n" "$TOTAL"
printf "  ${GREEN}Passed : %d${NC}\n" "$PASS"
printf "  ${RED}Failed : %d${NC}\n" "$FAIL"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo -e "${BOLD}Failed scenarios:${NC}"
  for line in "${FAILED_LIST[@]}"; do
    echo -e "$line"
  done
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}ALL SCENARIOS PASSED${NC}"
  exit 0
else
  echo -e "  ${RED}${BOLD}${FAIL} SCENARIO(S) FAILED${NC}"
  exit 1
fi
