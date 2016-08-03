var StrataEstimator = require('strata-estimator')
var Writable = require('readable-stream').Writable
var inherits = require('util').inherits

module.exports = Estimate

function Estimate (options) {
  if (!(this instanceof Estimate)) {
    return new Estimate(options)
  }

  this._ourEstimator = new 
  Writable.call(this, {objectMode: true})
}

inherits(Estimate, Writable)

var prototype = Estimate.prototype

prototype._write = function (chunk, _, callback) {
  
}
