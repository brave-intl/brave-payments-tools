#!/usr/bin/env node

var fs = require('fs')
var glob = require('glob')
var path = require('path')
var program = require('commander')
var prompt = require('prompt')
var secrets = require('secrets.js')
var tools = require(path.join(__dirname, './index.js'))
var underscore = require('underscore')
var uuid = require('node-uuid')
var zxcvbn = require('zxcvbn')

process.title = path.basename(process.argv[1], '.js')
program
  .version(require(path.join(__dirname, 'package.json')).version)
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
  .option('-e, --user <emailAddress>',
          'the BitGo account email-address')
  .option('-o, --otp <oneTimePassword>',
          'the BitGo account one-time password')
  .option('-m, --min <number>',
          'the minimum number of shares for recovery (offline-create-keychains)')
  .option('-n, --max <number>',
          'the total number of shares for recovery (offline-create-keychains)')
  .parse(process.argv)

var deepclone = function (object) {
  var clone = underscore.clone(object)

  underscore.each(clone, function (value, key) { if (underscore.isObject(value)) clone[key] = deepclone(value) })

  return clone
}

var strong = function (v) {
  var z = zxcvbn(v)

  return ((!z) || (z.guesses_log10 > 17))
}

var schema = {
  accesstoken: { name: 'accesstoken', description: 'BitGo access-token', pattern: /^[0-9a-f]{64}$/ },
  username: { name: 'username', description: 'BitGo email-address', format: 'email' },
  password: { name: 'password', description: 'BitGo password', hidden: true },
  otp: { name: 'otp', description: 'BitGo OTP', pattern: /^[0-9][0-9][0-9][0-9][0-9][0-9]([0-9]?)$/ },
  enterpriseId: { name: 'enterpriseId', description: 'Wallet enterpriseId', pattern: /^[0-9a-f]{32}$/ },
  passphrase1a: { name: 'passphrase1', description: 'User Keychain passphrase', hidden: true, conform: strong },
  passphrase1b: { name: 'passphrase1', description: 'User Keychain passphrase', hidden: true },
  passphrase2a: { name: 'passphrase2', description: 'Backup Keychain passphrase', hidden: true, conform: strong }
}

var update = function (params, result) {
  if (params.username) {
    params.password = result.password
    params.otp = program.otp || result.otp
  } else {
    params.accessToken = result.accesstoken
  }
  if ((!(params.password && params.otp)) && (!params.accessToken)) {
    throw new Error('missing credentials')
  }

  return params
}

var outFile = function (infile, infix, outfix) {
  var file = path.basename(infile, '.json')

  if (file.indexOf(infix) === 0) file = file.substring(infix.length)
  return (outfix + file + '.json')
}

var writeFile = function (file, data) {
  fs.writeFile(file, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o444, flag: 'w' }, function (err) {
    if (err) throw err

    console.log('wrote ' + file)
  })
}

switch (process.title) {
  case 'offline-create-keychains':
    prompt.start()
    prompt.get([ schema.passphrase1a, schema.passphrase2a ], function (err, result) {
      var config, file, label, max, min, recovery

      if (err) throw err

      if ((!(result.passphrase1 && result.passphrase2)) || (result.passphrase1 === result.passphrase2)) {
        throw new Error('invalid passphrases')
      }

      label = program.label || uuid.v4().toLowerCase()
      config = tools.offline.createKeychains({
        config: { env: process.env.BITGO_ENV || 'prod' },
        label: label,
        passphrase1: result.passphrase1,
        passphrase2: result.passphrase2
      })

      min = Number.isInteger(program.min) ? program.min : 2
      max = Number.isInteger(program.max) ? program.max : 3
      if (max < 2) max = 2
      if (min > max) min = max
      recovery = { userKey: { hex: secrets.str2hex(result.passphrase1) },
                   backupKey: { hex: secrets.str2hex(result.passphrase2) }
                 }
      recovery.userKey.shares = secrets.share(recovery.userKey.hex, max, min)
      recovery.backupKey.shares = secrets.share(recovery.backupKey.hex, max, min)

      file = program.keychains || ('keychains-' + label + '.json')
      fs.access(file, fs.F_OK, function (err) {
        var i, scratchpad

        if (!err) throw new Error('file exists: ' + file)

        writeFile(file, config)

        for (i = 0; i < max; i++) {
          scratchpad = deepclone(config)
          scratchpad.userKey['share_' + i] = recovery.userKey.shares[i]
          scratchpad.backupKey['share_' + i] = recovery.backupKey.shares[i]
          writeFile('recovery_' + i + '_' + min + '_' + max + '-' + label + '.json', scratchpad)
        }
      })
    })
    break

  case 'online-create-wallet':
    if (!program.keychains) throw new Error('must specify --keychains ...')

    fs.readFile(program.keychains, { encoding: 'utf8', flag: 'r' }, function (err, data) {
      var config, label, file

      if (err) throw err

      config = JSON.parse(data)
      if (!config.label) {
        label = path.basename(program.keychains, '.json')
        if (label.indexOf('keychains-') === 0) label = label.substring(10)
        config.label = label
      }
      config.authenticate = {}

      file = program.wallet || outFile(program.keychains, 'keychains-', 'wallet-')
      fs.access(file, fs.F_OK, function (err) {
        var prompts

        if (!err) throw new Error('file exists: ' + file)

        prompt.start()
        prompts = []
        if (program.user) schema.password.description = program.user + ' password'
        else {
          prompts.push(schema.username)
          schema.password.description = 'BitGo password'
        }
        prompts.push(schema.password)
        if (!program.otp) prompts.push(schema.otp)
        prompts.push(schema.accesstoken)
        prompts.push(schema.enterpriseId)
        prompt.get(prompts, function (err, result) {
          if (err) throw err

          config.authenticate.username = program.user || result.username
          config.authenticate = update(config.authenticate, underscore.omit(result, [ 'enterpriseId' ]))
          if (result.enterpriseId) config.enterpriseId = result.enterpriseId
          tools.online.authenticate(config, function (err, options) {
            if (err) throw err

            tools.online.createWallet(options, function (err, wallet) {
              if (err) throw err

              config.authenticate = underscore.pick(config.authenticate, [ 'username' ])
              config.wallet = underscore.pick(wallet, [ 'id' ])
              config = underscore.pick(config, [ 'label', 'authenticate', 'wallet' ])
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

    fs.readFile(program.wallet, { encoding: 'utf8', flag: 'r' }, function (err, data) {
      var config

      if (err) throw err

      config = JSON.parse(data)
      if (!config.authenticate) throw new Error('wallet file missing authentication username information')
      if (!(config.wallet && config.wallet.id)) throw new Error('wallet file missing wallet identity information')

      fs.readFile(program.payments, { encoding: 'utf8', flag: 'r' }, function (err, data) {
        var file

        if (err) throw err

        config.recipients = JSON.parse(data)

        file = program.unsignedTx || outFile(program.payments, 'payments-', 'unsigned-')
        fs.access(file, fs.F_OK, function (err) {
          var prompts

          if (!err) throw new Error('file exists: ' + file)

          prompt.start()
          prompts = []
          if (config.authenticate.username) {
            schema.password.description = config.authenticate.username + ' password'
            prompts.push(schema.password)
            if (!program.otp) prompts.push(schema.otp)
          } else {
            prompts.push(schema.accesstoken)
          }
          prompt.get(prompts, function (err, result) {
            if (err) throw err

            config.authenticate = update(config.authenticate, result)
            tools.online.authenticate(config, function (err, options) {
              if (err) throw err

              tools.online.createTx(options, function (err, unsignedTx) {
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

    fs.readFile(program.unsignedTx, { encoding: 'utf8', flag: 'r' }, function (err, data) {
      var config, files, unsignedTx

      if (err) throw err

      unsignedTx = JSON.parse(data)
      if (!(unsignedTx.transactionHex && unsignedTx.unspents && unsignedTx.walletId && unsignedTx.walletKeychains)) {
        throw new Error('unsignedTx file missing transaction information')
      }
      config = underscore.extend({ env: process.env.BITGO_ENV || 'prod' }, { unsignedTx: unsignedTx })

      files = program.keychains ? [ program.keychains ] : glob.sync('keychains-*.json')
      if (files.length === 0) throw new Error('must specify --keychains ...')

      files.forEach(function (file) {
        fs.readFile(file, { encoding: 'utf8', flag: 'r' }, function (err, data) {
          var keychain

          if (err) throw err

          keychain = JSON.parse(data)
          if (!(keychain.userKey && keychain.userKey.encryptedXprv)) throw new Error(file + ' missing userKey information')

          if (!underscore.find(unsignedTx.walletKeychains,
                               function (entry) { return (entry.xpub === keychain.userKey.xpub) })) return

          config.keychain = keychain.userKey

          file = program.signedTx || outFile(program.unsignedTx, 'unsigned-', 'signed-')
          fs.access(file, fs.F_OK, function (err) {
            if (!err) throw new Error('file exists: ' + file)

            prompt.start()
            prompt.get([ schema.passphrase1b ], function (err, result) {
              if (err) throw err

              config.passphrase = result.passphrase1
              tools.offline.createSignedTx(config, function (err, signedTx) {
                if (err) throw err

                signedTx.walletId = unsignedTx.walletId
                signedTx.authenticate = unsignedTx.authenticate
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

    fs.readFile(program.signedTx, { encoding: 'utf8', flag: 'r' }, function (err, data) {
      var config, file

      if (err) throw err

      config = JSON.parse(data)
      if (!config.authenticate) throw new Error('wallet file missing authentication username information')
      if (!config.walletId) throw new Error('signedTx file missing wallet identity information')

      file = program.submitTx || outFile(program.signedTx, 'signed-', 'submit-')
      fs.access(file, fs.F_OK, function (err) {
        var prompts

        if (!err) throw new Error('file exists: ' + file)

        prompt.start()
        prompts = []
        if (config.authenticate.username) {
          schema.password.description = config.authenticate.username + ' password'
          prompts.push(schema.password)
          if (!program.otp) prompts.push(schema.otp)
        } else {
          prompts.push(schema.accesstoken)
        }
        prompt.get(prompts, function (err, result) {
          if (err) throw err

          config.authenticate = update(config.authenticate, result)
          tools.online.authenticate(config, function (err, options) {
            if (err) throw err

            config.message = path.basename(outFile(file, 'submit-', ''), '.json')
            config.transaction = { tx: config.tx }
            config.wallet = { id: config.walletId, type: 'bitcoin' }
            tools.online.submitTx(options, function (err, result) {
              if (err) throw err

              result.walletId = config.walletId
              result.message = config.message
              writeFile(file, result)
            })
          })
        })
      })
    })
    break

  case 'offline-recover-passphrases':
    var recovery = {}

    program.args.forEach(function (file) {
      var config = JSON.parse(fs.readFileSync(file, { encoding: 'utf8', flag: 'r' }))

      underscore.keys(config).forEach(function (type) {
        var info = config[type]

        if (!recovery[type]) recovery[type] = {}
        if (!recovery[type][info.xpub]) recovery[type][info.xpub] = []
        underscore.keys(info).forEach(function (k) {
          if (k.indexOf('share_') !== -1) recovery[type][info.xpub].push(info[k])
        })
      })
    })
    underscore.keys(recovery).forEach(function (type) {
      underscore.keys(recovery[type]).forEach(function (xpub) {
        var combo = secrets.combine(recovery[type][xpub])

        if (!combo) throw new Error('insufficient shards for ' + type + '.' + xpub)
        console.log(type + '.' + xpub + ' ' + secrets.hex2str(combo))
      })
    })
    break

  default:
    console.log('usage: command [options]')
    console.log('  offline-create-keychains [--label string] [--min m] [--max n] [--keychains output-file]')
    console.log('  online-create-wallet --keychains input-file [--wallet output-file] authopts...')
    console.log('  online-create-transaction --wallet input-file --payments input-file [--unsignedTx output-file] authopts...')
    console.log('  offline-sign-transaction --unsignedTx input-file [--signedTx output-file] [--keychains input-file]')
    console.log('  online-submit-transaction --signedTx output-file authopts...')
    console.log('')
    console.log('authopts: --user email-address [--otp one-time-password]')
    console.log('  if --user is used on wallet creation, then password and OTP are required for subsequent operations')
    console.log('  otherwise, access-token is prompted')
    break
}
