import * as XLSX from 'xlsx'

// Normalize a cell value to a comparable lowercase trimmed string
const norm = (v) => (v === undefined || v === null ? '' : String(v).trim().toLowerCase())

// Parses a number that may be formatted as currency text (e.g. "د.م.‏ 1,800.00", "1 234,50")
function toNumber(v) {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'number') return v
  // Pull out the last numeric token (handles currency prefixes like "د.م. 1,800.00")
  const matches = String(v).match(/-?\d[\d,]*\.?\d*/g)
  if (!matches || matches.length === 0) return null
  const last = matches[matches.length - 1].replace(/,/g, '')
  const n = parseFloat(last)
  return isNaN(n) ? null : n
}

function findReportSheetName(workbook) {
  const match = workbook.SheetNames.find((n) => /^report/i.test(n.trim()))
  return match || workbook.SheetNames[0]
}

// Find the [row, col] of the first cell whose normalized text matches `predicate`
function findCell(grid, predicate) {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || []
    for (let c = 0; c < row.length; c++) {
      if (predicate(norm(row[c]))) return [r, c]
    }
  }
  return null
}

function isRowEmpty(row) {
  if (!row) return true
  return row.every((cell) => cell === undefined || cell === null || String(cell).trim() === '')
}

/**
 * Parses a VivaStay monthly Excel report and returns the extracted data.
 * Structure (as observed in the template):
 *  - A1: property name
 *  - Reservations table: header row with "rental"/"checkin"/"checkout"/"total payment"/"channel"
 *  - Charges table: header cell "Charge" with "Montant" to the right, and "Menages"/"Montant" further right
 *  - Recap block: header row containing "Occup..." (Occupancy Rate) and 5 following labeled columns
 */
export function parseReportWorkbook(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const sheetName = findReportSheetName(workbook)
  const sheet = workbook.Sheets[sheetName]
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })

  const errors = []

  // Property name: top-left cell (A1)
  const propertyName = grid[0] && grid[0][0] ? String(grid[0][0]).trim() : null
  if (!propertyName) errors.push("Nom du bien introuvable en cellule A1")

  // --- Reservations table ---
  const resHeaderPos = findCell(grid, (v) => v === 'rental' || v.includes('guest'))
  const reservations = []
  if (resHeaderPos) {
    const [hRow] = resHeaderPos
    const header = grid[hRow].map(norm)
    const colIdx = {
      rental: header.findIndex((h) => h === 'rental'),
      guest: header.findIndex((h) => h.includes('guest')),
      checkin: header.findIndex((h) => h === 'checkin'),
      checkout: header.findIndex((h) => h === 'checkout'),
      amount: header.findIndex((h) => h.includes('total payment') || h.includes('montant')),
      channel: header.findIndex((h) => h === 'channel' || h === 'canal'),
    }
    let r = hRow + 1
    while (r < grid.length && !isRowEmpty(grid[r])) {
      const row = grid[r]
      reservations.push({
        guest_name: colIdx.guest >= 0 ? row[colIdx.guest] ?? null : null,
        checkin: colIdx.checkin >= 0 ? row[colIdx.checkin] ?? null : null,
        checkout: colIdx.checkout >= 0 ? row[colIdx.checkout] ?? null : null,
        amount: colIdx.amount >= 0 ? toNumber(row[colIdx.amount]) || 0 : 0,
        channel: colIdx.channel >= 0 ? row[colIdx.channel] ?? null : null,
      })
      r++
    }
  } else {
    errors.push("Tableau des réservations introuvable (en-tête 'rental'/'guest' non trouvé)")
  }

  // --- Charges table ---
  const chargeHeaderPos = findCell(grid, (v) => v === 'charge')
  const charges = []
  let cleaning = { count: null, rate: null, total_amount: null }
  if (chargeHeaderPos) {
    const [hRow, hCol] = chargeHeaderPos
    const header = grid[hRow].map(norm)
    const amountCol = hCol + 1 // "Montant" right after "Charge"
    const cleaningCountCol = header.findIndex((h) => h.includes('menage') || h.includes('ménage'))
    const cleaningAmountCol = cleaningCountCol >= 0 ? cleaningCountCol + 1 : -1

    let r = hRow + 1
    while (r < grid.length && !isRowEmpty(grid[r])) {
      const row = grid[r]
      const label = row[hCol]
      const amount = row[amountCol]
      if (label !== undefined && label !== null && String(label).trim() !== '') {
        charges.push({ label: String(label).trim(), amount: toNumber(amount) || 0 })
      }
      r++
    }
    if (cleaningCountCol >= 0) {
      const row = grid[hRow + 1] || []
      cleaning = {
        count: toNumber(row[cleaningCountCol]),
        rate: null,
        total_amount: toNumber(row[cleaningAmountCol]),
      }
    }
  } else {
    errors.push("Tableau des charges introuvable (en-tête 'Charge' non trouvé)")
  }

  // --- Recap block ---
  const recapHeaderPos = findCell(grid, (v) => v.includes('occup'))
  let recap = {
    occupancy_rate: null,
    profit_owner: null,
    profit_vs: null,
    charges_advanced: null,
    airbnb_transfer_received: null,
    transfer_to_vs: null,
  }
  if (recapHeaderPos) {
    const [hRow, hCol] = recapHeaderPos
    const header = grid[hRow].map(norm)
    const dataRow = grid[hRow + 1] || []
    const findCol = (...keywords) =>
      header.findIndex((h) => keywords.some((k) => h.includes(k)))

    const cOccup = hCol
    const cProfitOwner = findCol('profit owner')
    const cProfitVs = findCol('profit vs')
    const cChargesAdv = findCol('charges avanc')
    const cAirbnbRecv = findCol('virement re')
    const cTransferVs = findCol('virement') // fallback, refined below

    // The two "virement" columns: "reçu" vs "vers vs" — distinguish explicitly
    const cVirementRecu = header.findIndex((h) => h.includes('virement') && (h.includes('reçu') || h.includes('recu')))
    const cVirementVersVs = header.findIndex((h) => h.includes('virement') && h.includes('vers'))

    recap = {
      occupancy_rate: toNumber(dataRow[cOccup]),
      profit_owner: cProfitOwner >= 0 ? toNumber(dataRow[cProfitOwner]) : null,
      profit_vs: cProfitVs >= 0 ? toNumber(dataRow[cProfitVs]) : null,
      charges_advanced: cChargesAdv >= 0 ? toNumber(dataRow[cChargesAdv]) : null,
      airbnb_transfer_received: cVirementRecu >= 0 ? toNumber(dataRow[cVirementRecu]) : null,
      transfer_to_vs: cVirementVersVs >= 0 ? toNumber(dataRow[cVirementVersVs]) : null,
    }
  } else {
    errors.push("Bloc récap introuvable (en-tête 'Occupancy Rate' non trouvé)")
  }

  return { propertyName, reservations, charges, cleaning, recap, errors, sheetName }
}

// Convert an Excel serial date or JS Date to an ISO date string (YYYY-MM-DD)
export function toIsoDate(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') {
    const d = new Date(value)
    if (!isNaN(d)) return d.toISOString().slice(0, 10)
    return null
  }
  return null
}
