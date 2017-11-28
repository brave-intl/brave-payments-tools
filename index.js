const path = require('path')

const glob = require('glob')

const cwd = path.join(__dirname, 'lib')

glob.sync('*-*.js', { cwd: cwd }).forEach((file) => {
  const parts = file.split('-')
  const provider = parts[0]
  const mode = path.basename(parts[1], '.js')

  if (parts.length !== 2) throw new Error('invalid file name: ' + path.join(cwd, file))

  if (!module.exports[provider]) module.exports[provider] = {}
  module.exports[provider][mode] = require(path.join(cwd, file))
})
