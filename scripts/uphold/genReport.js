#!/usr/bin/env node

/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true, esversion: 6 */

const BigNumber = require('bignumber.js')
const UpholdSDK = require('@uphold/uphold-sdk-javascript')
const json2csv = require('json2csv')
const moment = require('moment')

let headers
let uphold

const pass1 = (cardId, startDate) => {
  let data = []
  let start

  const fetch = (pageno) => {
    uphold.getCardTransactions(cardId, pageno, 50, { headers: headers }).then((page) => {
      console.error('page ' + pageno)
      if (page.items.length === 0) return pass2(data, start)

      page.items.forEach((item) => {
        const timestamp = item.createdAt.slice(0, -5) + '+00:00'
        const transaction = item.origin.CardId === cardId ? item.origin : item.destination
        let datum, fee, normalized, pair

        if (item.status !== 'completed') return

        item.normalized.forEach((entry) => {
          if ((!normalized) && (entry.currency === 'USD')) normalized = entry
        })
        if (!normalized) normalized = item.normalized[0]

        pair = item.origin.currency !== item.destination.currency
          ? (item.origin.currency + item.destination.currency) : (item.origin.currency + normalized.currency)
        transaction.amount = new BigNumber(transaction.amount)
        normalized.amount = parseFloat(normalized.amount)
        if (item.origin.CardId === cardId) {
          transaction.amount = transaction.amount.negated()
          normalized.amount = -normalized.amount
        }
        fee = parseFloat(normalized.commission) + parseFloat(normalized.fee)
        if (fee === 0) fee = ''
        datum = {
          'Confirm Date': timestamp,
          'Create Date': timestamp,
          TXID: item.id,
          Amount: transaction.amount.toString(),
          Fee: fee,
          Total: transaction.base,
          Balance: '',
          ToAddress: item.destination.CardId,
          Description: item.message,
          Comment: ''
        }
        datum['Balance in'] = normalized.currency
        datum.pair = pair
        datum[pair] = normalized.rate
        datum[normalized.currency] = normalized.amount
        data.push(datum)
      })

      fetch(pageno + 1)
    }).catch((err) => {
      throw err
    })
  }

  try {
    start = new moment(startDate, 'YYYY-MM-DD') // eslint-disable-line new-cap
  } catch (ex) {}

  if (!start) {
    console.log('invalid starting date: ' + startDate)
    process.exit(1)
  }

  fetch(1)
}

const pass2 = (data, start) => {
  const currencies = []
  const fields = []
  const pairs = []
  const results = []
  const stop = new moment(start).startOf('month').add(1, 'months') // eslint-disable-line new-cap
  let balance = new BigNumber(0)
  let usd = new BigNumber(0)

  fields.push('Confirm Date', 'Create Date', 'TXID', 'Amount', 'Fee', 'Total', 'Balance', 'Balance in USD')
  currencies.push('USD')

  data.sort((a, b) => { return (new Date(a['Confirm Date']) - new Date(b['Confirm Date'])) }).forEach((datum) => {
    const currency = datum['Balance in']
    const then = new Date(datum['Confirm Date'])

    balance = balance.plus(datum.Amount)
    datum.Balance = balance.toString()

    usd = usd.plus(datum[currency])
    datum['Balance in ' + currency] = usd.toString()

    if ((then < start) || (stop <= then)) return

    if (pairs.indexOf(datum.pair) === -1) pairs.push(datum.pair)

    if (currencies.indexOf(currency) === -1) {
      fields.push('Balance in ' + currency)
      currencies.push(currency)
    }

    results.push(datum)
  })

  fields.push('ToAddress', 'Description', 'Comment')
  pairs.sort().forEach((pair) => { fields.push(pair) })
  currencies.forEach((currency) => { fields.push(currency) })

  if (results.length > 0) console.log(json2csv({ data: results, fields: fields }))
}

switch (process.argv.length) {
  case 5:
    uphold = new UpholdSDK.default({ // eslint-disable-line new-cap
      baseUrl: 'https://api.uphold.com',
      clientId: '0000000000000000000000000000000000000000',
      clientSecret: '0000000000000000000000000000000000000000'
    })

    headers = {
      authorization: 'Basic ' + Buffer.from(process.argv[2] + ':X-OAuth-Basic').toString('base64')
    }
    return pass1(process.argv[3], process.argv[4])

  default:
    console.log('usage: ' + process.argv[0] + ' ' + process.argv[1] + ' <accessToken> <cardId> <startDate>')
    process.exit(1)
}
