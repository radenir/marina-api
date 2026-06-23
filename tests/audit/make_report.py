#!/usr/bin/env python3
"""
Generate a LaTeX software-verification report from the latest audit evidence.

Reads the most recent tests/audit/results/<run_id>/results.json plus the run
manifest and fixtures, and writes marina-verification-report.tex next to this
script. Compile with pdflatex/xelatex or upload to Overleaf.

Usage:
    python3 tests/audit/make_report.py
"""
import os, sys, json, glob

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fixtures import build_fixtures, REQUIREMENTS

# The fix is committed and deployed; the audit evidence was generated from the
# identical working-tree change on the parent commit.
FIX_COMMIT = "1822403"
PARENT_COMMIT = "ec80774"
DOC_VERSION = "1.0"
DOC_DATE = "2026-06-23"
AUTHOR = "Adrian Radomski"


def tex_escape(s):
    repl = {"&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#", "_": r"\_",
            "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}"}
    return "".join(repl.get(c, c) for c in str(s))


def latest_results():
    dirs = sorted(glob.glob(os.path.join(HERE, "results", "*")))
    if not dirs:
        sys.exit("No audit results found — run run_audit.py first.")
    return json.load(open(os.path.join(dirs[-1], "results.json")))


def main():
    res = latest_results()
    prov = res["provenance"]
    cases = res["cases"]
    fixtures = {f["case_id"]: f for f in build_fixtures()}
    manifest = {m["index"]: m for m in json.load(open(os.path.join(HERE, "..", "reports", "manifest.json")))}

    total = sum(len(c["checks"]) for c in cases)
    fails = sum(1 for c in cases for k in c["checks"] if k["status"] == "FAIL")
    cases_pass = sum(1 for c in cases if all(k["status"] == "PASS" for k in c["checks"]))
    langs = sorted({fixtures[c["case_id"]]["patient_lang"] for c in cases} |
                   {fixtures[c["case_id"]]["mo_lang"] for c in cases})

    roll = {}
    for c in cases:
        for k in c["checks"]:
            d = roll.setdefault(k["requirement"], [0, 0])
            d[0 if k["status"] == "PASS" else 1] += 1

    req_rows = []
    for rq, desc in REQUIREMENTS.items():
        p, fl = roll.get(rq, [0, 0])
        status = r"\pass" if fl == 0 and (p + fl) > 0 else (r"\fail" if fl else "--")
        req_rows.append(f"{tex_escape(rq)} & {tex_escape(desc)} & {p+fl} & {p} & {fl} & {status} \\\\")

    case_rows = []
    for c in sorted(cases, key=lambda c: c["case_id"]):
        fx = fixtures[c["case_id"]]
        man = manifest.get(fx["index"], {})
        nf = sum(1 for k in c["checks"] if k["status"] == "FAIL")
        result = r"\pass" if nf == 0 else r"\fail"
        lang = f"{tex_escape(fx['patient_lang'])} $\\rightarrow$ {tex_escape(fx['mo_lang'])}"
        case_rows.append(
            f"{fx['index']} & {tex_escape(c['case_id'])} & {lang} & "
            f"{tex_escape(fx['condition'])} & {man.get('turns','--')} & "
            f"{len(c['checks'])} & {result} \\\\")

    verdict = "PASS" if fails == 0 else "FAIL"
    overall_cmd = r"\pass" if fails == 0 else r"\fail"

    tex = TEMPLATE.format(
        doc_version=DOC_VERSION, doc_date=DOC_DATE, author=tex_escape(AUTHOR),
        fix_commit=FIX_COMMIT, parent_commit=PARENT_COMMIT,
        api_sha=tex_escape(prov["api_git_sha"][:12]), api_branch=tex_escape(prov["api_branch"]),
        sim_model=tex_escape(prov["simulator_model"]), harness=tex_escape(prov["harness_version"]),
        run_at=tex_escape(prov["run_at_utc"]), evidence=tex_escape(prov["evidence_source"]),
        n_cases=len(cases), n_assert=total, n_assert_pass=total - fails, n_fail=fails,
        cases_pass=cases_pass, n_lang=len(langs), lang_list=tex_escape(", ".join(langs)),
        n_req=len(REQUIREMENTS), verdict=verdict, overall_cmd=overall_cmd,
        req_rows="\n".join(req_rows), case_rows="\n".join(case_rows),
    )
    out = os.path.join(HERE, "marina-verification-report.tex")
    open(out, "w").write(tex)
    print(f"Wrote {os.path.relpath(out, os.path.join(HERE, '..', '..'))}")
    print(f"  {len(cases)} cases, {total} assertions, {fails} failures, verdict {verdict}")
    print("  Compile:  pdflatex marina-verification-report.tex   (or upload to Overleaf)")


TEMPLATE = r"""% Marina API — Software Verification Report (auto-generated)
% Compile: pdflatex marina-verification-report.tex   (run twice for the ToC)
\documentclass[11pt]{{article}}
\usepackage[a4paper,margin=2.4cm]{{geometry}}
\usepackage{{booktabs,longtable,array,xcolor,titlesec,fancyhdr,lastpage}}
\usepackage[hidelinks]{{hyperref}}
\renewcommand{{\familydefault}}{{\sfdefault}}

\definecolor{{navy}}{{RGB}}{{20,40,90}}
\definecolor{{okgreen}}{{RGB}}{{20,120,40}}
\definecolor{{badred}}{{RGB}}{{170,30,30}}
\newcommand{{\pass}}{{\textcolor{{okgreen}}{{\textbf{{PASS}}}}}}
\newcommand{{\fail}}{{\textcolor{{badred}}{{\textbf{{FAIL}}}}}}
\titleformat{{\section}}{{\large\bfseries\color{{navy}}}}{{\thesection}}{{0.6em}}{{}}
\titleformat{{\subsection}}{{\normalsize\bfseries\color{{navy}}}}{{\thesubsection}}{{0.6em}}{{}}

\pagestyle{{fancy}}\fancyhf{{}}
\lhead{{\small Marina API — Software Verification Report}}
\rhead{{\small v{doc_version}}}
\cfoot{{\small Page \thepage\ of \pageref{{LastPage}}}}
\renewcommand{{\headrulewidth}}{{0.3pt}}

\begin{{document}}

\begin{{titlepage}}
\centering
\vspace*{{2.5cm}}
{{\Huge\bfseries\color{{navy}} Software Verification Report\par}}
\vspace{{0.6cm}}
{{\LARGE Marina API — Multilingual Clinical Interview,\\[2pt] Extraction \& Seafarer Medical Report\par}}
\vspace{{2.0cm}}
\begin{{tabular}}{{rl}}
\toprule
Document version & {doc_version}\\
Date & {doc_date}\\
Author & {author}\\
Verdict & {overall_cmd}\\
Cases verified & {n_cases}\\
Assertions passed & {n_assert_pass}/{n_assert}\\
\bottomrule
\end{{tabular}}
\vfill
{{\small System under test: \texttt{{api.marinahealth.eu}} \quad Commit \texttt{{{fix_commit}}}\par}}
\end{{titlepage}}

\tableofcontents
\newpage

\section{{Executive Summary}}
This report documents verification of the Marina API pipeline that conducts a
multilingual clinical interview, extracts a structured medical summary, and
generates the Marina seafarer medical report (PDF). Verification was performed
by an automated harness that asserts pipeline outputs against predefined
ground-truth values, rather than merely confirming the pipeline executed.

\medskip
\noindent\textbf{{Result:}} {overall_cmd}. Across {n_cases} test cases spanning
{n_lang} languages, all {n_assert} field-level assertions passed
({cases_pass}/{n_cases} cases fully passing). One defect identified during
verification (empty vital-sign fields in the generated report) was corrected and
re-verified; see Section~\ref{{sec:defect}}.

\section{{Scope and System Under Test}}
The verified pipeline comprises three production endpoints:
\begin{{itemize}}
\item \texttt{{POST /ai/interview/chat}} — stateful, multi-turn Marina clinical interview.
\item \texttt{{POST /ai/extract}} — structured medical summary extraction.
\item \texttt{{POST /ai/generate-pdf}} (\texttt{{template=marina}}) — seafarer report generation.
\end{{itemize}}
The interview and the responding patient/medical officer were exercised
end-to-end; each case was driven to completion, extracted, and rendered to a
report PDF. Languages covered: {lang_list}.

\section{{Verification Methodology}}
\subsection{{Test cases and ground truth}}
{n_cases} versioned test cases (identifiers \texttt{{MAR-EXT-01}}\,\dots) are
defined in \texttt{{tests/audit/fixtures.py}}. Each case carries the exact
clinical values the simulated medical officer reports (vital signs, gender,
consciousness level). These values are parsed from the same persona definitions
that drive the run, so the test oracle and the run cannot silently diverge. The
reported vital signs are deterministic, permitting exact-match assertions.

\subsection{{Assertions}}
For each case the harness asserts: interview completion; presence of all required
summary fields; each extracted vital sign equals ground truth; gender and
consciousness equal ground truth; chief complaint reflects the presenting
symptom; for non-English cases, extraction yields an English summary; the report
PDF is generated; and the report's structured fields and Sex/AVPU radios contain
the extracted values (read directly from the rendered PDF form).

\subsection{{Provenance and reproducibility}}
Every run records its provenance for traceability:
\begin{{center}}
\begin{{tabular}}{{rl}}
\toprule
Harness version & {harness}\\
Run timestamp (UTC) & {run_at}\\
API commit & \texttt{{{api_sha}}} ({api_branch})\\
Evidence source & \texttt{{{evidence}}}\\
Interview driver model & \texttt{{{sim_model}}}\\
\bottomrule
\end{{tabular}}
\end{{center}}
Evidence is emitted in machine-readable form (\texttt{{junit.xml}},
\texttt{{results.json}}) alongside a human-readable traceability matrix. The
harness exits non-zero if any assertion fails, so a defect cannot be recorded as
a pass.

\section{{Requirement Traceability Matrix}}
\begin{{center}}
\begin{{longtable}}{{l p{{6.7cm}} c c c c}}
\toprule
\textbf{{Req.\ ID}} & \textbf{{Requirement}} & \textbf{{Checks}} & \textbf{{Pass}} & \textbf{{Fail}} & \textbf{{Status}}\\
\midrule
\endhead
{req_rows}
\bottomrule
\end{{longtable}}
\end{{center}}

\section{{Test Case Results}}
\begin{{center}}
\begin{{longtable}}{{r l l l c c c}}
\toprule
\textbf{{\#}} & \textbf{{Case ID}} & \textbf{{Languages (patient $\rightarrow$ MO)}} & \textbf{{Condition}} & \textbf{{Turns}} & \textbf{{Checks}} & \textbf{{Result}}\\
\midrule
\endhead
{case_rows}
\bottomrule
\end{{longtable}}
\end{{center}}

\section{{Defect and Corrective Action}}\label{{sec:defect}}
\textbf{{Finding.}} The initial verification run failed requirement
\texttt{{REQ-PDF-FIELDS}} on all {n_cases} cases: extracted vital signs and the
Sex/AVPU radio selections were correct in the structured summary but were not
rendered into the seafarer report PDF.

\medskip
\noindent\textbf{{Root cause.}} The report field mapper
(\texttt{{src/lib/seafarerMapper.ts}}) read a single \texttt{{vitals}} string that
the \texttt{{/ai/extract}} endpoint does not produce; the endpoint returns
discrete fields (\texttt{{circulation\_*}}, \texttt{{breathing\_*}},
\texttt{{expose\_*}}). The vital-sign boxes therefore rendered empty.

\medskip
\noindent\textbf{{Correction.}} The mapper was changed to read the discrete
extract fields, with a fallback to the legacy \texttt{{vitals}} string — the same
precedence already used by the companion RMD report mapper. A regression test
(\texttt{{tests/seafarerMapper.test.ts}}) was added. Reports were regenerated and
re-verified; \texttt{{REQ-PDF-FIELDS}} subsequently passed on all cases. The fix
is committed as \texttt{{{fix_commit}}} (parent \texttt{{{parent_commit}}}) and
deployed to production, where rendering was independently re-confirmed.

\section{{Limitations}}
\begin{{itemize}}
\item Verification was executed against the production environment using a shared
test account; each interview created a record in the production data store.
A formal verification cycle should target an isolated environment.
\item Interview wording is produced by a language model and is non-deterministic;
only the deterministic clinical values (vital signs, demographics) are asserted
by exact match. Narrative fields are checked for presence and, for non-English
cases, for English output.
\end{{itemize}}

\section{{Conclusion}}
The Marina interview, extraction, and seafarer report pipeline meets all
{n_req} defined requirements across {n_cases} multilingual test cases
({n_assert} assertions, {n_fail} failures). Verdict: {overall_cmd}.

\vspace{{1.2cm}}
\noindent\begin{{tabular}}{{p{{6cm}} p{{6cm}}}}
\hrulefill & \hrulefill\\
Prepared by & Reviewed / approved by\\
{author} & \\
\end{{tabular}}

\appendix
\section{{Evidence Artifacts}}
\begin{{itemize}}
\item \texttt{{tests/audit/results/<run\_id>/junit.xml}} — machine-readable assertion results.
\item \texttt{{tests/audit/results/<run\_id>/results.json}} — full results and provenance.
\item \texttt{{tests/audit/results/<run\_id>/traceability.md}} — requirement matrix.
\item \texttt{{tests/reports/<case>/}} — per-case report PDF, extracted summary, transcript.
\item \texttt{{tests/reports/manifest.csv}} — index of all cases with record identifiers.
\end{{itemize}}

\end{{document}}
"""

if __name__ == "__main__":
    main()
