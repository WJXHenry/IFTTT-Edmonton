const request = require('request-promise-native')
const uuid = require('uuid/v4')

/**
 * This is a factory function for creating open data portal controllers. IFTTT requires unique
 * routes for every trigger. Since the functionality for our open data portal triggers are all
 * very similar, we can create controllers based on them.
 * @param {Function} prepareFunc Prepares the values needed or parsing air quality information.
 * This function must return an object with the fields 'field' and 'communityID'. Optionally, it
 * may also include a 'limit' value.
 */
module.exports = function createOpenDataPortalController(prepareFunc) {
  return async (req, res) => {
    let triggerFields = req.body.triggerFields
    // TODO: parse filters here
    let handleResponse
    try {
      let params = prepareFunc(req, res)
      handleResponse = await handleODP(
        // TODO: change
        req.cache,
        params.datasetIdentifier,
        params.column,
        params.filters,
        params.limit
      )
    } catch (e) {
      console.error(e)
      return res.status(e.code).send({
        errors: [
          {
            message: e.message
          }
        ]
      })
    }

    return res.status(200).send({
      data: handleResponse
    })
  }
}

/**
 * 
 * @param {ChangeWriter} cache The Redis cache
 * @param {String} datasetIdentifier The unique 8-character identifier in the form: XXXX-XXXX
 * (OLD) The url identifier in the form: 'https://data.edmonton.ca/api/views/XXXX-XXXX'
 * @param {String} column The dataset column to monitor changes on
 * @param {Array<Object>} filters The values to filter upon [ { column: STRING, value: STRING }, {...}, ... ]
 * column is the column to get back (SELECT column1, column2...)
 * value is the value to get (WHERE column1 = value1, etc...)
 * @param {String} triggerId The unique trigger ID describing the dataset being triggered on
 * (this is set by the creator of the trigger... this means YOU)
 * @param {Number} limit ??? Number???
 */
async function handleODP(cache, datasetIdentifier, column, filters, limit, triggerId) {

  // TODO: have an applet id field to identify different applets/triggers??
  // TODO: get datasetName and datasetId (the XXX-XXX part) from the datasetIdentifier
  // Eg. datasetName = name, datasetId = id from what is got back
  // TODO: or just make the identifier the 8 character unique id (Can be found under the 'API' tab
  // in the dataset)

  /**
   * Get name of dataset, id, etc here
   * Is this even needed?
   */

  // let key = `opendata/column/${id}/${column}/${triggerId}`
  let key = `opendata/column/${datasetIdentifier}/${column}` // Unique key for dataset storage
  let url = `https://data.edmonton.ca/resource/${datasetIdentifier}.json` // The Socrata api endpoint
  let queryBase = `${url}?$query=`

  let storedData = await cache.getLatest(key)
  let storedTimestamp
  let filteredStoredColumnValues // The stored/previous column values to be compared to
  if (storedData) {
    storedTimestamp = storedData.created_at
    filteredStoredColumnValues = JSON.parse(storedData.column_values)
  } else {
    storedTimestamp = '1998-07-25T00:00:00.000Z' // This value is random
  }

  /**
   * Parse filter values
   */
  let whereClause = ""
  if (filters) {
    filters.forEach(filterItem => {
      whereClause+=` AND (${filterItem.column}='${filterItem.value}')`
    })
  }

  // TODO: Change to appropriate limit
  // Get all the columns (filter it by column later)
  let getLatestUpdatedQuery = `${queryBase}SELECT ${column} WHERE :updated_at >= '${storedTimestamp}' ${whereClause} ORDER BY :updated_at DESC`
  console.log(getLatestUpdatedQuery)
  let getUpdatedTimestamp = `${queryBase}SELECT :updated_at ORDER BY :updated_at LIMIT 1`
  let latestTimestamp
  let latestColumnRows
  let filteredLatestColumnValues // The current values of the column being monitored
  try {
    let rawJsonUpdatedAt = await request(getUpdatedTimestamp)
    latestTimestamp = JSON.parse(rawJsonUpdatedAt)[0][':updated_at']
    let rawJsonColumnValues = await request(getLatestUpdatedQuery)
    latestColumnRows = JSON.parse(rawJsonColumnValues)
    filteredLatestColumnValues = latestColumnRows.map(row => {
      return row[column]
    })
    console.log(filteredLatestColumnValues)
  } catch (e) {
    e.code = 500
    throw e
  }
  // Ensure that the date is in ISO 8601 time format
  // TODO: Check for other potential time formats
  latestTimestamp = timestampFormat(latestTimestamp)

  let responseValues
  if (
    storedData &&
    compareArr(filteredStoredColumnValues, filteredLatestColumnValues)
  ) {
    console.log('Row values not changed. Returning old data')
    return await cache.getAll(key, limit)
  } else {
    console.log('Adding new rows')
    let id = uuid()
    // The unique difference (does not catch repeat values)
    let diff = {
      new: arrDiff(filteredLatestColumnValues, filteredStoredColumnValues),
      removed: arrDiff(filteredStoredColumnValues, filteredLatestColumnValues)
    }
    let newRows = {
      id,
      created_at: latestTimestamp,
      data_set: "Placeholder",
      column: column,
      column_values: JSON.stringify(filteredLatestColumnValues),
      all_values: JSON.stringify(latestColumnRows), // Stringified array of updated row values (unfiltered)
      difference: JSON.stringify(diff),
      meta: {
        id,
        timestamp: Math.round(new Date() / 1000)
      }
    }
    cache.add(key, newRows)
    return await cache.getAll(key, limit)
  }
}

/**
 * Compares the elements of two arrays and returns TRUE arrays are same or FALSE
 * if they are different
 * @param {Array<String|Number>} arr1 The first array to compare
 * @param {Array<String|Number>} arr2 The second array to compare
 * @return {Boolean} Returns TRUE if the arrays are the same or FALSE otherwise
 */
function compareArr(arr1, arr2) {
  arr1.sort()
  arr2.sort()
  let length
  if (arr1.length !== arr2.length) {
    return false
  } else {
    length = arr1.length
  }
  for (let i = 0; i < length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false
    }
  }
  return true
}

/**
 * Returns an array of elements in the first array (arr1) that are not
 * in the second array (arr2)
 * @param {Array<String|Number>} arr1 The array to compare to
 * @param {Array<String|Number>} arr2 The array to compare against
 * @return {Array<String|Number>} The difference between the two arrays
 */
function arrDiff(arr1, arr2) {
  let diff = []
  if (!arr1) {
    // Nothing to compare with
    return diff
  }
  if (!arr2) {
    // Everything in array1 will not be in array2 for this case
    return arr1
  }
  for (let element of arr1) {
    if (arr2.indexOf(element) == -1) {
      diff.push(element)
    }
  }
  return diff
}

/**
 * Converts timestamps to correctly formatted ISO 8601 time (currently only checks for epoch time)
 * @param {String|Number} timestamp The timestamp to convert
 * @return {String} The ISO 8601 formatted timestamp string
 */
function timestampFormat(timestamp) {
  if (
    !timestamp
      .toString()
      .match(/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}.[0-9]{3}Z/)
  ) {
    // Convert Epoch times to ISO 8601 time format
    return new Date(timestamp * 1000).toISOString()
  }
  return timestamp
}
