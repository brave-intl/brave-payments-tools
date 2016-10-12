var BitGoJS = require('bitgo')

module.exports = {
/* { config     : { env           : 'prod'   }
   , keychain   : { xpub          : '...'
                  , path          : 'm'
                  , encryptedXprv : '...'
                  }
   }
 */
  retrieveKeychain:
    function (options, callback) {
      var bitgo = new BitGoJS.BitGo(options.config || { env: 'prod' })

      options.keychain.xprv = bitgo.decrypt({ password: options.passphrase, input: options.encryptedXprv })
    },

/* { config     : { env           : 'prod'   }
   , wallet     : { id            : '...'    }
   , recipients : { 'address'     : satoshis }
   , keychain   : { xpub          : '...'
                  , path          : 'm'
                  , xprv          : '...'
                  }
   }
 */
  createSignedTx:
    function (options, callback) {
      var bitgo = new BitGoJS.BitGo(options.config || { env: 'prod' })
      var wallet = bitgo.newWalletObject({ wallet: options.wallet })

      wallet.createTransaction({ recipients: options.recipients }, function (err, unsignedTx) {
        if (err) return callback(err, null, options)

        wallet.signTransaction({ transactionHex: unsignedTx.transactionHex,
                                 unspents: unsignedTx.unspents,
                                 keychain: options.keychain }, function (err, signedTx) {
          if (err) return callback(err, null, options)

          callback(null, signedTx, options)
        })
      })
    }
}
