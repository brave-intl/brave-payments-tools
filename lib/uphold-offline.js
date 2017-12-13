const crypto = require('crypto')

const sign = require('http-request-signature').sign
const sjcl = require('sjcl')
const stringify = require('json-stable-stringify')
const underscore = require('underscore')

const braveCrypto = require('brave-crypto')

// taken from bat-client:index.js
const SEED_LENGTH = 32
const HKDF_SALT = new Uint8Array([ 68, 56, 3, 221, 154, 114, 192, 52, 29, 232, 219, 131, 100, 203, 67, 162, 37, 117, 48, 243, 112, 186, 160, 157, 222, 224, 41, 72, 38, 200, 124, 169, 163, 102, 7, 239, 237, 85, 83, 9, 101, 54, 173, 165, 61, 168, 167, 214, 200, 67, 128, 118, 124, 207, 215, 158, 77, 99, 198, 18, 161, 45, 156, 88 ])

const encrypt = (params) => {
  if (!(params && params.password && params.input)) throw new Error('invalid parameters')

  return sjcl.encrypt(params.password, params.input, { iter: 100000, ks: 256, salt: sjcl.random.randomWords(8, 0) })
}

const signer = (secretKey, body) => {
  const headers = {}
  const octets = stringify(body)

  headers.digest = 'SHA-256=' + crypto.createHash('sha256').update(octets).digest('base64')
  headers.signature = sign({ headers: headers, keyId: 'primary', secretKey: secretKey }, { algorithm: 'ed25519' })
  return { requestType: 'httpSignature', signedTx: { headers: headers, body: body, octets: octets } }
}

module.exports = {
/* { config       : { env            : 'prod'   }
   , passphrase1  : '...'
   , label        : '...'
   }
 */
  createKeychains:
    (options) => {
      const keypair = braveCrypto.deriveSigningKeysFromSeed(braveCrypto.getSeed(SEED_LENGTH), HKDF_SALT)
      const publicKey = braveCrypto.uint8ToHex(keypair.publicKey)
      const secretKey = braveCrypto.uint8ToHex(keypair.secretKey)

      return {
        userKey: {
          label: 'user',
          xpub: braveCrypto.uint8ToHex(keypair.publicKey),
          encryptedXprv: encrypt({ password: options.passphrase1, input: secretKey }),
          payload: signer(secretKey, { label: options.label, currency: 'BAT', publicKey: publicKey })
        }
      }
    },

/* { config       : { env            : 'prod'   }
   , unsignedTx   : { denomination   :
                      { amount       : '...'
                      , currency     : 'BAT'
                      }
                    , destination    : '...'
                    , message        : '...'
                    , id             : '...'
                    }
   , keychain     : { xpub           : '...'
                    , encryptedXprv  : '...'
                    }
   , passphrase   : '...'
   }
 */
  createSignedTx:
    (options, callback) => {
      const result = { config: options.config, signedTxs: [], authenticate: options.authenticate }
      let secretKey

      try {
        secretKey = sjcl.decrypt(options.passphrase, options.keychain.encryptedXprv)
      } catch (ex) { throw new Error('invalid passphrase') }

      options.unsignedTxs.forEach((unsignedTx) => {
        result.signedTxs.push(underscore.extend(underscore.pick(unsignedTx, [ 'id' ]),
                                                signer(secretKey,
                                                       underscore.pick(unsignedTx,
                                                                       [ 'denomination', 'destination', 'message' ]))))
      })
      callback(null, result, options)
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
