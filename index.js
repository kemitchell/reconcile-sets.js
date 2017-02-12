var Estimator = require('strata-estimator')
var IBF = require('ibf')
var flushWriteStream = require('flush-write-stream')
var pumpify = require('pumpify')
var rpc = require('rpc-multistream')
var through = require('through2')
var varint = require('varint')
var xtend = require('xtend')
var xxh = require('xxhashjs').h32

var seeds = [0x0000, 0x9999, 0xFFFF]
var estimatorCellCount = 80

module.exports = {
  responder: function requester (createKeyStream) {
    return rpc({
      reconcile: rpc.syncStream(function () {
        var chunks = []
        return pumpify(
          through(
            {
              writableObjectMode: false,
              readableObjectMode: true
            },
            function transform (chunk, enc, done) {
              chunks.push(chunk)
              done()
            },
            function flush (done) {
              done(null, Buffer.concat(chunks))
            }
          ),
          through.obj(function bufferToEstimator (buffer, _, done) {
            var theirEstimator = new Estimator(
              estimatorOptions(buffer)
            )
            var ourEstimator = new Estimator(xtend(estimatorOptions))
            createKeyStream().pipe(flushWriteStream(
              function (key, _, done) {
                ourEstimator.insert(key)
                done()
              },
              function (flush) {
                var estimatedDifference = theirEstimator
                  .decode(ourEstimator)
                // "To use an IBF effectively, we must determine the
                // approximate size of the set difference, d, since
                // approximately 1.5d cells are required to successfully
                // decode the IBF."
                // --- Eppstein et al, section 3.2.
                var cellCount = Math.ceil(1.5 * estimatedDifference)
                var filter = new IBF(filterOptions(cellCount))
                createKeyStream().pipe(flushWriteStream(
                  function (key, _, done) {
                    filter.insert(key)
                    done()
                  },
                  function (done) {
                    done()
                    flush(null, Buffer.concat([
                      varint.encode(cellCount),
                      filter.arrayBuffer
                    ]))
                  }
                ))
              }
            ))
            done()
          })
        )
      })
    })
  }
}

// TODO Client logic for decoding varint prefix and rehydrating IBF

function estimatorOptions (strata) {
  return {
    strata: strata,
    hash: function (input) {
      return xxh(input, 0xAAAA)
    },
    strataCount: 32,
    filters: filterOptions(estimatorCellCount)
  }
}

function filterOptions (cellCount) {
  return {
    cellCount: cellCount,
    keyHashes: seeds.map(function (seed) {
      return function (id) {
        return xxh(id, seed) % cellCount
      }
    }),
    checkHash: binaryXXH,
    countView: Int32Array,
    idSumElements: 8,
    idSumView: Uint32Array,
    hashSumElements: 1,
    hashSumView: Uint32Array
  }
}

function binaryXXH (idBuffer) {
  var digest = xxh(idBuffer, 0x1234)
  var digestBuffer = new ArrayBuffer(4)
  new Uint32Array(digestBuffer)[0] = digest
  return digestBuffer
}
