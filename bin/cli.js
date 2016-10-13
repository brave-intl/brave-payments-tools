#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var program = require('commander')
var prompt = require('prompt')
var title = path.basename(process.argv[1], '.js')
var tools = require(path.join(__dirname, '../index.js'))
var underscore = require('underscore')
var uuid = require('node-uuid')

process.title = title
program
  .version(require(path.join(__dirname, '../package.json')).version)
  .option('-f, --file <name>', 'the configuration file to use')
  .option('-l, --label <string>', 'the label to use')
  .option('-r, --send <name>', 'the recipients file to use')
  .option('-u, --user <email>', 'the BitGo account email-address')
  .option('-o, --otp <OTP>', 'the BitGo account one-time password')
  .parse(process.argv)

var schema = {
  username: { name: 'username', description: 'BitGo email-address', format: 'email' },
  password: { name: 'password', description: 'BitGo password', hidden: true },
  otp: { name: 'otp', description: 'BitGo OTP', pattern: /^[0-9][0-9][0-9][0-9][0-9][0-9][0-9]$/ }
}

switch (title) {
  case 'offline-create-keychains':
    prompt.start()
    prompt.get([ { name: 'passphrase1', description: 'User Keychain passphrase', hidden: true },
                 { name: 'passphrase2', description: 'Backup Keychain passphrase', hidden: true } ],
    function (err, result) {
      var config, file

      if (err) throw err

      config = tools.offline.createKeychains({
        config: { env: 'prod' || process.env.BITGO_ENV },
        label: program.label || uuid.v4().toLowerCase(),
        passphrase1: result.passphrase1,
        passphrase2: result.passphrase2
      })

      file = program.file ? program.file : ('keychain-' + program.label + '.json')
      fs.access(file, fs.F_OK, function (err) {
        if (!err) throw new Error('file exists: ' + file)

        fs.writeFile(file, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o444, flag: 'w' }, function (err) {
          if (err) throw err

          console.log('wrote ' + file)
        })
      })
    })
    break

  case 'online-create-wallet':
    if (!program.file) throw new Error('must specify -file keychain-....json')

    fs.readFile(program.file, { encoding: 'utf8', flag: 'r' }, function (err, data) {
      var config, label, file, prompts

      if (err) throw err

      config = JSON.parse(data)
      if (!config.label) {
        label = path.basename(program.file, '.json')
        if (label.indexOf('keychain-') === 0) label = label.substring(9)
        config.label = label
      }
      config.authenticate = {}

      file = path.basename(program.file, '.json')
      if (file.indexOf('keychain-') === 0) file = file.substring(9)
      file = 'wallet-' + file + '.json'
      fs.access(file, fs.F_OK, function (err) {
        if (!err) throw new Error('file exists: ' + file)

        prompt.start()
        prompts = []
        if (!program.user) prompts.push(schema.username)
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
              config.wallet = underscore.pick(wallet, [ 'id' ])
              config = underscore.pick(config, [ 'label', 'authenticate', 'wallet' ])

              fs.writeFile(file, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o444, flag: 'w' }, function (err) {
                if (err) throw err

                console.log('wrote ' + file)
              })
            })
          })
        })
      })
    })
    break

  case 'online-create-transaction':
    if (!program.file) throw new Error('must specify -file wallet-....json')
    if (!program.send) throw new Error('must specify -send recipients-....json')

    fs.readFile(program.file, { encoding: 'utf8', flag: 'r' }, function (err, data) {
      var config

      if (err) throw err

      config = JSON.parse(data)
      if (!(config.authenticate && config.authenticate.username)) {
        throw new Error('wallet file missing authentication username information')
      }
      if (!(config.wallet && config.wallet.id)) throw new Error('wallet file missing wallet identity information')

      fs.readFile(program.file, { encoding: 'utf8', flag: 'r' }, function (err, data) {
        var prompts, recipients

        if (err) throw err

        recipients = JSON.parse(data)

        prompts.push(schema.password)
        if (!program.otp) prompts.push(schema.otp)
        prompt.get(prompts, function (err, result) {
          if (err) throw err

          config.authenticate.password = result.password
          config.authenticate.otp = program.otp || result.otp
          tools.online.authenticate(config, function (err, options) {
            if (err) throw err

            options.recipients = recipients
            tools.online.createTx(options, function (err, unsignedTx) {
              var file

              if (err) throw err

              file = 'unsigned-' + (program.label || uuid.v4().toLowerCase()) + '.json'
              fs.writeFile(file, JSON.stringify(unsignedTx, null, 2), { encoding: 'utf8', mode: 0o444, flag: 'w' },
              function (err) {
                if (err) throw err

                console.log('wrote ' + file)
              })
            })
          })
        })
      })
    })
    break

  case 'offline-sign-transaction':
    break

  case 'online-submit-transaction':
    break

  default:
    break
}
