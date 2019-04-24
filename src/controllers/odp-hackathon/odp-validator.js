const { getDatasetColumns } = require('../../utils/store-odp-data')

module.exports = async function(req, res) {
  let fields = req.body.values
  let id = fields.dataset.split('|&|')[0]
  let joinColumns = fields.join_columns.split(',')
  // Check each number to see if it is in range of the columns (length of columns)
  let columns = await req.store.getDatasetColumns(id)
  console.log(columns.length)
  let pass = true
  let errorMessage = 'Invalid |'
  joinColumns.forEach(columnNumber => {
    if (Number(columnNumber) > columns.length) {
      pass = false
      errorMessage += ` ${String(Number(columnNumber))} |`
    }
  })
  res.status(200).send({
    data: {
      dataset: {
        valid: true // Always return true (Validation not used)
      },
      join_columns: {
        valid: pass,
        message: errorMessage
      }
    }
  })
}
