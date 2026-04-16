#!/usr/bin/env python3
"""
Marina API — Concurrent Skip Stage Test Runner
================================================
Runs all skip_test.py cases in parallel.

Usage:
    python3 tests/run_skip_tests.py [CONCURRENCY]

Default concurrency: 10 (skip tests hit the API harder per case)
Results written to tests/runs/<slug>.txt
"""

import sys, os, json, subprocess, time, threading
from concurrent.futures import ThreadPoolExecutor, as_completed

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RUNS_DIR   = os.path.join(SCRIPT_DIR, "runs")
SKIP_TEST  = os.path.join(SCRIPT_DIR, "skip_test.py")

RED, GREEN, YELLOW, BLUE, BOLD, NC = (
    "\033[0;31m", "\033[0;32m", "\033[1;33m",
    "\033[0;34m", "\033[1m",    "\033[0m",
)

print_lock = threading.Lock()

def run_case(case_number, case_name, case_slug):
    out_path = os.path.join(RUNS_DIR, f"{case_slug}.txt")
    t0 = time.monotonic()
    try:
        result = subprocess.run(
            [sys.executable, SKIP_TEST, str(case_number)],
            capture_output=True, text=True, timeout=900,
        )
        output   = result.stdout + (result.stderr or "")
        success  = result.returncode == 0 and "PASS" in output
        err_hint = ""
        if not success:
            for line in output.splitlines():
                if "✗" in line or "FAIL" in line or "HTTP" in line or "regression" in line.lower():
                    err_hint = line.strip()[:80]
                    break
    except subprocess.TimeoutExpired:
        output, success, err_hint = "TIMEOUT after 900s\n", False, "timeout"

    elapsed = time.monotonic() - t0
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(output)
    return case_number, case_name, case_slug, success, elapsed, err_hint


def run_case_live(case_number, case_name, case_slug):
    out_path = os.path.join(RUNS_DIR, f"{case_slug}.txt")
    with print_lock:
        print(f"{BOLD}{BLUE}── Live: [{case_number}] {case_name} ──{NC}\n", flush=True)

    t0    = time.monotonic()
    lines = []
    success  = False
    err_hint = ""
    try:
        proc = subprocess.Popen(
            [sys.executable, SKIP_TEST, str(case_number)],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
        with open(out_path, "w", encoding="utf-8") as f:
            for line in proc.stdout:
                with print_lock:
                    print(line, end="", flush=True)
                f.write(line)
                lines.append(line)
        proc.wait()
        output  = "".join(lines)
        success = proc.returncode == 0 and "PASS" in output
        if not success:
            for line in lines:
                if "✗" in line or "FAIL" in line or "HTTP" in line or "regression" in line.lower():
                    err_hint = line.strip()[:80]
                    break
    except Exception as e:
        err_hint = str(e)[:60]

    elapsed = time.monotonic() - t0
    with print_lock:
        print(f"\n{BOLD}{BLUE}── End live ──{NC}\n", flush=True)
    return case_number, case_name, case_slug, success, elapsed, err_hint


def get_cases():
    """Import case list from skip_test.py without running main()."""
    import importlib.util
    spec   = importlib.util.spec_from_file_location("skip_test", SKIP_TEST)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return [(i + 1, c["name"], c["slug"]) for i, c in enumerate(module.CASES)]


def main():
    concurrency = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    os.makedirs(RUNS_DIR, exist_ok=True)

    cases = get_cases()
    total = len(cases)

    print(f"\n{BOLD}{BLUE}{'═'*60}{NC}")
    print(f"{BOLD}{BLUE}  Marina — Skip Stage Concurrent Runner{NC}")
    print(f"{BOLD}{BLUE}  {total} cases · concurrency={concurrency}{NC}")
    print(f"{BOLD}{BLUE}{'═'*60}{NC}\n")

    live_num, live_name, live_slug = cases[0]
    rest = cases[1:]

    passed, failed = [], []

    with ThreadPoolExecutor(max_workers=max(1, concurrency - 1)) as ex:
        futures = {
            ex.submit(run_case, num, name, slug): (num, name, slug)
            for num, name, slug in rest
        }

        # Stream live case in main thread
        _, _, _, ok, elapsed, err_hint = run_case_live(live_num, live_name, live_slug)
        if ok:
            passed.append(live_name)
        else:
            failed.append((live_name, live_slug, err_hint))

        print(f"  {'#':<3}  {'Case':<44}  Result    Time")
        print(f"  {'─'*3}  {'─'*44}  {'─'*8}  {'─'*6}")

        tag = f"{GREEN}PASS{NC}" if ok else f"{RED}FAIL{NC}"
        print(f"  {live_num:<3}  {live_name[:44]:<44}  {tag}      {elapsed:5.0f}s")

        for future in as_completed(futures):
            _, name, slug, ok, elapsed, err_hint = future.result()
            if ok:
                passed.append(name)
                print(f"  {'':3}  {name[:44]:<44}  {GREEN}PASS{NC}      {elapsed:5.0f}s")
            else:
                failed.append((name, slug, err_hint))
                hint = f"  ({err_hint})" if err_hint else ""
                print(f"  {'':3}  {name[:44]:<44}  {RED}FAIL{NC}      {elapsed:5.0f}s{hint}")

    print(f"\n{BOLD}{BLUE}{'═'*60}{NC}")
    colour = GREEN if not failed else RED
    print(f"  {colour}Passed: {len(passed)}/{total}{NC}   {RED if failed else GREEN}Failed: {len(failed)}/{total}{NC}")
    if failed:
        print(f"\n  {BOLD}Failed cases:{NC}")
        for name, slug, hint in failed:
            hint_str = f"  — {hint}" if hint else ""
            print(f"    {RED}✗{NC} {name}{hint_str}")
            print(f"      → tests/runs/{slug}.txt")
    print()
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
