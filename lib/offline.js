var BitGoJS = require('bitgo')
var underscore = require('underscore')

module.exports = {
  createKeychains:
/* { config       : { env            : 'prod'   }
   , passphrase1  : '...'
   , passphrase2  : '...'
   , label        : '...'
   }
 */
    function (options) {
      var bitgo = new BitGoJS.BitGo(options.config || { env: 'prod' })

      var trim = function (key, label, passphrase) {
        key.label = label
        key.encryptedXprv = bitgo.encrypt({ password: passphrase, input: key.xprv })
        return underscore.omit(key, [ 'xprv' ])
      }

      return { userKey: trim(bitgo.keychains().create(), 'user', options.passphrase1),
               backupKey: trim(bitgo.keychains().create(), 'backup', options.passphrase1) }
    },

/* { config       : { env            : 'prod'   }
   , keychain     : { xpub           : '...'
                    , path           : 'm'
                    , encryptedXprv  : '...'
                    }
   }
 */
  retrieveKeychain:
    function (options, callback) {
      var bitgo = new BitGoJS.BitGo(options.config || { env: 'prod' })

      options.keychain.xprv = bitgo.decrypt({ password: options.passphrase, input: options.encryptedXprv })
    },

/* { config       : { env            : 'prod'   }
   , wallet       : { id             : '...'    }
   , unsignedTx   : { transactionHex : '...'
                    , unspents:      ; ...
                    }
   , keychain     : { xpub           : '...'
                    , path           : 'm'
                    , xprv           : '...'
                    }
   }
 */
  createSignedTx:
    function (options, callback) {
      var bitgo = new BitGoJS.BitGo(options.config || { env: 'prod' })
      var wallet = bitgo.newWalletObject({ wallet: options.wallet })

      wallet.signTransaction({ transactionHex: options.unsignedTx.transactionHex,
                               unspents: options.unsignedTx.unspents,
                               keychain: options.keychain }, function (err, signedTx) {
        if (err) return callback(err, null, options)

        callback(null, signedTx, options)
      })
    }
}
