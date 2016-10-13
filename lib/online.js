var BitGoJS = require('bitgo')
var underscore = require('underscore')

module.exports = {
/* { config       : { env            : 'prod'   }
   , authenticate : { username       : '...'
                    , password       : '...'
                    , otp            : '...'
                    }
   }
 */
  authenticate:
    function (options, callback) {
      var bitgo = new BitGoJS.BitGo(options.config || { env: 'prod' })

      bitgo.authenticate(options.authenticate, function (err) {
        if (err) return callback(err, options)

        bitgo.unlock({ otp: options.authenticate.otp }, function(err) {
          if (err) return callback(err, options)

          options.bitgo = bitgo
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
    function (options, callback) {
      var bitgo = options.bitgo

      bitgo.keychains().add(underscore.pick(options.userKey, [ 'label', 'xpub', 'encryptedXprv' ]), function (err, keychain) {
        if (err) return callback(err, null, options)

        bitgo.keychains().add(underscore.pick(options.backupKey, [ 'label', 'xpub' ]),
        function (err, keychain) {
          if (err) return callback(err, null, options)

          bitgo.keychains().createBitGo({}, function (err, bitGoKey) {
            if (err) return callback(err, null, options)

            bitgo.wallets().add({ label: options.label,
                                  m: 2,
                                  n: 3,
                                  keychains: [ { xpub: options.userKey.xpub },
                                               { xpub: options.backupKey.xpub },
                                               { xpub: bitGoKey.xpub }] },
            function (err, result) {
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
    function (options, callback) {
      var bitgo = options.bitgo

      bitgo.wallets().get(options.wallet, function (err, wallet) {
        if (err) return callback(err, null, options)

        wallet.createTransaction({ recipients: options.recipients }, function (err, unsignedTx) {
          if (err) return callback(err, null, options)

          callback(null, unsignedTx, options)
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
    function (options, callback) {
      var bitgo = options.bitgo

      bitgo.wallets().get(options.wallet, function (err, wallet) {
        if (err) return callback(err, null, options)

        wallet.sendTransaction({ tx: options.transaction.tx, message: options.message }, function (err, result) {
          if (err) return callback(err, null, options)

          return callback(null, result, options)
        })
      })
    }
}
