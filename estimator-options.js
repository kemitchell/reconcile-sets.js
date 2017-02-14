var IBF = require('ibf')
var filterOptions = require('./filter-options')
var xxh = require('xxhashjs').h32

var estimatorCellCount = 80
var estimatorStrataCount = 32

module.exports = function (arrayBuffer) {
  var returned = {
    hash: function (input) {
      return xxh(input, 0xAAAA)
    },
    strataCount: estimatorStrataCount,
    filters: filterOptions(estimatorCellCount)
  }
  if (arrayBuffer) {
    var strata = []
    var totalLength = arrayBuffer.byteLength
    var filterSize = totalLength / estimatorStrataCount
    var offset
    for (offset = 0; offset < totalLength; offset += filterSize) {
      strata.push(new IBF(filterOptions(
        estimatorCellCount,
        arrayBuffer.slice(offset, offset + filterSize)
      )))
    }
    returned.strata = strata
  }
  return returned
}

