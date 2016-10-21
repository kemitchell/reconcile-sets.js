var StrataEstimator = require('strata-estimator')
var Duplex = require('readable-stream').Duplex
var flushWriteStream = require('flush-write-stream')
var ibfDefaults = require('./ibf-defaults')
var inherits = require('util').inherits
var pump = require('pump')
var xtend = require('xtend')
var xxh = require('xxhashjs').h32

module.exports = Requester

var defaultOptions = {
  hash: function (input) {
    return xxh(input, 0xAAAA)
  },
  cellCount: 80,
  strataCount: 32,
  filters: ibfDefaults
}

function Requester (keyStream, options) {
  if (!(this instanceof Requester)) {
    return new Requester(options)
  }

  options = options
    ? xtend(defaultOptions, options)
    : defaultOptions
  this._keyStream = keyStream
  this._strataCount = options.strataCount
  this._estimator = new StrataEstimator(options)

  pump(
    keyStream,
    flushWriteStream.obj(
      function write (chunk, _, done) {
        this._estimator.insert(chunk)
      },
      function finish (done) {
        // TODO
        done()
      }
    )
  )

  Duplex.call(this, {highWaterMark: options.highWaterMark})
}

inherits(Requester, Duplex)

var prototype = Requester.prototype

prototype._write = function (chunk, encoding, done) {
  done()
}

prototype._read = function (size) {
}

prototype.arrayBuffers = function () {
  var returned = []
  var count = this._strataCount
  var estimator = this._estimator
  for (var index = 0; index < count; index++) {
    returned.push(estimator.stratum(index).arrayBuffer)
  }
  return returned
}
