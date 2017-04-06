var BitGoJS = require('bitgo')
var sjcl = BitGoJS.sjcl
var underscore = require('underscore')

module.exports = {
  encrypt:
    function (params) {
      if (!(params && params.password && params.input)) throw new Error('invalid parameters')

      return sjcl.encrypt(params.password, params.input, { iter: 100000, ks: 256, salt: sjcl.random.randomWords(2, 0) })
    },

/* { config       : { env            : 'prod'   }
   , passphrase1  : '...'
   , passphrase2  : '...'
   , label        : '...'
   }
 */
  createKeychains:
    function (options) {
      var bitgo = new BitGoJS.BitGo(options.config || { env: 'prod' })

      var trim = function (key, label, passphrase) {
        key.label = label
        key.encryptedXprv = module.exports.encrypt({ password: passphrase, input: key.xprv })
        return underscore.omit(key, [ 'xprv' ])
      }

      return {
        userKey: trim(bitgo.keychains().create(), 'user', options.passphrase1),
        backupKey: trim(bitgo.keychains().create(), 'backup', options.passphrase2)
      }
    },

/* { config       : { env            : 'prod'   }
   , unsignedTx   : { transactionHex : '...'
                    , unspents       :  ...
                    , walletId       : '...'
                    }
   , keychain     : { xpub           : '...'
                    , encryptedXprv  : '...'
                    }
   , passphrase   : '...'
   }
 */
  createSignedTx:
    function (options, callback) {
      var bitgo = new BitGoJS.BitGo(options.config || { env: 'prod' })
      var wallet = bitgo.newWalletObject({ wallet: { id: options.unsignedTx.walletId } })

      try {
        options.keychain.xprv = bitgo.decrypt({ password: options.passphrase, input: options.keychain.encryptedXprv })
      } catch (ex) { throw new Error('invalid passphrase') }
      options.keychain.path = 'm'

      wallet.signTransaction({
        transactionHex: options.unsignedTx.transactionHex,
        unspents: options.unsignedTx.unspents,
        keychain: options.keychain
      }, function (err, signedTx) {
        if (err) return callback(err, null, options)

        callback(null, signedTx, options)
      })
    }
}
