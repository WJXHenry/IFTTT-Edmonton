const request = require('request-promise-native')
const parseXML = require('../utils/parse-ltb-xml')
const parseColors = require('../utils/color-parse')

/**
 * Returns the most recent light the bridge results to IFTTT.
 */
module.exports = async function(req, res) {
  let tweet
  var colors = []
  try {
    let xmlString = await request(process.env.LTB_URL)
    tweet = await parseXML(xmlString)
    colors = parseColors(tweet.title)
  } catch (e) {
    console.error(e)
    return res.status(500).send({
      errors: [
        {
          message: e
        }
      ]
    })
  }

  console.log(`${tweet.title}`)
  tweet = {
    ...tweet,
    ...{
      created_at: new Date().toISOString(),
      color_description: colors
        .map(function(element) {
          return element.color.charAt(0).toUpperCase() + element.color.slice(1)
        })
        .join(', '),
      color1: colors[0] ? colors[0].hex : '',
      color2: colors[1] ? colors[1].hex : '',
      color3: colors[2] ? colors[2].hex : '',
      color4: colors[3] ? colors[3].hex : '',
      meta: {
        id: tweet.id,
        timestamp: Math.round(new Date() / 1000)
      }
    }
  }

  let responseValues
  let key = `light_the_bridge`
  let latest = await req.cache.getLatest(key)
  if (latest && tweet.id == latest.id) {
    console.log('Returning old results')
    responseValues = await req.cache.getAll(key, req.body['limit'])
  } else {
    console.log('Adding new tweet')
    await req.cache.add(key, tweet)
    responseValues = await req.cache.getAll(key, req.body['limit'])
  }

  res.status(200).send({
    data: responseValues
  })
}
