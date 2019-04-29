const request = require('request-promise-native')
const uuid = require('uuid/v4')

const TIMEZONE_OFFSET_MILLIS = 360 * 60 * 1000 // Timezone offset for Edmonton to UTC

/**
 * Water Level Changes
 */
module.exports = async function(req, res) {
  console.log('Water Level Changes Controller')
  let key = 'water-level-changes' // Unique key for dataset storage
  let url = 'https://data.edmonton.ca/resource/cnsu-iagr.json' // The Socrata api endpoint
  let queryBase = `${url}?$query=`

  let storedData = await req.cache.getLatest(key)
  let storedUpdated
  if (storedData) storedUpdated = storedData.last_updated

  // Get all the columns (filter it by column later)
  let getUpdatedQuery = `${queryBase}SELECT date_and_time, water_level_m WHERE station_number = '05DF001' ORDER BY date_and_time DESC`
  let updatedData
  let recentUpdated
  try {
    let rawJsonUpdated = await request(getUpdatedQuery)
    updatedData = JSON.parse(rawJsonUpdated)
    recentUpdated = updatedData[0].date_and_time
  } catch (e) {
    e.code = 500
    throw e
  }

  console.log(recentUpdated)
  let bounds = getBounds(recentUpdated)
  console.log('Lower: ' + bounds[0])
  console.log('Upper: ' + bounds[1])

  let responseValues
  if (storedUpdated && new Date(storedUpdated) >= new Date(recentUpdated)) {
    console.log('No new updates')
    responseValues = await req.cache.getAll(key, req.body['limit'])
  } else {
    console.log('Dataset was updated')
    console.log('Adding new rows')
    let id = uuid()
    let newRows = {
      id,
      created_at: new Date(Date.now()).toISOString(),
      last_updated: recentUpdated,
      meta: {
        id,
        timestamp: Math.round(new Date() / 1000)
      }
    }
    // TODO: add ingredients like average water level for the day?
    // Use the SoQL to do this -> avg, etc... -> is probably faster
    req.cache.add(key, newRows)
    responseValues = await req.cache.getAll(key, req.body['limit'])
  }

  res.status(200).send({
    data: responseValues
  })
}

/**
 * This function obtains the upper and lower bounds of a three-day period
 * @param {String} date The date in ISO format
 * @returns {Array<String>} The upper and lower bounds of the three-day period
 */
function getBounds(date) {
  const dateRegex = /[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}.[0-9]{3}/
  let currentDate = new Date(new Date(date) - TIMEZONE_OFFSET_MILLIS)
  let threeDayPeriod = new Date(
    new Date(date) - (3 * 24 * 60 * 60 * 1000 + TIMEZONE_OFFSET_MILLIS)
  )
  let lowerBound = threeDayPeriod.toISOString().match(dateRegex)
  let upperBound = currentDate.toISOString().match(dateRegex)
  return [lowerBound, upperBound]
}
