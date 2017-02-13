var Estimator = require('strata-estimator')
var IBF = require('ibf')
var concat = require('concat-stream')
var flushWriteStream = require('flush-write-stream')
var pump = require('pump')
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
            pump(
              createKeyStream(),
              flushWriteStream(
                function (key, _, done) {
                  ourEstimator.insert(key)
                  done()
                },
                function (flush) {
                  var estimatedDifference = theirEstimator
                    .decode(ourEstimator)
                  // "To use an IBF effectively, we must determine
                  // the approximate size of the set difference, d,
                  // since approximately 1.5d cells are required to
                  // successfully decode the IBF."
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
              )
            )
            done()
          })
        )
      })
    })
  },

  requester: function (createKeyStream, onDecoded) {
    var client = rpc()
    client.on('methods', function (remote) {
      pump(
        remote.reconcile(),
        concat({encoding: 'buffer'}, function (buffer) {
          var cellCount = varint.decode(buffer)
          var countBytes = varint.decode.bytes
          var strata = new Uint8Array(buffer, countBytes)
          var theirFilter = new IBF(filterOptions(cellCount, strata))
          keyStreamToFilter(
            createKeyStream, cellCount,
            function (error, ourFilter) {
              if (error) {
                onDecoded(error)
              } else {
                theirFilter.subtract(ourFilter)
                var result = theirFilter.decode()
                if (result === false) {
                  onDecoded(new Error('Could not decode IBF.'))
                } else {
                  onDecoded(null, result)
                }
              }
            }
          )
        })
      )
    })
    return client
  }
}

function keyStreamToFilter (createKeyStream, cellCount, callback) {
  var filter = new IBF(filterOptions(cellCount))
  pump(
    createKeyStream(),
    flushWriteStream(function (key, _, done) {
      filter.insert(key)
      done()
    }),
    function (error) {
      if (error) {
        callback(error)
      } else {
        callback(null, filter)
      }
    }
  )
}

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

function filterOptions (cellCount, arrayBuffer) {
  var returned = {
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
  if (arrayBuffer) {
    returned.arrayBuffer = arrayBuffer
  }
  return returned
}

function binaryXXH (idBuffer) {
  var digest = xxh(idBuffer, 0x1234)
  var digestBuffer = new ArrayBuffer(4)
  new Uint32Array(digestBuffer)[0] = digest
  return digestBuffer
}
