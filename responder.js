var Duplex = require('readable-stream').Duplex
var inherits = require('util').inherits

module.exports = Response

// TODO: response IBF cell count = 1.5 times estimated difference

function Response (options) {
  if (!(this instanceof Response)) {
    return new Response(options)
  }

  Duplex.call(this, {
    allowHalfOpen: false,
    writableObjectMode: false,
    readableObjectMode: false
  })
}

inherits(Response, Duplex)

var prototype = Response.prototype

prototype._write = function (chunk, encoding, callback) {
  
}

prototype._read = function (size) {
  
}
