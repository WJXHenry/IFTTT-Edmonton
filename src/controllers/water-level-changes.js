const request = require('request-promise-native')
const uuid = require('uuid/v4')

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
  if (storedData) storedUpdated = storedData.time

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
      time: recentUpdated,
      meta: {
        id,
        timestamp: Math.round(new Date() / 1000)
      }
    }
    req.cache.add(key, newRows)
    responseValues = await req.cache.getAll(key, req.body['limit'])
  }

  res.status(200).send({
    data: responseValues
  })
}
