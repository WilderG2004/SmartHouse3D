/*
 * Formatos de hora y numero.
 * Crear un Intl.DateTimeFormat / NumberFormat es CARO (decenas de microsegundos cada vez). Antes se creaba uno nuevo en cada
 * llamada (el registro de eventos y las graficas lo hacen cientos de veces por segundo), lo que robaba tiempo al 3D y
 * causaba tirones. Ahora se crean una sola vez y se reutilizan; el resultado es exactamente el mismo.
 */
const LOCALE = 'es-CO'

const time = new Intl.DateTimeFormat(LOCALE, { hour12: false, hour: 'numeric', minute: 'numeric', second: 'numeric' })
const clock = new Intl.DateTimeFormat(LOCALE, { hour12: false, hour: '2-digit', minute: '2-digit' })
const dateTime = new Intl.DateTimeFormat(LOCALE, { hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const numbers = new Map<number, Intl.NumberFormat>()
const numberFormat = (digits: number) => {
  let f = numbers.get(digits)
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits })
    numbers.set(digits, f)
  }
  return f
}

export const fmtTime = (ts: number) => time.format(ts)

export const fmtNumber = (n: number, digits = 0) => numberFormat(digits).format(n)

/** HH:MM (sin segundos): para ejes de rangos largos. */
export const fmtClock = (ts: number) => clock.format(ts)

export const fmtDateTime = (ts: number) => dateTime.format(ts)
