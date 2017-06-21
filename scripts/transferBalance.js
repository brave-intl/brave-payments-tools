#!/usr/bin/env node

/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

var BitGoJS = require('../node_modules/bitgo/src/index.js');
var underscore = require('../node_modules/underscore/underscore.js')

var bitgo


var transfer = function (source, passphrase, destination) {
  bitgo.wallets().get({ type: 'bitcoin', id: source }, function (err, wallet) {
    var satoshis

    if (err) throw err

    satoshis = wallet.confirmedBalance()

    wallet.removePolicyRule({ id: 'com.brave.limit.velocity.30d' }, function (err /*, result */) {
      if (err) {
        if (satoshis > 7000000) satoshis = 7000000
//      throw err
      }

      bitgo.estimateFee({ numBlocks: 5 }, function (err, estimate) {
        var fee, numBlocks

        if (err) throw err

        console.log('estimated fees: ' + JSON.stringify(estimate, null, 2))
        numBlocks = 0
        for (var target in estimate.feeByBlockTarget) {
          if ((target > numBlocks) && (estimate.numBlocks >= target)) fee = estimate.feeByBlockTarget[numBlocks = target]
        }
        console.log('satoshis=' + satoshis + ' fee=' + fee + ' numBlocks=' + numBlocks)
      
        wallet.sendCoins({ address          : destination
                         , amount           : satoshis - fee
                         , fee              : fee
                         , walletPassphrase : passphrase
                         }, function (err, result) {
          if (err) throw err

          console.log(JSON.stringify(underscore.omit(result, [ 'tx' ]), null, 2))
        })
      })
    })
  })
}

switch (process.argv.length) {
  case 6:
    bitgo = new BitGoJS.BitGo({ env: 'prod', accessToken: process.argv[2] })
    return transfer(process.argv[3], process.argv[4], process.argv[5])

  default:
    console.log("usage: " + process.argv[0] + " " + process.argv[1] + " <accessToken> <source> <passphrase> <destination>")
    process.exit(1)
}
