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
//    uphold.storage.setItem('uphold.access_token', options.authenticate.accessToken)
      options.authenticate.headers = {
        authorization: 'Basic ' + Buffer.from(options.authenticate.accessToken + ':X-OAuth-Basic').toString('base64')
      }
      if (options.authenticate.otp) options.authenticate.headers['otp-token'] = options.authenticate.otp

      options.uphold = uphold
      callback(null, options)
    },

/* { uphold       :  ...
   , userKey      : { label          :  '...'
                    , payload        : { ... }
                    }
   , label        : '...'
   , authenticate : { accessToken    :  '...'
                    }
   }
 */
  createWallet:
    (options, callback) => {
      const uphold = options.uphold
      const request = options.userKey.payload.signedTx

      console.log(JSON.stringify(options.authenticate, null, 2))
      uphold.createCard(request.body.currency, options.label, {
        headers: underscore.extend(options.authenticate.headers, request.headers),
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
   , recipients   : [ { address      : '...'
                      , probi        : '...'
                      }
                      ...
                    ]
   , message      : '...'
   }
 */
  createTx:
    (options, callback) => {
      const result = { config: options.config, unsignedTxs: [] }

      for (let destination of options.recipients) {
        result.unsignedTxs.push({
          denomination: {
            amount: new BigNumber(destination.probi).dividedBy('1e18').toString(),
            currency: options.wallet.currency
          },
          destination: destination.address,
          message: options.message,
          id: options.wallet.id,
          label: options.label
        })
      }
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
          headers: underscore.extend(options.authenticate.headers, options.signedTx.headers),
          body: options.signedTx.octets
        }).then((result) => {
          let submit

          submit = underscore.extend(underscore.pick(result, [ 'status', 'message' ]),
                                     { hash: result.id, walletId: result.origin.CardId, tx: options.signedTx.octets },
                                     underscore.pick(result.destination, [ 'currency', 'amount', 'commission', 'fee' ]))
          setTimeout(() => {
            console.log('zzz')
            callback(null, submit, options)
          }, 1000)
        }).catch((err) => {
          callback(err, null, options)
        })
    }
}
