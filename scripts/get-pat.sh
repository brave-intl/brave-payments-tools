#!/bin/sh

if [ -z "$1" ]; then
    echo "usage: $0 username" 1>&2
    exit 1
fi

curl https://api-sandbox.uphold.com/v0/me/tokens \
  -s \
  -X POST \
  -H 'OTP-Token: 0000000' \
  -H "Content-Type: application/json" \
  -u "$1" \
  -d '{ "description": "payment-tools" }' | cat
