const BitGoJS = require('bitgo')
const underscore = require('underscore')

module.exports = {
/* { config       : { env            : 'prod'   }
   , authenticate : { username       : '...'
                    , password       : '...'
                    , otp            : '...'
                    , otp2           : '...'
                    , accessToken    : '...'
                    }
   }
 */
  authenticate:
    (options, callback) => {
      const config = underscore.extend(options.config || { env: 'prod' },
                                       underscore.pick(options.authenticate, [ 'accessToken' ]))
      const bitgo = new BitGoJS.BitGo(config)

      options.bitgo = bitgo
      if (config.accessToken) return callback(null, options)

      bitgo.authenticate(options.authenticate, (err) => {
        if (err) return callback(err, options)

        if (!options.authenticate.otp2) return callback(null, options)

        bitgo.unlock({ otp: options.authenticate.otp2 }, (err) => {
          if (err) return callback(err, options)

          callback(null, options)
        })
      })
    },

/* { bitgo        :  ...
   , userKey      : { label          : '...'
                    , xpub           : '...'
                    , encryptedXprv  : '...'
                    }
   , backupKey    : { label          : '...'
                    , xpub           : '...'
                    }
   , label        : '...'
   }
 */
  createWallet:
    (options, callback) => {
      const bitgo = options.bitgo

      bitgo.keychains().add(underscore.pick(options.userKey, [ 'label', 'xpub', 'encryptedXprv' ]), (err, keychain) => {
        if (err) return callback(err, null, options)

        bitgo.keychains().add(underscore.pick(options.backupKey, [ 'label', 'xpub' ]),
        (err, keychain) => {
          if (err) return callback(err, null, options)

          bitgo.keychains().createBitGo({}, (err, bitGoKey) => {
            if (err) return callback(err, null, options)

            bitgo.wallets().add({
              label: options.label,
              m: 2,
              n: 3,
              enterprise: options.enterpriseId,
              keychains: [ { xpub: options.userKey.xpub }, { xpub: options.backupKey.xpub }, { xpub: bitGoKey.xpub } ]
            },
            (err, result) => {
              if (err) return callback(err, null, options)

              callback(null, result.wallet, options)
            })
          })
        })
      })
    },

/* { bitgo        :  ...
   , wallet       : { id             : '...'    }
   , recipients   : { 'address'      : satoshis }
   }
 */
  createTx:
    (options, callback) => {
      const bitgo = options.bitgo

      bitgo.estimateFee({ numBlocks: 6 }, (err, estimate) => {
        if (err) return callback(err, null, options)

        console.log('estimated fees: ' + JSON.stringify(estimate, null, 2))
        bitgo.wallets().get(options.wallet, (err, wallet) => {
          if (err) return callback(err, null, options)

          wallet.createTransaction({ recipients: options.recipients, feeTxConfirmTarget: 1 }, (err, unsignedTx) => {
            if (err) return callback(err, null, options)

            console.log('actual fee: ' + unsignedTx.fee)
            callback(null, unsignedTx, options)
          })
        })
      })
    },

/* { bitgo        :  ...
   , wallet       : { id             : '...'    }
   , transaction  : { tx             :  ...     }
   , message      : '...'
   }
 */
  submitTx:
    (options, callback) => {
      const bitgo = options.bitgo

      if (!options.wallet) options.wallet = { id: options.walletId }
      if (!options.wallet.type) options.wallet.type = 'bitcoin'
      bitgo.wallets().get(options.wallet, (err, wallet) => {
        if (err) return callback(err, null, options)

        wallet.sendTransaction({ tx: options.tx, message: options.message }, (err, result) => {
          if (err) return callback(err, null, options)

          callback(null, result, options)
        })
      })
    }
}
