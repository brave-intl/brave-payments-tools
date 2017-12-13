const BitGoJS = require('bitgo')
const sjcl = require('sjcl')
const underscore = require('underscore')

const encrypt = (params) => {
  if (!(params && params.password && params.input)) throw new Error('invalid parameters')

  return sjcl.encrypt(params.password, params.input, { iter: 100000, ks: 256, salt: sjcl.random.randomWords(8, 0) })
}

module.exports = {
/* { config       : { env            : 'prod'   }
   , passphrase1  : '...'
   , passphrase2  : '...'
   , label        : '...'
   }
 */
  createKeychains:
    (options) => {
      const bitgo = new BitGoJS.BitGo(options.config || { env: 'prod' })

      const trim = (key, label, passphrase) => {
        key.label = label
        key.encryptedXprv = encrypt({ password: passphrase, input: key.xprv })
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
    (options, callback) => {
      const bitgo = new BitGoJS.BitGo(options.config || { env: 'prod' })
      const wallet = bitgo.newWalletObject({ wallet: { id: options.unsignedTx.walletId } })

      try {
        options.keychain.xprv = sjcl.decrypt(options.passphrase, options.keychain.encryptedXprv)
      } catch (ex) { throw new Error('invalid passphrase') }
      options.keychain.path = 'm'

      wallet.signTransaction({
        transactionHex: options.unsignedTx.transactionHex,
        unspents: options.unsignedTx.unspents,
        keychain: options.keychain
      }, (err, signedTx) => {
        if (err) return callback(err, null, options)

        callback(null, signedTx, options)
      })
    },

/* { config       : { env            : 'prod'   }
   , keychain     : { xpub           : '...'
                    , encryptedXprv  : '...'
                    }
   , passphrase   : '...'
   }
 */
  showKey:
    (options, callback) => {
      let secretKey

      try {
        secretKey = sjcl.decrypt(options.passphrase, options.keychain.encryptedXprv)
      } catch (ex) { throw new Error('invalid passphrase') }

      callback(null, secretKey, options)
    }
}
