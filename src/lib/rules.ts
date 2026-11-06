// Fuente única del reglamento del gimnasio. Si cambias el texto de forma que los clientes deban
// volver a aceptarlo, sube RULES_VERSION: a quien tenga una versión menor le reaparece el aviso.
export const RULES_VERSION = 1

export type Rule = { text: string; example?: string }
export type RuleCategory = { title: string; rules: Rule[] }

export const RULES_FULL: RuleCategory[] = [
  {
    title: 'Reservas y asistencia',
    rules: [
      {
        text: 'Reserva tus clases con al menos 12 horas de anticipación.',
        example: 'Ejemplo: si quieres venir a las 19:00, tienes que reservar a más tardar a las 07:00 de ese mismo día.',
      },
      { text: 'Llega puntual: la clase empieza y termina a la hora acordada.' },
      { text: 'Si llegas tarde, espero máximo 10 minutos. Pasado ese tiempo, la clase se considera no asistida y se descuenta.' },
    ],
  },
  {
    title: 'Cancelaciones',
    rules: [
      { text: 'Puedes cancelar hasta 4 horas antes sin que se descuente la clase.' },
      { text: 'Si cancelas con menos de 4 horas, o no llegas y no avisas, la clase se descuenta.' },
      { text: 'Si te surge algo especial, avísame por WhatsApp y lo conversamos.' },
    ],
  },
  {
    title: 'Tu plan y pagos',
    rules: [
      { text: 'Tu plan dura 3 meses y las clases que no uses se acumulan hasta que termine. Después de esa fecha no se arrastran.' },
      { text: 'Pagas en 3 cuotas mensuales, cada una con su fecha de vencimiento en la app.' },
    ],
  },
  {
    title: 'El espacio',
    rules: [
      { text: 'Somos máximo 3 personas por horario, así que cada clase es un cupo que otra persona no puede usar.' },
      { text: 'Cuida los equipos y déjalos en su lugar al terminar. Trae una toalla y una botella de agua.' },
    ],
  },
]

// Versión corta (tarjeta del dashboard).
export const RULES_SHORT: string[] = [
  'Reserva con 12 horas de anticipación.',
  'Cancela hasta 4 horas antes y no se descuenta.',
  'Llega puntual: espero máximo 10 minutos.',
  'Tus clases se acumulan hasta que termina tu plan de 3 meses.',
]

// NULL (clientes que nunca aceptaron) cuenta como versión 0.
export function needsRulesAcceptance(acceptedVersion: number | null | undefined) {
  return (acceptedVersion ?? 0) < RULES_VERSION
}
