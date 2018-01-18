#!/usr/bin/env node

/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true, esversion: 6 */

const BigNumber = require('bignumber.js')
const braveCrypto = require('brave-crypto')
const crypto = require('crypto')
const LedgerClient = require('bat-client')
const sign = require('http-request-signature').sign
const stringify = require('json-stable-stringify')
const underscore = require('underscore')
const UpholdSDK = require('@uphold/uphold-sdk-javascript')

let headers
let uphold

const transfer = (source, keypair, destination) => {
  uphold.getCard(source, { headers: headers }).then((card) => {
    const body = { denomination: { amount: card.available, currency: card.currency }, destination: destination }

    transact(source, keypair, body, false, (result) => {
      console.log('before: ' + body.denomination.amount)
      body.denomination.amount = new BigNumber(body.denomination.amount)
      if (body.denomination.amount.isZero()) return console.log('zero balance')
      body.denomination.amount = body.denomination.amount.minus(new BigNumber(result.origin.fee))
      if (body.denomination.amount.lessThanOrEqualTo(0)) return console.log('insufficient balance: ' + card.available)
      body.denomination.amount = body.denomination.amount.toString()
      console.log(' after: ' + body.denomination.amount)
      transact(source, keypair, body, true, (result) => {})
    })
  })
}

const transact = (source, keypair, body, commitP, callback) => {
  const octets = stringify(body)
  const signature = {
    digest: 'SHA-256=' + crypto.createHash('sha256').update(octets).digest('base64'),
    signature: sign({ headers: headers, keyId: 'primary', secretKey: braveCrypto.uint8ToHex(keypair.secretKey) },
                    { algorithm: 'ed25519' })
  }
  const signedTx = {
    id: source,
    requestType: 'httpSignature',
    signedTx: { headers: underscore.extend(signature, headers), body: body, octets: octets }
  }

  uphold.createCardTransaction(source,
                               underscore.extend(underscore.pick(body, [ 'destination' ]), body.denomination),
                               commitP,
                               null,
      { headers: signedTx.signedTx.headers, body: signedTx.signedTx.octets }).then((result) => {
        console.log('status=' + result.status)
        callback(result)
      })
}

const recoverKeyPair = (seed) => {
  return LedgerClient(null, { roundtrip: () => {} }, null).recoverKeypair(seed)
}

switch (process.argv.length) {
  case 3:
    return console.log(braveCrypto.uint8ToHex(recoverKeyPair(process.argv[2]).publicKey))

  case 6:
    uphold = new UpholdSDK.default({ // eslint-disable-line new-cap
      baseUrl: 'https://api.uphold.com',
      clientId: '0000000000000000000000000000000000000000',
      clientSecret: '0000000000000000000000000000000000000000'
    })

    headers = {
      authorization: 'Basic ' + Buffer.from(process.argv[2] + ':X-OAuth-Basic').toString('base64')
    }

    return transfer(process.argv[3], LedgerClient(null, { roundtrip: () => {} }, null).recoverKeypair(process.argv[4]),
                    process.argv[5])

  default:
    console.log('usage: ' + process.argv[0] + ' ' + process.argv[1] + ' <accessToken> <source> <seed> <destination>')
    console.log('usage: ' + process.argv[0] + ' ' + process.argv[1] + ' <seed>')
    process.exit(1)
}
