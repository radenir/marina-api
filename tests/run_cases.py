#!/usr/bin/env python3
"""
Marina API — Case Runner
========================
Runs specific cases from simple_test.py by 1-based case number.

Usage:
    python3 tests/run_cases.py 61 62 63      # run cases 61, 62, 63
    python3 tests/run_cases.py 61-70          # run cases 61 through 70
    python3 tests/run_cases.py 61-70 1        # same, with concurrency=1 (sequential)

Output directory defaults to tests/runs/.
Set MARINA_RUNS_DIR env var to override:
    MARINA_RUNS_DIR=tests/runs/qwen python3 tests/run_cases.py 61-70
"""

import sys, os, json, subprocess, time, threading
from concurrent.futures import ThreadPoolExecutor, as_completed

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
RUNS_DIR    = os.environ.get("MARINA_RUNS_DIR") or os.path.join(SCRIPT_DIR, "runs")
SIMPLE_TEST = os.path.join(SCRIPT_DIR, "simple_test.py")

RED, GREEN, YELLOW, BLUE, BOLD, NC = (
    "\033[0;31m", "\033[0;32m", "\033[1;33m",
    "\033[0;34m", "\033[1m",    "\033[0m",
)

# ── Parse args ────────────────────────────────────────────────────────────────

def parse_args():
    args = sys.argv[1:]
    if not args:
        print(f"{RED}Usage: python3 tests/run_cases.py <cases> [concurrency]{NC}")
        print(f"  Examples:")
        print(f"    python3 tests/run_cases.py 61 62 63")
        print(f"    python3 tests/run_cases.py 61-70")
        print(f"    python3 tests/run_cases.py 61-70 1")
        sys.exit(1)

    # Split into range-args (contain '-') and plain number args
    range_args  = [a for a in args if "-" in a]
    number_args = [a for a in args if "-" not in a]

    case_nums = []
    for a in range_args:
        lo, hi = a.split("-", 1)
        case_nums.extend(range(int(lo), int(hi) + 1))

    # If there's exactly one plain number AND we already have cases from a range,
    # treat it as concurrency. Otherwise treat all plain numbers as case numbers.
    concurrency = 5
    if case_nums and len(number_args) == 1:
        concurrency = int(number_args[0])
    else:
        for a in number_args:
            case_nums.append(int(a))

    if not case_nums:
        print(f"{RED}No case numbers specified.{NC}")
        sys.exit(1)

    return sorted(set(case_nums)), concurrency


# ── Runner ────────────────────────────────────────────────────────────────────

def run_case(case_num):
    """Run simple_test.py for a single case number, save output, return result."""
    env_vars = os.environ.copy()
    env_vars["MARINA_RUNS_DIR"] = RUNS_DIR

    t0 = time.monotonic()
    try:
        result = subprocess.run(
            [sys.executable, SIMPLE_TEST, str(case_num)],
            env=env_vars, capture_output=True, text=True, timeout=900,
        )
        output  = result.stdout + (result.stderr or "")
        success = result.returncode == 0 and "Interview complete" in output
        err_hint = ""
        if not success:
            for line in output.splitlines():
                if "HTTP " in line or "Error" in line or "error" in line:
                    err_hint = line.strip()[:80]
                    break

        # Extract slug/name from output for display
        name = f"case_{case_num}"
        for line in output.splitlines():
            if line.strip().startswith("  ") and "patient" in line.lower() or "MO" in line:
                name = line.strip()[:50]
                break
            if "═" not in line and line.strip() and not line.startswith("Marina") and len(line.strip()) > 5:
                candidate = line.strip()
                if "patient" in candidate.lower() or "—" in candidate:
                    name = candidate[:50]
                    break

    except subprocess.TimeoutExpired:
        output, success, err_hint = "TIMEOUT after 900s\n", False, "timeout"
        name = f"case_{case_num}"

    elapsed = time.monotonic() - t0
    return case_num, name, success, elapsed, err_hint


def run_case_live(case_num):
    """Run one case streaming output to stdout."""
    env_vars = os.environ.copy()
    env_vars["MARINA_RUNS_DIR"] = RUNS_DIR

    t0      = time.monotonic()
    lines   = []
    success = False
    err_hint = ""
    name    = f"case_{case_num}"

    try:
        proc = subprocess.Popen(
            [sys.executable, SIMPLE_TEST, str(case_num)],
            env=env_vars, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
        for line in proc.stdout:
            print(line, end="", flush=True)
            lines.append(line)
            if "patient" in line.lower() and "—" in line and "═" not in line:
                name = line.strip()[:50]
        proc.wait()
        output   = "".join(lines)
        success  = proc.returncode == 0 and "Interview complete" in output
        if not success:
            for line in lines:
                if "HTTP " in line or "Error" in line:
                    err_hint = line.strip()[:80]
                    break
    except subprocess.TimeoutExpired:
        proc.kill()
        err_hint = "timeout"

    elapsed = time.monotonic() - t0
    return case_num, name, success, elapsed, err_hint


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    case_nums, concurrency = parse_args()

    os.makedirs(RUNS_DIR, exist_ok=True)

    total = len(case_nums)
    print(f"\n{BOLD}{BLUE}{'═'*56}{NC}")
    print(f"{BOLD}{BLUE}  Marina — Case Runner{NC}")
    print(f"{BOLD}{BLUE}  Cases: {case_nums}{NC}")
    print(f"{BOLD}{BLUE}  concurrency={concurrency}  →  {RUNS_DIR}{NC}")
    print(f"{BOLD}{BLUE}{'═'*56}{NC}\n")

    passed, failed = [], []

    if concurrency == 1 or total == 1:
        # Sequential — stream all live
        for num in case_nums:
            num, name, success, elapsed, err_hint = run_case_live(num)
            if success:
                passed.append((num, name))
                print(f"\n  {GREEN}PASS{NC}  case {num}  ({elapsed:.0f}s)\n")
            else:
                failed.append((num, name, err_hint))
                print(f"\n  {RED}FAIL{NC}  case {num}  ({elapsed:.0f}s)  {err_hint}\n")
    else:
        # Concurrent — stream first, run rest in background
        live_num = case_nums[0]
        rest     = case_nums[1:]

        with ThreadPoolExecutor(max_workers=max(1, concurrency - 1)) as ex:
            futures = {ex.submit(run_case, n): n for n in rest}

            num, name, success, elapsed, err_hint = run_case_live(live_num)
            if success:
                passed.append((num, name))
            else:
                failed.append((num, name, err_hint))

            print(f"\n  {'Case':<6}  {'Name':<40}  Result    Time")
            print(f"  {'─'*6}  {'─'*40}  {'─'*8}  {'─'*6}")

            label = name[:40]
            if success:
                print(f"  {num:<6}  {label:<40}  {GREEN}PASS{NC}      {elapsed:5.0f}s")
            else:
                print(f"  {num:<6}  {label:<40}  {RED}FAIL{NC}      {elapsed:5.0f}s  ({err_hint})")

            for future in as_completed(futures):
                num, name, success, elapsed, err_hint = future.result()
                label = name[:40]
                if success:
                    passed.append((num, name))
                    print(f"  {num:<6}  {label:<40}  {GREEN}PASS{NC}      {elapsed:5.0f}s")
                else:
                    failed.append((num, name, err_hint))
                    print(f"  {num:<6}  {label:<40}  {RED}FAIL{NC}      {elapsed:5.0f}s  ({err_hint})")

    print(f"\n{BOLD}{BLUE}{'═'*56}{NC}")
    print(f"  {GREEN}Passed: {len(passed)}/{total}{NC}   {RED}Failed: {len(failed)}/{total}{NC}")
    if failed:
        print(f"\n  {BOLD}Failed:{NC}")
        for num, name, hint in failed:
            print(f"    {RED}✗{NC} case {num}  {name}  {hint}")
    print()
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
