var Estimator = require('strata-estimator')
var IBF = require('ibf')
var concat = require('concat-stream')
var flushWriteStream = require('flush-write-stream')
var from = require('from2')
var pump = require('pump')
var pumpify = require('pumpify')
var rpc = require('rpc-multistream')
var through = require('through2')
var varint = require('varint')
var xxh = require('xxhashjs').h32

module.exports = {

  responder: function requester (streamKeys) {
    return rpc({
      reconcile: rpc.syncStream(function () {
        return pumpify(
          chunksToArrayOfBuffers(),
          through.obj(function (chunks, _, done) {
            var self = this
            var buffer = Buffer.concat(chunks).buffer
            var theirEstimator = new Estimator(estimatorOptions(buffer))
            makeEstimator(streamKeys, function (error, ourEstimator) {
              if (error) return done(error)
              var estimatedDifference = Math.max(
                1, theirEstimator.decode(ourEstimator)
              )
              // "To use an IBF effectively, we must determine
              // the approximate size of the set difference, d,
              // since approximately 1.5d cells are required to
              // successfully decode the IBF."
              // --- Eppstein et al, section 3.2.
              var cellCount = Math.ceil(1.5 * estimatedDifference)
              makeFilter(
                streamKeys, cellCount,
                function (error, filter) {
                  if (error) return done(error)
                  self.push(new Buffer(varint.encode(cellCount)))
                  self.push(new Buffer(filter.arrayBuffer))
                  done()
                }
              )
            })
          })
        )
      })
    })
  },

  requester: function (streamKeys, onDecoded) {
    var client = rpc()
    client.on('methods', function (remote) {
      makeEstimator(streamKeys, function (error, estimator) {
        if (error) return onDecoded(error)
        var filterBuffers = estimator._strata.map(function (filter) {
          return filter.arrayBuffer
        })
        var estimatorStream = from(function (size, next) {
          if (filterBuffers.length === 0) {
            next(null, null)
          } else {
            next(null, new Buffer(filterBuffers.shift()))
          }
        })
        var reconcile = remote.reconcile()
        var asNodeBuffer = {encoding: 'buffer'}
        var decode = concat(asNodeBuffer, function (nodeBuffer) {
          var cellCount = varint.decode(nodeBuffer)
          var headerBytes = varint.decode.bytes
          // TODO Avoid copying the whole buffer.
          var filterBuffer = nodeBuffer.buffer.slice(
            headerBytes,
            nodeBuffer.length
          )
          var theirFilter = new IBF(
            filterOptions(cellCount, filterBuffer)
          )
          makeFilter(
            streamKeys, cellCount,
            function (error, ourFilter) {
              if (error) return onDecoded(error)
              theirFilter.subtract(ourFilter)
              var result = theirFilter.decode()
              if (result === false) {
                onDecoded(new Error('Could not decode IBF.'))
              } else {
                onDecoded(null, result)
              }
            }
          )
        })
        estimatorStream
          .pipe(reconcile)
          .pipe(decode)
      })
    })
    return client
  }
}

function chunksToArrayOfBuffers () {
  var chunks = []
  return through(
    {
      writableObjectMode: false,
      readableObjectMode: true
    },
    function (chunk, enc, done) {
      chunks.push(chunk)
      done()
    },
    function (done) {
      done(null, chunks)
    }
  )
}

function makeEstimator (streamKeys, callback) {
  var estimator = new Estimator(estimatorOptions())
  pump(
    streamKeys(),
    flushWriteStream(function (key, _, done) {
      estimator.insert(key)
      done()
    }),
    function (error) {
      if (error) {
        callback(error)
      } else {
        callback(null, estimator)
      }
    }
  )
}

function makeFilter (streamKeys, cellCount, callback) {
  var filter = new IBF(filterOptions(cellCount))
  pump(
    streamKeys(),
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

var seeds = [0x0000, 0x9999, 0xFFFF]
var estimatorCellCount = 80
var estimatorStrataCount = 32

function estimatorOptions (buffer) {
  var returned = {
    hash: function (input) {
      return xxh(input, 0xAAAA)
    },
    strataCount: estimatorStrataCount,
    filters: filterOptions(estimatorCellCount)
  }
  if (buffer) {
    var strata = []
    var filterSize = buffer.byteLength / estimatorStrataCount
    var offset
    for (offset = 0; offset < buffer.byteLength; offset += filterSize) {
      strata.push(new IBF(filterOptions(
        estimatorCellCount,
        buffer.slice(offset, offset + filterSize)
      )))
    }
    returned.strata = strata
  }
  return returned
}

function filterOptions (cellCount, arrayBuffer) {
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
