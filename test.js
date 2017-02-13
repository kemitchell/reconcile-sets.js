var assert = require('assert')
var crypto = require('crypto')
var from = require('from2')
var reconcile = require('./')
var through = require('through2')

var responder = reconcile.responder(function () {
  return streamOfKeys(['a', 'b', 'c', 'd', 'e'])
})

var requester = reconcile.requester(
  function () {
    return streamOfKeys(['f', 'g'])
  },
  function (error, decoded) {
    assert.ifError(error)
    console.log(decoded)
  }
)

requester
  .pipe(through(function (chunk, _, done) {
    console.log(chunk.length)
    if (chunk.length < 3000) {
      // console.log(chunk.toString('utf8'))
    }
    done(null, chunk)
  }))
  .pipe(responder)
  .pipe(requester)

function streamOfKeys (array) {
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
