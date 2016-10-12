var BitGoJS = require('bitgo')

module.exports = {
/* { config       : { env      : 'prod' }
   , authenticate : { username : '...'
                    , password : '...'
                    , opt      : '...'
                    }
   , wallet       : { id       : '...'  }
   , transaction  : { tx       : '...'  }
   }
 */
  submitSignedTx:
    function (options, callback) {
      var bitgo = new BitGoJS.BitGo(options.config || { env: 'prod' })
      var wallet = bitgo.newWalletObject({ wallet: options.wallet })

      bitgo.authenticate(options.authenticate, function (err) {
        if (err) return callback(err, null, options)

        bitgo.unlock({ otp: options.authenticate.otp }, function (err) {
          if (err) return callback(err, null, options)

          wallet.sendTranaction({ tx: options.transaction.tx }, function (err, result) {
            if (err) return callback(err, null, options)

            return callback(null, result, options)
          })
        })
      })
    }
}
