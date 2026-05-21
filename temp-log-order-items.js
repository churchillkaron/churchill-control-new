const fs = require('fs')

const content =
  fs.readFileSync(
    'lib/pos/createOrder.js',
    'utf8'
  )

console.log(content)
