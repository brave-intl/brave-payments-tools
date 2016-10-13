#!/usr/bin/env node

var fs = require('fs')
var glob = require('glob')
var path = require('path')
var program = require('commander')
var prompt = require('prompt')
var title = path.basename(process.argv[1], '.js')
var tools = require(path.join(__dirname, '../index.js'))
var underscore = require('underscore')
var uuid = require('node-uuid')
var zxcvbn = require('zxcvbn')

process.title = title
program
  .version(require(path.join(__dirname, '../package.json')).version)
  .option('-l, --label <string>',
          'the label to use for the keychains/wallet/unsignedTx')
  .option('-k, --keychains <fileName>',
          'the keychain file to write(offline-create-keychains) or read(online-create-wallet/offline-sign-transaction)')
  .option('-w, --wallet <fileName>',
          'the wallet file to write(online-create-transaction)')
  .option('-r, --recipients <fileName>',
          'the recipients file to read(online-create-transaction)')
  .option('-u, --unsignedTx <fileName>',
          'the unsignedTx file to write(online-create-transaction) or read(offline-sign-transaction)')
  .option('-s, --signedTx <fileName>',
          'the signedTx file to write(offline-sign-transaction) or read(online-submit-transaction)')
  .option('-e, --user <emailAddress>',
          'the BitGo account email-address')
  .option('-o, --otp <oneTimePassword>',
          'the BitGo account one-time password')
  .parse(process.argv)

var conform = function (v) {
  var z = zxcvbn(v)

  return ((!z) || (z.guesses_log10 > 17))
}

var schema = {
  username: { name: 'username', description: 'BitGo email-address', format: 'email' },
  password: { name: 'password', description: 'BitGo password', hidden: true },
  otp: { name: 'otp', description: 'BitGo OTP', pattern: /^[0-9][0-9][0-9][0-9][0-9][0-9][0-9]$/ },
  passphrase1a: { name: 'passphrase1', description: 'User Keychain passphrase', hidden: true, conform: conform },
  passphrase1b: { name: 'passphrase1', description: 'User Keychain passphrase', hidden: true },
  passphrase2a: { name: 'passphrase2', description: 'Backup Keychain passphrase', hidden: true, conform: conform }
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

switch (title) {
  case 'offline-create-keychains':
    prompt.start()
    prompt.get([ schema.passphrase1a, schema.passphrase2a ], function (err, result) {
      var config, file

      if (err) throw err

      config = tools.offline.createKeychains({
        config: { env: process.env.BITGO_ENV || 'prod' },
        label: program.label || uuid.v4().toLowerCase(),
        passphrase1: result.passphrase1,
        passphrase2: result.passphrase2
      })

      file = program.keychains ? program.keychains : ('keychains-' + program.label + '.json')
      fs.access(file, fs.F_OK, function (err) {
        if (!err) throw new Error('file exists: ' + file)

        writeFile(file, config)
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
        if (label.indexOf('keychains-') === 0) label = label.substring(9)
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
        prompt.get(prompts, function (err, result) {
          if (err) throw err

          config.authenticate.username = program.user || result.username
          config.authenticate.password = result.password
          config.authenticate.otp = program.otp || result.otp
          tools.online.authenticate(config, function (err, options) {
            if (err) throw err

            tools.online.createWallet(options, function (err, wallet) {
              if (err) throw err

              config.authenticate = underscore.pick(config.authenticate, [ 'username' ])
              config.wallet = underscore.pick(wallet, [ 'id', 'type' ])
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
    if (!program.recipients) throw new Error('must specify --recipients ...')

    fs.readFile(program.wallet, { encoding: 'utf8', flag: 'r' }, function (err, data) {
      var config

      if (err) throw err

      config = JSON.parse(data)
      if (!(config.authenticate && config.authenticate.username)) {
        throw new Error('wallet file missing authentication username information')
      }
      if (!(config.wallet && config.wallet.id)) throw new Error('wallet file missing wallet identity information')

      fs.readFile(program.recipients, { encoding: 'utf8', flag: 'r' }, function (err, data) {
        var file

        if (err) throw err

        config.recipients = JSON.parse(data)

        file = program.unsignedTx || outFile(program.keychains, 'recipients-', 'unsigned-')
        fs.access(file, fs.F_OK, function (err) {
          var prompts

          if (!err) throw new Error('file exists: ' + file)

          prompt.start()
          prompts = []
          schema.password.description = config.authenticate.username + ' password'
          prompts.push(schema.password)
          if (!program.otp) prompts.push(schema.otp)
          prompt.get(prompts, function (err, result) {
            if (err) throw err

            config.authenticate.password = result.password
            config.authenticate.otp = program.otp || result.otp
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
            prompt.get([ schema.passphrase1 ], function (err, result) {
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
      if (!(config.authenticate && config.authenticate.username)) {
        throw new Error('wallet file missing authentication username information')
      }
      if (!config.walletId) throw new Error('signedTx file missing wallet identity information')

      file = program.submitTx || outFile(program.signedTx, 'signed-', 'submit-')
      fs.access(file, fs.F_OK, function (err) {
        var prompts

        if (!err) throw new Error('file exists: ' + file)

        prompt.start()
        prompts = []
        schema.password.description = config.authenticate.username + ' password'
        prompts.push(schema.password)
        if (!program.otp) prompts.push(schema.otp)
        prompt.get(prompts, function (err, result) {
          if (err) throw err

          config.authenticate.password = result.password
          config.authenticate.otp = program.otp || result.otp
          tools.online.authenticate(config, function (err, options) {
            if (err) throw err

            config.message = path.basename(outFile(file, 'submit-', ''), '.json')
            config.transaction = { tx: config.tx }
            config.wallet = { id: config.walletId, type: 'bitcoin' }
            tools.online.submitTx(options, function (err, result) {
              if (err) throw err

              writeFile(file, result)
            })
          })
        })
      })
    })
    break

  default:
    break
}
