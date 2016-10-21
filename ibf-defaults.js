var xxh = require('xxhashjs').h32

var cellCount = 80
var seeds = [0x0000, 0x9999, 0xFFFF]

module.exports = {
  cellCount: cellCount,
  checkHash: function binaryXXH (idBuffer) {
    var digest = xxh(idBuffer, 0x1234)
    var digestBuffer = new ArrayBuffer(4)
    new Uint32Array(digestBuffer)[0] = digest
    return digestBuffer
  },
  keyHashes: seeds.map(function (seed) {
    return function (id) {
      return xxh(id, seed) % cellCount
    }
  }),
  countView: Int32Array,
  idSumElements: 8,
  idSumView: Uint32Array,
  hashSumElements: 1,
  hashSumView: Uint32Array
}
