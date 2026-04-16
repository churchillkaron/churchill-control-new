const commands = []

if (status === 'CRITICAL') {
  commands.push('SERVICE CHARGE: BLOCKED')
  commands.push('MANAGER: intervene immediately')
}

if (avg < 400) {
  commands.push('FOH: upsell mains and sides')
}

if (drinks < 120) {
  commands.push('FOH: drinks first — enforce immediately')
}

if (drinks < 80) {
  commands.push('BAR: push high-margin drinks')
}