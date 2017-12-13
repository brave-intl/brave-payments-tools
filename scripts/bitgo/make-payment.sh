#!/bin/bash

if [ -z "$1" ]; then
  echo "usage: $0 file" 1>&2
  exit 1
else
  P="$1"
fi

if [ -z "$2" ]; then
  W="wallet-Payments-1.json"
else
  W="$1"
fi

U="unsigned-$P"
if [ ! -f "$U" ]; then
  online-create-transaction --wallet "$W" --payments "$P" --unsignedTx "$U"
fi

S="signed-$P"
if [ ! -f "$S" ]; then
  offline-sign-transaction --unsignedTx "$U" --signedTx "$S"
fi

online-submit-transaction --signedTx "$S"
