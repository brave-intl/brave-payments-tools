#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const glob = require('glob')
const program = require('commander')
const prompt = require('prompt')
const secrets = require('secrets.js')
const tools = require(path.join(__dirname, './index.js'))
const underscore = require('underscore')
const uuid = require('uuid')
const zf = require('zero-fill')
const zxcvbn = require('zxcvbn')

process.on('unhandledRejection', (ex) => {
  console.log(ex.toString())
  if (ex.body) console.log(JSON.stringify(ex.body, null, 2))
  process.exit(0)
})

process.title = path.basename(process.argv[1], '.js')
program
  .version(require(path.join(__dirname, 'package.json')).version)
  .option('-a, --provider <string>',
          'the wallet provider, either "bitgo" or "uphold"')
  .option('-l, --label <string>',
          'the label to use for the keychains/wallet/unsignedTx')
  .option('-k, --keychains <fileName>',
          'the keychain file to write(offline-create-keychains) or read(online-create-wallet/offline-sign-transaction)')
  .option('-w, --wallet <fileName>',
          'the wallet file to write(online-create-transaction)')
  .option('-p, --payments <fileName>',
          'the payments file to read(online-create-transaction)')
  .option('-u, --unsignedTx <fileName>',
          'the unsignedTx file to write(online-create-transaction) or read(offline-sign-transaction)')
  .option('-s, --signedTx <fileName>',
          'the signedTx file to write(offline-sign-transaction) or read(online-submit-transaction)')
  .option('-z, --secrets <fileName>',
          'the secrets file to be split into recovery-files')
  .option('-e, --user <emailAddress>',
          'the BitGo account email-address')
  .option('-o, --otp <oneTimePassword>',
          'the one-time password')
  .option('-m, --min <number>',
          'the minimum number of shares for recovery (offline-create-keychains)')
  .option('-n, --max <number>',
          'the total number of shares for recovery (offline-create-keychains)')
  .parse(process.argv)
if (!program.provider) program.provider = 'uphold'

const deepclone = (object) => {
  const clone = underscore.clone(object)

  underscore.each(clone, (value, key) => { if (underscore.isObject(value)) clone[key] = deepclone(value) })

  return clone
}

const strong = (v) => {
  const z = zxcvbn(v)

  return ((!z) || (z.guesses_log10 > 17))
}

const schema = {
  accessToken: {
    name: 'accessToken', description: 'Application access-token', hidden: true, pattern: /^[0-9a-f]{64}|[0-9a-f]{40}$/
  },
  username: { name: 'username', description: 'BitGo email-address', format: 'email' },
  password: { name: 'password', description: 'BitGo password', hidden: true },
  otp: { name: 'otp', description: 'OTP', pattern: /^[0-9]{6,8}$/ },
  enterpriseId: { name: 'enterpriseId', description: 'Wallet enterpriseId', pattern: /^[0-9a-f]{32}$/ },
  passphrase1a: { name: 'passphrase1', description: 'User Keychain passphrase', hidden: true, conform: strong },
  passphrase1b: { name: 'passphrase1', description: 'User Keychain passphrase', hidden: true },
  passphrase2a: { name: 'passphrase2', description: 'Backup Keychain passphrase', hidden: true, conform: strong },
  cardId: {
    name: 'cardId',
    description: 'Wallet-identifier',
    pattern: /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i
  }
}

const update = (params, result) => {
  if (params.username) {
    params.password = result.password
    params.otp = program.otp || result.otp
  } else {
    params.accessToken = result.accessToken
    if (program.provider === 'uphold') params.otp = program.otp || result.otp
  }
  if ((!(params.password && params.otp)) && (!params.accessToken)) {
    throw new Error('missing credentials')
  }

  return params
}

const numbion = (s, d) => {
  const i = parseInt(s, 10)

  return (isNaN(i) ? d : i)
}

const outFile = (infile, infix, outfix) => {
  let file = path.basename(infile, '.json')

  if (file.indexOf(infix) === 0) file = file.substring(infix.length)
  return (outfix + file + '.json')
}

const writeFile = (file, data, next) => {
  fs.writeFile(file, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o444, flag: 'w' }, (err) => {
    if (err) throw err

    console.log('wrote ' + file)
    if (next) next()
  })
}

const provider = tools[program.provider]

if (!provider) throw new Error('invalid provider: ' + provider)

let env = program.provider.toUpperCase()
env = process.env[env + '_ENV'] || process.env[env + '_ENVIRONMENT'] || 'prod'
if (env === 'sandbox') env = 'test'
if (env === 'production') env = 'prod'

switch (process.title) {
  case 'offline-create-keychains':
    const prompts = []

    prompt.start()
    prompts.push(schema.passphrase1a)
    if (program.provider === 'bitgo') prompts.push(schema.passphrase2a)
    prompt.get(prompts, (err, result) => {
      const recovery = {}
      let config, file, label, max, min

      if (err) throw err

      if ((program.provider !== 'bitgo') ? (!result.passphrase1)
          : ((!(result.passphrase1 && result.passphrase2)) || (result.passphrase1 === result.passphrase2))) {
        throw new Error('invalid passphrase' + (program.provider !== 'bitgo' ? '' : 's'))
      }

      label = program.label || uuid.v4().toLowerCase()
      config = provider.offline.createKeychains({
        config: { env: env },
        label: label,
        passphrase1: result.passphrase1,
        passphrase2: result.passphrase2
      })

      min = numbion(program.min, 2)
      max = numbion(program.max, 3)
      if (max < 2) max = 2
      if (min > max) min = max
      recovery.userKey = { hex: secrets.str2hex(result.passphrase1) }
      recovery.userKey.shares = secrets.share(recovery.userKey.hex, max, min)
      if (result.passphrase2) {
        recovery.backupKey = { hex: secrets.str2hex(result.passphrase2) }
        recovery.backupKey.shares = secrets.share(recovery.backupKey.hex, max, min)
      }

      file = program.keychains || ('keychains-' + label + '.json')
      fs.access(file, fs.F_OK, (err) => {
        let i, scratchpad

        if (!err) throw new Error('file exists: ' + file)

        config.config = { env: env }
        writeFile(file, config)

        for (i = 0; i < max; i++) {
          scratchpad = deepclone(config)
          scratchpad.userKey['share_' + i] = recovery.userKey.shares[i]
          if (recovery.backupKey) scratchpad.backupKey['share_' + i] = recovery.backupKey.shares[i]
          writeFile('recovery_' + i + '_' + min + '_' + max + '-' + label + '.json', scratchpad)
        }
      })
    })
    break

  case 'online-create-wallet':
    if (!program.keychains) throw new Error('must specify --keychains ...')

    fs.readFile(program.keychains, { encoding: 'utf8', flag: 'r' }, (err, data) => {
      let config, label, file

      if (err) throw err

      config = JSON.parse(data)
      if (!config.label) {
        label = path.basename(program.keychains, '.json')
        if (label.indexOf('keychains-') === 0) label = label.substring(10)
        config.label = label
      }
      config.authenticate = {}

      file = program.wallet || outFile(program.keychains, 'keychains-', 'wallet-')
      fs.access(file, fs.F_OK, (err) => {
        const prompts = []

        if (!err) throw new Error('file exists: ' + file)

        prompt.start()
        if (program.provider === 'bitgo') {
          if (program.user) schema.password.description = program.user + ' password'
          else prompts.push(schema.username)
          prompts.push(schema.password)
          prompts.push(schema.enterpriseId)
        }
//      if (!program.otp) prompts.push(schema.otp)
        prompts.push(schema.accessToken)
        prompt.get(prompts, (err, result) => {
          if (err) throw err

          config.authenticate.username = program.user || result.username
          config.authenticate = update(config.authenticate, underscore.omit(result, [ 'enterpriseId' ]))
          if (result.enterpriseId) config.enterpriseId = result.enterpriseId
          provider.online.authenticate(config, (err, options) => {
            if (err) throw err

            provider.online.createWallet(options, (err, wallet) => {
              if (err) throw err

              config.authenticate = underscore.pick(config.authenticate, [ 'username' ])
              config.wallet = underscore.pick(wallet, [ 'id', 'label', 'currency' ])
              config = underscore.pick(config, [ 'config', 'label', 'authenticate', 'wallet' ])
              writeFile(file, config)
            })
          })
        })
      })
    })
    break

  case 'online-create-transaction':
    if (!program.wallet) throw new Error('must specify --wallet ...')
    if (!program.payments) throw new Error('must specify --payments ...')

    fs.readFile(program.wallet, { encoding: 'utf8', flag: 'r' }, (err, data) => {
      let config

      if (err) throw err

      config = JSON.parse(data)
      if (!config.authenticate) throw new Error('wallet file missing authentication username information')
      if (!(config.wallet && config.wallet.id)) throw new Error('wallet file missing wallet identity information')

      fs.readFile(program.payments, { encoding: 'utf8', flag: 'r' }, (err, data) => {
        let details, file

        if (err) throw err

        details = JSON.parse(data)
        config.recipients = {}
        details.forEach((entry) => { config.recipients[entry.address] = entry.probi || entry.satoshis })

        file = program.unsignedTx || outFile(program.payments, 'payments-', 'unsigned-')
        fs.access(file, fs.F_OK, (err) => {
          const prompts = []

          if (!err) throw new Error('file exists: ' + file)

          prompt.start()
          if (config.authenticate.username) {
            schema.password.description = config.authenticate.username + ' password'
            prompts.push(schema.password)
            if (!program.otp) prompts.push(schema.otp)
          } else {
//          if ((program.provider !== 'bitgo') && (!program.otp)) prompts.push(schema.otp)
            prompts.push(schema.accessToken)
          }
          prompt.get(prompts, (err, result) => {
            if (err) throw err

            config.authenticate = update(config.authenticate, result)
            provider.online.authenticate(config, (err, options) => {
              if (err) throw err

              if (program.provider !== 'bitgo') options.message = details[0].transactionId
              provider.online.createTx(options, (err, unsignedTx) => {
                if (err) throw err

                unsignedTx.authenticate = underscore.pick(config.authenticate, [ 'username' ])
                writeFile(file, unsignedTx)
              })
            })
          })
        })
      })
    })
    break

  case 'offline-sign-transaction':
    if (!program.unsignedTx) throw new Error('must specify --unsignedTx ...')

    fs.readFile(program.unsignedTx, { encoding: 'utf8', flag: 'r' }, (err, data) => {
      let config, files, unsignedTx

      if (err) throw err

      config = JSON.parse(data)
      if (program.provider === 'bitgo') {
        unsignedTx = config
        if (!(unsignedTx.transactionHex && unsignedTx.unspents && unsignedTx.walletId && unsignedTx.walletKeychains)) {
          throw new Error('unsignedTx file missing transaction information')
        }
        config = { unsignedTx: unsignedTx }
      } else {
        if (!Array.isArray(config.unsignedTxs)) throw new Error('unsignedTxs file missing transaction information')

        config.unsignedTxs.forEach((tx) => {
          if (!(tx.denomination && tx.denomination.amount && tx.denomination.currency && tx.destination && tx.id && tx.label)) {
            throw new Error('unsignedTx file missing transaction information')
          }

          if (!unsignedTx) {
            unsignedTx = tx
            return
          }

          if ((unsignedTx.id !== tx.id) || (unsignedTx.label !== tx.label)) {
            throw new Error('unsignedTx file contains inconsistent transaction information')
          }
        })
        if (!unsignedTx) throw new Error('unsignedTx file doesn\'t contain any transactions')
      }

      files = program.keychains ? [ program.keychains ] : glob.sync('keychains-*.json')
      if (files.length === 0) throw new Error('must specify --keychains ...')

      files.forEach((file) => {
        fs.readFile(file, { encoding: 'utf8', flag: 'r' }, (err, data) => {
          let keychain

          if (err) throw err

          keychain = JSON.parse(data)
          if (!(keychain.userKey && keychain.userKey.encryptedXprv)) throw new Error(file + ' missing userKey information')

          if (program.provider === 'bitgo') {
            if (!underscore.find(unsignedTx.walletKeychains,
                                 (entry) => { return (entry.xpub === keychain.userKey.xpub) })) return
          } else if (unsignedTx.label !== keychain.userKey.payload.signedTx.body.label) return

          config.keychain = keychain.userKey

          file = program.signedTx || outFile(program.unsignedTx, 'unsigned-', 'signed-')
          fs.access(file, fs.F_OK, (err) => {
            if (!err) throw new Error('file exists: ' + file)

            prompt.start()
            prompt.get([ schema.passphrase1b ], (err, result) => {
              if (err) throw err

              config.passphrase = result.passphrase1
              provider.offline.createSignedTx(config, (err, signedTx) => {
                if (err) throw err

                if (program.provider === 'bitgo') {
                  underscore.extend(signedTx, underscore.pick(unsignedTx, [ 'walletId', 'authenticate' ]))
                }
                writeFile(file, signedTx)
              })
            })
          })
        })
      })
    })
    break

  case 'online-submit-transaction':
    if (!program.signedTx) throw new Error('must specify --signedTx ...')

    fs.readFile(program.signedTx, { encoding: 'utf8', flag: 'r' }, (err, data) => {
      let config, details, file, payments, submit

      if (err) throw err

      config = JSON.parse(data)
      if (!config.authenticate) throw new Error('wallet file missing authentication information')

      if (program.provider === 'bitgo') {
        if (!config.walletId) throw new Error('signedTx file missing wallet identity information')
      } else {
        if (!Array.isArray(config.signedTxs)) throw new Error('signedTx file missing transaction information')

        config.signedTxs.forEach((tx) => {
          if (!(tx.id && tx.requestType && tx.signedTx)) {
            throw new Error('unsignedTx file missing transaction information')
          }
        })

        submit = []
        payments = program.payments
        if (!payments) {
          payments = outFile(program.signedTx, 'signed-', 'payments-')
          try { fs.accessSync(payments, fs.F_OK) } catch (ex) {
            payments = outFile(program.signedTx, 'signed-', '')
          }
        }
        data = fs.readFileSync(payments)
        details = JSON.parse(data)
        if (!Array.isArray(config.signedTxs)) throw new Error('payments file missing transactions')
      }

      file = program.submitTx || outFile(program.signedTx, 'signed-', 'submit-')
      fs.access(file, fs.F_OK, (err) => {
        const prompts = []

        if (!err) throw new Error('file exists: ' + file)

        prompt.start()
        if (config.authenticate.username) {
          schema.password.description = config.authenticate.username + ' password'
          prompts.push(schema.password)
          if (!program.otp) prompts.push(schema.otp)
        } else {
//        if ((program.provider !== 'bitgo') && (!program.otp)) prompts.push(schema.otp)
          prompts.push(schema.accessToken)
        }
        prompt.get(prompts, (err, result) => {
          if (err) throw err

          config.authenticate = update(config.authenticate, result)
          provider.online.authenticate(config, (err, options) => {
            const width = Math.floor(Math.log10(config.length)) + 1

            const each = (offset) => {
              let parts, target, tx

              if (typeof offset !== 'undefined') {
                parts = path.parse(file)
                target = path.join(parts.dir, parts.name + '-' + zf(width, offset) + parts.ext)
                tx = underscore.extend(config.signedTxs[offset], underscore.omit(config, [ 'signedTxs' ]))
              } else {
                target = file
                tx = config
              }

              const finalize = (err) => {
                if ((submit) && (submit.length > 0)) return writeFile(file, submit, () => { console.log('done.') })

                if (err) throw err
              }

              provider.online.submitTx(underscore.extend(tx, options), (err, result) => {
                if (err) return finalize(err)

                if (program.provider === 'bitgo') underscore.extend(result, underscore.pick(config, [ 'walletId', 'message' ]))
                writeFile(target, result, () => {
                  if (typeof offset === 'undefined') return

                  submit.push(underscore.extend(details[offset], result))
                  if (++offset < config.signedTxs.length) return each(offset)

                  finalize()
                })
              })
            }

            if (err) throw err

            options.message = path.basename(outFile(file, 'submit-', ''), '.json')
            each(Array.isArray(config.signedTxs) ? 0 : undefined)
          })
        })
      })
    })
    break

  case 'offline-split-passphrases':
    if (!program.secrets) throw new Error('must specify --secrets ...')

    fs.readFile(program.secrets, { encoding: 'binary', flag: 'r' }, (err, data) => {
      let i, label, min, max, scratchpad, shares

      if (err) throw err

      label = program.label || uuid.v4().toLowerCase()
      min = numbion(program.min, 2)
      max = numbion(program.max, 3)
      if (max < 2) max = 2
      if (min > max) min = max
      shares = secrets.share(secrets.str2hex(data), max, min)

      for (i = 0; i < max; i++) {
        scratchpad = { secrets: {} }
        scratchpad.secrets['share_' + i] = shares[i]
        writeFile('recovery_' + i + '_' + min + '_' + max + '-' + label + '.json', scratchpad)
      }
    })
    break

  case 'offline-recover-passphrases':
    const recovery = {}

    program.args.forEach((file) => {
      const config = JSON.parse(fs.readFileSync(file, { encoding: 'utf8', flag: 'r' }))

      delete config.config
      underscore.keys(config).forEach((type) => {
        const info = config[type]

        if (!recovery[type]) recovery[type] = {}
        if (!recovery[type][info.xpub]) recovery[type][info.xpub] = []
        underscore.keys(info).forEach((k) => {
          if (k.indexOf('share_') !== -1) recovery[type][info.xpub].push(info[k])
        })
      })
    })
    underscore.keys(recovery).forEach((type) => {
      underscore.keys(recovery[type]).forEach((xpub) => {
        const combo = secrets.combine(recovery[type][xpub])
        const data = combo && secrets.hex2str(combo)

        if (!combo) throw new Error('insufficient shards for ' + type + '.' + xpub)

        if (xpub !== 'undefined') return console.log(type + '.' + xpub + ' ' + data)

        if (process.stdout.isTTY) return process.stdout.write(data)

        process.stdout.write(data, 'binary')
      })
    })
    break

  default:
    console.log('usage: command [options]')
    console.log('  offline-create-keychains [--label string] [--min m] [--max n] [--keychains output-file]')
    console.log('  online-create-wallet --keychains input-file [--wallet output-file] authopts...')
    console.log('  online-create-transaction --wallet input-file --payments input-file [--unsignedTx output-file] authopts...')
    console.log('  offline-sign-transaction --unsignedTx input-file [--signedTx output-file] [--keychains input-file]')
    console.log('  online-submit-transaction --signedTx input-file [--submitTx output-file] authopts...')
    console.log('  offline-recover-passphrases files...')
    console.log('')
    console.log('authopts: --user email-address [--otp one-time-password]')
    console.log('  for bitgo: if --user is used on wallet creation, then password and OTP are required for subsequent')
    console.log('  operations; otherwise, access-token is prompted')
    console.log('  for uphold, both the one-time-password and access-token are required')
    break
}
