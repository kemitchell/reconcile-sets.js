var Estimator = require('strata-estimator')
var IBF = require('ibf')
var concat = require('concat-stream')
var estimatorOptions = require('./estimator-options')
var filterOptions = require('./filter-options')
var flushWriteStream = require('flush-write-stream')
var from = require('from2')
var pump = require('pump')
var through = require('through2')
var varint = require('varint')

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
          var cellCount = Math.ceil(1.5 * estimatedDifference)
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
              ourFilter.subtract(theirFilter)
              var result = ourFilter.decode()
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


