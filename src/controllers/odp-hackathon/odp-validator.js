/**
 * Validator for the 3 input fields
 */
module.exports = async function(req, res) {
  let fields = req.body.values
  console.log(fields)
  let id = fields.dataset.split('|&|')[0]

  let joining = fields.join_columns
  let columnsPass = true
  let columnsErrorMessage = ''
  let numberOfColumns = 0
  if (joining) {
    let joinColumnsResults = await checkJoinColumns(joining, id, req.store)
    columnsPass = joinColumnsResults[0]
    columnsErrorMessage = joinColumnsResults[1]
    numberOfColumns = joinColumnsResults[2]
  } else {
    console.log('No joining columns')
  }

  let values = fields.join_values
  let valuesPass = true
  let valuesErrorMessage = ''
  if (values) {
    let joinValuesResults = await checkJoinValues(values, numberOfColumns)
  } else {
    console.log('No values')
  }
  res.status(200).send({
    data: {
      dataset: {
        valid: true // Always return true (Validation not used)
      },
      join_columns: {
        valid: columnsPass,
        message: columnsErrorMessage
      },
      join_values: {
        valid: valuesPass,
        message: valuesErrorMessage
      }
    }
  })
}

/**
 *
 * @param {*} joinColumns
 * @param {*} id
 * @param {*} store
 * @returns {Array<...>} Results are in an array -> [Boolean, String, Number]
 */
async function checkJoinColumns(joinColumns, id, store) {
  let formatJoinColumns = joinColumns
    .split(',')
    .map(number => {
      return Number(number)
    })
    .sort((a, b) => {
      return a - b
    })
  // Check each number to see if it is in range of the columns (length of columns)
  let columns = await store.getDatasetColumns(id)
  let columnsPass = true
  let columnsErrorMessage = 'Not a column |'
  formatJoinColumns.forEach(columnNumber => {
    if (columnNumber > columns.length || columnNumber < 1) {
      columnsPass = false
      columnsErrorMessage += ` ${String(columnNumber)} |`
    }
  })
  return [columnsPass, columnsErrorMessage, formatJoinColumns.length]
}

async function checkJoinValues(joinValues, numberOfColumns) {
  console.log(joinValues)
  console.log('Number of columns: ' + numberOfColumns)
}

// NOTE: should consider the ordering of the values with columns -> do a split on
// both results and then iterate through while formatting (Number(...)) and .trim()
