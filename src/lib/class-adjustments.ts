// Motivos de los ajustes de clases. Viven acá (no en el archivo de server actions) porque un
// archivo 'use server' solo puede exportar funciones async.
export const ADJUSTMENT_REASONS = ['recuperación', 'cortesía', 'corrección', 'arrastre', 'otro'] as const
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]
export type RefundReason = 'reagendada' | 'excepción'
