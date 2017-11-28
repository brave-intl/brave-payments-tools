const BigNumber = require('bignumber.js')
const UpholdSDK = require('@uphold/uphold-sdk-javascript')
const underscore = require('underscore')

module.exports = {
/* { config       : { env            : 'prod'   }
   , authenticate : { accessToken    : '...'
                    , otp            : '...'
                    }
   }
 */
  authenticate:
    (options, callback) => {
      const uri = {
        prod: 'https://api.uphold.com',
        test: 'https://api-sandbox.uphold.com'
      }[options.config.env]
      const uphold = new UpholdSDK.default({ // eslint-disable-line new-cap
        baseUrl: uri,
        clientId: '0000000000000000000000000000000000000000',
        clientSecret: '0000000000000000000000000000000000000000'
      })

      if (!uri) throw new Error('invalid operating environment: ' + options.config.env)
      uphold.storage.setItem('uphold.access_token', options.authenticate.accessToken)

      options.uphold = uphold
      callback(null, options)
    },

/* { uphold       :  ...
   , userKey      : { label          :  '...'
                    , payload        : { ... }
   , label        : '...'
   , authenticate : { accessToken    :  '...'
                    , otp            :  '...'
                    }
   }
 */
  createWallet:
    (options, callback) => {
      const uphold = options.uphold
      const request = options.userKey.payload.signedTx

      uphold.createCard(request.body.currency, options.label, {
        headers: underscore.extend({ 'otp-token': options.authenticate.otp }, request.headers),
        body: request.octets
      }).then((wallet) => {
        callback(null, wallet, options)
      }).catch((err) => {
        callback(err, null, options)
      })
    },

/* { uphold       :  ...
   , wallet       : { id             : '...'
                    , currency       : 'BAT
                    }
   , recipients   : { 'address'      : probi }
   , message      : '...'
   }
 */
  createTx:
    (options, callback) => {
      const result = { config: options.config, unsignedTxs: [] }

      underscore.keys(options.recipients).forEach((destination) => {
        result.unsignedTxs.push({
          denomination: {
            amount: new BigNumber(options.recipients[destination]).dividedBy('1e18').toString(),
            currency: options.wallet.currency
          },
          destination: destination,
          message: options.message,
          id: options.wallet.id,
          label: options.label
        })
      })
      callback(null, result, options)
    },

/* { uphold       :  ...
   , authenticate : { otp            :  '...' }
   , id           : '...'
   , signedTx     : { headers        : { ... }
                    , body           : { ... }
                    , octets         :  '...'
                    }
   , message      : '...'
   }
 */
  submitTx:
    (options, callback) => {
      const uphold = options.uphold

      uphold.createCardTransaction(options.id,
                                   underscore.extend(underscore.pick(options.signedTx.body, [ 'destination', 'message' ]),
                                                     options.signedTx.body.denomination), true, options.authenticate.otp,
        {
          headers: options.signedTx.headers,
          body: options.signedTx.octets
        }).then((result) => {
          let submit

          submit = underscore.extend(underscore.pick(result, [ 'status', 'message' ]),
                                     { hash: result.id, walletId: result.origin.CardId, tx: options.signedTx.octets },
                                     underscore.pick(result.destination, [ 'currency', 'amount', 'commission', 'fee' ]))
          callback(null, submit, options)
        }).catch((err) => {
          callback(err, null, options)
        })
    }
}
