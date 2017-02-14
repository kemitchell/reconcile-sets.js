var xxh = require('xxhashjs').h32

var seeds = [0x0000, 0xAAAA, 0xFFFF]

module.exports = function (cellCount, arrayBuffer) {
  var returned = {
    cellCount: cellCount,
    keyHashes: seeds.map(function (seed) {
      return function (id) {
        return xxh(id, seed) % cellCount
      }
    }),
    checkHash: function binaryXXH (idBuffer) {
      var digest = xxh(idBuffer, 0x1234)
      var digestBuffer = new ArrayBuffer(4)
      new Uint32Array(digestBuffer)[0] = digest
      return digestBuffer
    },
    idSumOctets: 32,
    hashSumOctets: 4
  }
  if (arrayBuffer) {
    returned.arrayBuffer = arrayBuffer
  }
  return returned
}
