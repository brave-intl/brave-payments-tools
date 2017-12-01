#!/usr/bin/env node

/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true, esversion: 6 */

const BitGoJS = require('bitgo')
const json2csv = require('json2csv')

let bitgo

let data = []

const printAllWallets = (skip) => {
  bitgo.wallets().list({ skip: skip, limit: 250 }, (err, result) => {
    let id

    if (err) throw err

    if (result.wallets.length === 0) {
      const r = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

      data = data.sort((a, b) => {
        if (a.label.match(r)) {
          if (!b.label.match(r)) return 1
        } else if (b.label.match(r)) return (-1)

        return ((a.label > b.label) ? 1 : (a.label < b.label) ? (-1) : 0)
      })
      return console.log(json2csv({ data: data }))
    }

    for (id in result.wallets) {
      data.push(JSON.parse(JSON.stringify(result.wallets[id])))
      skip++
    }

    printAllWallets(skip)
  })
}

switch (process.argv.length) {
  case 3:
    bitgo = new BitGoJS.BitGo({ env: 'prod', accessToken: process.argv[2] })
    return printAllWallets(0)

  default:
    console.log("usage: " + process.argv[0] + " " + process.argv[1] + " <user> <pass> <otp>, or <accessToken>")
    process.exit(1)
}
