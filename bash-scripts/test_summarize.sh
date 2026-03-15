#!/usr/bin/env bash
AT=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"radomski.adr@gmail.com","password":"Gierek123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Token: ${AT:0:40}..."

curl -X POST http://localhost:4000/ai/summarize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AT" \
  -d '{"conversation":[{"role":"user","content":"I have chest pain"},{"role":"assistant","content":"How long have you had it?"},{"role":"user","content":"About two hours"}]}'
