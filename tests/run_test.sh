#!/usr/bin/env bash
set -a
source "$(dirname "$0")/../.env"
set +a

export MARINA_TEST_EMAIL="${MARINA_TEST_EMAIL:-radomski.adr@gmail.com}"
export MARINA_TEST_PASSWORD="${MARINA_TEST_PASSWORD:-Gierek123}"

python3 "$(dirname "$0")/interview_test.py" "$@"
