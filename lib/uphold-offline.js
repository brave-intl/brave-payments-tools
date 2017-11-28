const crypto = require('crypto')

const BitGoJS = require('bitgo')
const sign = require('http-request-signature').sign
const sjcl = BitGoJS.sjcl
const stringify = require('json-stable-stringify')
const underscore = require('underscore')

const braveCrypto = require('brave-crypto')

// taken from bat-client:index.js
const SEED_LENGTH = 32
const HKDF_SALT = new Uint8Array([ 68, 56, 3, 221, 154, 114, 192, 52, 29, 232, 219, 131, 100, 203, 67, 162, 37, 117, 48, 243, 112, 186, 160, 157, 222, 224, 41, 72, 38, 200, 124, 169, 163, 102, 7, 239, 237, 85, 83, 9, 101, 54, 173, 165, 61, 168, 167, 214, 200, 67, 128, 118, 124, 207, 215, 158, 77, 99, 198, 18, 161, 45, 156, 88, 184, 59, 25, 243, 118, 10, 202, 210, 226, 44, 208, 189, 67, 9, 5, 235, 75, 232, 152, 219, 189, 223, 252, 206, 15, 30, 102, 116, 167, 130, 216, 151, 255, 68, 39, 116, 224, 15, 41, 129, 55, 203, 123, 4, 72, 131, 168, 112, 7, 213, 154, 109, 130, 210, 39, 242, 195, 125, 239, 187, 191, 187, 15, 83, 178, 249, 148, 139, 203, 234, 46, 135, 179, 24, 134, 169, 20, 164, 55, 121, 62, 250, 223, 183, 37, 67, 189, 162, 77, 237, 101, 202, 100, 95, 234, 10, 10, 137, 20, 227, 205, 215, 161, 192, 176, 12, 16, 76, 171, 38, 193, 176, 222, 142, 107, 138, 230, 217, 237, 203, 209, 255, 46, 254, 93, 43, 161, 214, 48, 224, 134, 144, 163, 225, 30, 68, 180, 22, 97, 3, 249, 170, 172, 145, 237, 101, 40, 97, 7, 218, 26, 10, 37, 180, 210, 215, 241, 230, 51, 65, 30, 7, 111, 11, 192, 40, 233, 49, 190, 89, 239, 129, 253, 65, 118, 104, 223, 68, 249, 222, 124, 145, 106, 227, 57, 90, 168, 171, 65, 208, 1, 185 ])

const encrypt = (params) => {
  if (!(params && params.password && params.input)) throw new Error('invalid parameters')

  return sjcl.encrypt(params.password, params.input, { iter: 100000, ks: 256, salt: sjcl.random.randomWords(2, 0) })
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
      const bitgo = new BitGoJS.BitGo(options.config || { env: 'prod' })
      const result = { config: options.config, signedTxs: [], authenticate: options.authenticate }
      let secretKey

      try {
        secretKey = bitgo.decrypt({ password: options.passphrase, input: options.keychain.encryptedXprv })
      } catch (ex) { throw new Error('invalid passphrase') }

      options.unsignedTxs.forEach((unsignedTx) => {
        result.signedTxs.push(underscore.extend(underscore.pick(unsignedTx, [ 'id' ]),
                                                signer(secretKey,
                                                       underscore.pick(unsignedTx,
                                                                       [ 'denomination', 'destination', 'message' ]))))
      })
      callback(null, result, options)
    }
}
