var path = require('path')

module.exports = {
  offline: require(path.join(__dirname, 'lib/offline.js')),
  online: require(path.join(__dirname, 'lib/online.js'))
}
