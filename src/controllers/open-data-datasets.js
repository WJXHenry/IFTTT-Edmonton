const zlib = require('zlib')

function truncateString(string, maxLength) {
  let longer = string.length > maxLength ? true : false
  if (longer) {
    return string.slice(0, maxLength).trimEnd() + '... '
  } else {
    return string + ' ' // Add a space as padding
  }
}

/**
 * Gets the datasets from the cache and returns as a response
 */
module.exports = async function(req, res) {
  let data
  let newData
  let timer
  try {
    console.log('Getting dataset options...')
    timer = Date.now()
    data = await req.store.getDatasetData()
    newData = data.map(dataset => {
      let newLabel = truncateString(dataset.label, 65)
      let newColumnValues = dataset.values.map(columnValue => {
        let newColumnValue = truncateString(columnValue.label, 65)
        return { label: newColumnValue, value: columnValue.value }
      })
      return { label: newLabel, values: newColumnValues }
    })
  } catch (e) {
    e.code = 500
    throw e
  }
  let sendData = {
    data: newData
  }
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Encoding': 'gzip'
  })
  zlib.gzip(JSON.stringify(sendData), function(_, result) {
    res.end(result)
    console.log(`Options sent. Time: ${Date.now() - timer} ms`)
    // console.log(result)
  })
}
