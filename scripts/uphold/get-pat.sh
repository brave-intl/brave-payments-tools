#!/bin/sh

if [ -z "$1" -o -z "$2" ]; then
    echo "usage: $0 username OTP" 1>&2
    exit 1
fi

API="api.uphold.com"
if [ \( "$UPHOLD_ENVIRONMENT" = "sandbox" \) -o \( "$UPHOLD_ENVIRONMENT" = "sandbox" \) ]; then
  API="api-sandbox.uphold.com"
fi    

curl "https://$API/v0/me/tokens" \
  -v \
  -X POST \
  -u "$1" \
  -H "OTP-Token: $2" \
  -H "Content-Type: application/json" \
  -d '{ "description": "brave-payment-tools" }' | cat
