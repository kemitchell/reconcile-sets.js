var assert = require('assert')
var crypto = require('crypto')
var fromArray = require('from2-array')
var net = require('net')
var reconcile = require('./')

// Create a small data set.
var keys = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// The server has some keys, the client has others, and the two share a
// few keys in common.
var serverHas = keys.slice(0, 5)
var bothHave = keys.slice(5, 7)
var clientHas = keys.slice(7)

// Create factory functions that create streams of keys that the server
// and client have.
var streamServerKeys = stream(bothHave.concat(serverHas))
var streamClientKeys = stream(bothHave.concat(clientHas))

// Create a TCP server that responds to reconciliation requests.
var server = net.createServer({allowHalfOpen: true}, function (socket) {
  reconcile.respond(streamServerKeys, socket)
})

// Start the server on a random high port.
server.listen(0, function () {
  var port = this.address().port
  // Connect to the server.
  var options = {port: port, allowHalfOpen: true}
  var socket = net.connect(options, function () {
    // Issue a reconciliation request.
    reconcile.request(
      streamClientKeys, socket,
      function (error, difference) {
        assert.ifError(error)
        assert.deepEqual(
          difference.missing
            .map(arrayBufferToHex)
            .sort(),
          serverHas
            .map(hexDigest)
            .sort(),
          'difference shows keys only server has'
        )
        assert.deepEqual(
          difference.additional
            .map(arrayBufferToHex)
            .sort(),
          clientHas
            .map(hexDigest)
            .sort(),
          'difference shows keys only client has'
        )
        server.close()
      }
    )
  })
})

// Helper Functions

// Turn an array into a stream of ArrayBuffer digests.
function stream (arrayOfStrings) {
  return function () {
    return fromArray.obj(arrayOfStrings.map(binaryDigest))
  }
}

function binaryDigest (string) {
  return digest(string).buffer
}

function hexDigest (string) {
  return digest(string).toString('hex')
}

function arrayBufferToHex (arrayBuffer) {
  return new Buffer(arrayBuffer).toString('hex')
}

function digest (string) {
  return crypto.createHash('sha256')
    .update(string)
    .digest()
}
