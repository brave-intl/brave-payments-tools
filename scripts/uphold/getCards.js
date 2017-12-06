#!/usr/bin/env node

/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true, esversion: 6 */

const UpholdSDK = require('@uphold/uphold-sdk-javascript')
const json2csv = require('json2csv')
const underscore = require('underscore')

let headers
let uphold

const generate = (startPage) => {
  const data = []

  const fetch = (pageno) => {
    uphold.getCards(pageno, 50, { headers: headers }).then((page) => {
      console.error('page ' + pageno)
      if (page.items.length === 0) return console.log(json2csv({ data: data }))

      page.items.forEach((item) => {
        data.push(underscore.extend(underscore.pick(item, [ 'id', 'currency', 'available', 'balance' ]),
                                    underscore.omit(item.address, [ 'wire' ])))
      })

      setTimeout(() => { fetch(pageno + 1) }, 5 * 1000)
    }).catch((err) => {
      console.log(json2csv({ data: data }))
      throw err
    })
  }

  startPage = parseInt(startPage, 10)
  fetch(isNaN(startPage) ? 1 : startPage)
}

switch (process.argv.length) {
  case 3:
  case 4:
    uphold = new UpholdSDK.default({ // eslint-disable-line new-cap
      baseUrl: 'https://api.uphold.com',
      clientId: '0000000000000000000000000000000000000000',
      clientSecret: '0000000000000000000000000000000000000000'
    })

    headers = {
      authorization: 'Basic ' + Buffer.from(process.argv[2] + ':X-OAuth-Basic').toString('base64')
    }
    return generate(process.argv[3])

  default:
    console.log('usage: ' + process.argv[0] + ' ' + process.argv[1] + ' <accessToken> [<startPage>]')
    process.exit(1)
}
