var Estimator = require('strata-estimator')
var IBF = require('ibf')
var concat = require('concat-stream')
var flushWriteStream = require('flush-write-stream')
var from = require('from2')
var pump = require('pump')
var through = require('through2')
var varint = require('varint')
var xxh = require('xxhashjs').h32

var MINIMUM_FILTER_CELLS = 16

module.exports = {

  respond: function (createKeyStream, connection) {
    connection
      .pipe(chunksToArrayOfNodeBuffers())
      .pipe(through({
        writableObjectMode: true,
        readableObjectMode: false
      }, function (chunks, _, done) {
        var self = this
        var arrayBuffer = Buffer.concat(chunks).buffer
        var theirEstimator = new Estimator(
          estimatorOptions(arrayBuffer)
        )
        makeEstimator(createKeyStream, function (error, ourEstimator) {
          if (error) return done(error)
          var estimatedDifference = Math.max(
            1, theirEstimator.decode(ourEstimator)
          )
          // "To use an IBF effectively, we must determine
          // the approximate size of the set difference, d,
          // since approximately 1.5d cells are required to
          // successfully decode the IBF."
          // --- Eppstein et al, section 3.2.
          var cellCount = Math.max(
            Math.ceil(1.5 * estimatedDifference),
            MINIMUM_FILTER_CELLS
          )
          makeFilter(
            createKeyStream, cellCount,
            function (error, filter) {
              if (error) return done(error)
              self.push(new Buffer(varint.encode(cellCount)))
              self.push(new Buffer(filter.arrayBuffer))
              done()
            }
          )
        })
      }))
      .pipe(connection)
  },

  request: function (createKeyStream, connection, callback) {
    makeEstimator(createKeyStream, function (error, estimator) {
      if (error) return callback(error)

      streamEstimatorNodeBuffers()
        .pipe(connection)
        .pipe(filterProcessor())

      function streamEstimatorNodeBuffers () {
        var arrayBuffers = estimator._strata.map(function (filter) {
          return filter.arrayBuffer
        })
        return from(function (size, next) {
          if (arrayBuffers.length === 0) {
            next(null, null)
          } else {
            next(null, new Buffer(arrayBuffers.shift()))
          }
        })
      }

      function filterProcessor () {
        return concat({encoding: 'buffer'}, function (nodeBuffer) {
          var cellCount = varint.decode(nodeBuffer)
          var headerBytes = varint.decode.bytes
          // TODO Avoid copying the whole buffer.
          var bodyArrayBuffer = new ArrayBuffer(
            nodeBuffer.length - headerBytes
          )
          new Uint8Array(bodyArrayBuffer)
            .set(nodeBuffer.slice(headerBytes))
          var theirFilter = new IBF(
            filterOptions(cellCount, bodyArrayBuffer)
          )
          makeFilter(
            createKeyStream, cellCount,
            function (error, ourFilter) {
              if (error) return callback(error)
              var difference = ourFilter.clone()
              difference.subtract(theirFilter)
              var result = difference.decode()
              if (result === false) {
                callback(new Error('Could not decode IBF.'))
              } else {
                callback(null, result)
              }
            }
          )
        })
      }
    })
  }
}

function chunksToArrayOfNodeBuffers () {
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
  insertInto(streamKeys(), new Estimator(estimatorOptions()), callback)
}

function makeFilter (streamKeys, cellCount, callback) {
  insertInto(streamKeys(), new IBF(filterOptions(cellCount)), callback)
}

function insertInto (stream, object, callback) {
  pump(
    stream,
    flushWriteStream.obj(function (key, _, done) {
      object.insert(key)
      done()
    }),
    function (error) {
      if (error) {
        callback(error)
      } else {
        callback(null, object)
      }
    }
  )
}

var estimatorCellCount = 80
var estimatorStrataCount = 32

function estimatorOptions (arrayBuffer) {
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

var seeds = [0x0000, 0xAAAA, 0xFFFF]

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
    idSumOctets: 32,
    hashSumOctets: 4
  }
  if (arrayBuffer) {
    returned.arrayBuffer = arrayBuffer
  }
  return returned
}
