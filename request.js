var StrataEstimator = require('strata-estimator')
var Writable = require('readable-stream').Writable
var ibfDefaults = require('./ibf-defaults')
var inherits = require('util').inherits
var xxh = require('xxhashjs').h32

module.exports = Request

var defaultOptions = {
  hash: function (input) { return xxh(input, 0xAAAA) },
  cellCount: 80,
  strataCount: 32,
  filters: ibfDefaults
}

function Request (options) {
  if (!(this instanceof Request)) {
    return new Request(options)
  }

  options = options || defaultOptions
  this._strataCount = options.strataCount
  this._estimator = new StrataEstimator(options)

  Writable.call(this, {objectMode: true})
}

inherits(Request, Writable)

var prototype = Request.prototype

prototype._write = function (chunk, encoding, done) {
  this._estimator.insert(chunk)
  done()
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
