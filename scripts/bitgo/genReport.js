#!/usr/bin/env node

/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true, esversion: 6 */

const BitGoJS = require('bitgo')
const moment = require('moment')

let bitgo

const generate = (address, startDate) => {
  let start

  try {
    start = new moment(startDate, 'YYYY-MM-DD') // eslint-disable-line new-cap
  } catch (ex) {}

  if (!start) {
    console.log('invalid starting date: ' + startDate)
    process.exit(1)
  }

  bitgo.getWalletAddress({ address: address }, (err, wallet) => {
    if (err) throw err

    bitgo.get(bitgo.url('/reports/' + wallet.wallet)).query({
      period: 'month', format: 'csv', start: start.utc().format(), currency: 'usd'
    }).result().nodeify((err, result) => {
      if (err) throw err

      console.log(result.data.split('\\"').join('"'))
    })
  })
}

switch (process.argv.length) {
  case 5:
    bitgo = new BitGoJS.BitGo({ env: 'prod', accessToken: process.argv[2] })
    return generate(process.argv[3], process.argv[4])

  default:
    console.log('usage: ' + process.argv[0] + ' ' + process.argv[1] + ' <accessToken> <address> <startDate>')
    process.exit(1)
}
