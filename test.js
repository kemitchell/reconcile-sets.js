var assert = require('assert')
var crypto = require('crypto')
var fromArray = require('from2-array')
var net = require('net')
var reconcile = require('./')

var months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

var streamServerKeys = stream(months.slice(0, 7))
var streamClientKeys = stream(months.slice(5))

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
        console.log(difference)
        server.close()
      }
    )
  })
})

// Helper Method:  Turn an array into a stream of ArrayBuffer digests.
function stream (arrayOfStrings) {
  return function () {
    return fromArray.obj(arrayOfStrings.map(stringToDigest))
  }
}

function stringToDigest (string) {
  return crypto.createHash('sha256')
    .update(string)
    .digest()
    .buffer
}
