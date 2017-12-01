#!/usr/bin/env node

/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true, esversion: 6 */

const BitGoJS = require('bitgo')
const json2csv = require('json2csv')
const underscore = require('underscore')

let bitgo

const data = []
const wallets = []

const add = () => {
  const wallet = wallets.shift()

  bitgo.wallets().get({ type: 'bitcoin', id: wallet.id }, (err, result) => {
    if (err) throw err

    process.stderr.write('>')
    underscore.extend(wallet, { balance: result.balance()
                              , spendable: result.spendableBalance()
                              , confirmed: result.confirmedBalance()
                              , unconfirmed: result.unconfirmedReceives()
                              })
    data.push(wallet)
    if (wallets.length === 0) return console.log(json2csv({ data: data }))

    setTimeout(add, (wallets.length % 10) ? 0 : 1000)
  })
}

const listWallets = (skip) => {
  bitgo.wallets().list({ skip: skip, limit: 250 }, (err, result) => {
    let id

    if (err) throw err

    process.stderr.write('list: ' + skip + '..' + (skip + result.wallets.length) + '\n')
    if (result.wallets.length === 0) return add()

    for (id in result.wallets) {
      wallets.push(result.wallets[id].wallet)
      skip++
    }

    listWallets(skip)
  })
}

switch (process.argv.length) {
  case 3:
    bitgo = new BitGoJS.BitGo({ env: 'prod', accessToken: process.argv[2] })
    return listWallets(0)

  default:
    console.log("usage: " + process.argv[0] + " " + process.argv[1] + " <user> <pass> <otp>, or <accessToken>")
    process.exit(1)
}
