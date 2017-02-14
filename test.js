var assert = require('assert')
var net = require('net')
var crypto = require('crypto')
var from = require('from2')
var reconcile = require('./')

var alphabet = []
for (var i = 65; i <= 90; i++) {
  alphabet.push(String.fromCharCode(i))
}

// Create a TCP server that responds to reconciliation requests.
var server = net.createServer({allowHalfOpen: true}, function (socket) {
  reconcile.respond(keys(alphabet.slice(0, 20)), socket)
})

// Start the server on a random high port.
server.listen(0, function () {
  var port = this.address().port
  // Connect to the server.
  var options = {port: port, allowHalfOpen: true}
  var socket = net.connect(options, function () {
    // Issue a reconciliation request.
    reconcile.request(
      keys(alphabet.slice(10, 26)),
      socket,
      function (error, difference) {
        assert.ifError(error)
        console.log(difference)
        server.close()
      }
    )
  })
})

// Helper Method:  Turn an array into a stream of ArrayBuffer digests.
function keys (array) {
  return function () {
    var keyBuffers = array.map(function (string) {
      return crypto.createHash('sha256')
        .update(string)
        .digest()
        .buffer
    })
    return from.obj(function (size, done) {
      if (keyBuffers.length <= 0) {
        done(null, null)
      } else {
        done(null, keyBuffers.shift())
      }
    })
  }
}
