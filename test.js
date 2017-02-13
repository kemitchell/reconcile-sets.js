var assert = require('assert')
var crypto = require('crypto')
var fromArray = require('from2-array')
var reconcile = require('./')

var responder = reconcile.responder(function () {
  return fromArray(stringsToKeys(['a', 'b', 'c', 'd', 'e']))
})

var requester = reconcile.requester(
  function () {
    return fromArray(stringsToKeys(['f', 'g']))
  },
  function (error, decoded) {
    assert.ifError(error)
    console.log(decoded)
  }
)

requester
  .pipe(responder)
  .pipe(requester)

function stringsToKeys (strings) {
  return strings.map(function (string) {
    crypto.createHash('sha256')
      .update(string)
      .digest()
      .buffer
  })
}
