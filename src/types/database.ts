export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type SubscriptionStatus = 'scheduled' | 'active' | 'paused' | 'expired'
export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed' | 'no_show'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string | null
          phone: string | null
          role: 'admin' | 'client'
          notify_via: 'whatsapp' | 'gmail'
          birth_date: string | null // la edad se calcula desde acá (src/lib/age.ts); NULL en clientes antiguos
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          email?: string | null
          phone?: string | null
          role?: 'admin' | 'client'
          notify_via?: 'whatsapp' | 'gmail'
          birth_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string
          email?: string | null
          phone?: string | null
          role?: 'admin' | 'client'
          notify_via?: 'whatsapp' | 'gmail'
          birth_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          name: string
          classes_per_month: number
          price_monthly: number
          is_trial: boolean // plan de prueba: classes_per_month en total, no por cuota
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          classes_per_month: number
          price_monthly: number
          is_trial?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          classes_per_month?: number
          price_monthly?: number
          is_trial?: boolean
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          client_id: string
          plan_id: string
          start_date: string
          end_date: string
          status: SubscriptionStatus
          /** @deprecated legado: congelado desde 2026-10-05. El saldo real está en la vista subscription_class_balance. */
          classes_remaining: number
          reset_day: number
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          plan_id: string
          start_date: string
          end_date?: string // la calcula el trigger subscriptions_set_end_date (start_date + 3 meses)
          status?: SubscriptionStatus
          classes_remaining?: number // legado (default 0); el saldo real sale de subscription_class_balance
          reset_day?: number
          created_at?: string
        }
        Update: {
          plan_id?: string
          start_date?: string
          end_date?: string
          status?: SubscriptionStatus
          classes_remaining?: number
          reset_day?: number
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'subscriptions_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'plans'
            referencedColumns: ['id']
          }
        ]
      }
      payments: {
        Row: {
          id: string
          client_id: string
          subscription_id: string
          amount: number
          month: string
          due_date: string // "vencido" se calcula: status = 'pending' y due_date < hoy
          status: 'pending' | 'paid' | 'overdue'
          paid_at: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          subscription_id: string
          amount: number
          month: string
          due_date?: string // por defecto = month (trigger)
          status?: 'pending' | 'paid' | 'overdue'
          paid_at?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          amount?: number
          due_date?: string
          status?: 'pending' | 'paid' | 'overdue'
          paid_at?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'payments_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      class_adjustments: {
        Row: {
          id: string
          subscription_id: string
          quantity: number // + suma clases, - resta
          reason: string
          booking_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          subscription_id: string
          quantity: number
          reason: string
          booking_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          quantity?: number
          reason?: string
          booking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'class_adjustments_subscription_id_fkey'
            columns: ['subscription_id']
            isOneToOne: false
            referencedRelation: 'subscriptions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'class_adjustments_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          }
        ]
      }
      time_blocks: {
        Row: {
          id: string
          start_time: string
          end_time: string
          max_capacity: number
          current_count: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          start_time: string
          end_time: string
          max_capacity?: number
          current_count?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          start_time?: string
          end_time?: string
          max_capacity?: number
          current_count?: number
          is_active?: boolean
        }
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          client_id: string
          time_block_id: string
          status: BookingStatus
          rejection_reason: string | null
          notified_at: string | null
          reminder_sent: boolean
          late_cancel: boolean // cancelada con < 4 h de anticipación: cuenta como clase usada (lo fija un trigger)
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          time_block_id: string
          status?: BookingStatus
          rejection_reason?: string | null
          notified_at?: string | null
          reminder_sent?: boolean
          late_cancel?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: BookingStatus
          rejection_reason?: string | null
          notified_at?: string | null
          reminder_sent?: boolean
          late_cancel?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'bookings_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'bookings_time_block_id_fkey'
            columns: ['time_block_id']
            isOneToOne: false
            referencedRelation: 'time_blocks'
            referencedColumns: ['id']
          }
        ]
      }
      routines: {
        Row: {
          id: string
          client_id: string
          name: string
          description: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          name: string
          description?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'routines_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      exercises: {
        Row: {
          id: string
          routine_id: string
          name: string
          sets: number | null
          reps: string | null
          suggested_weight: string | null
          notes: string | null
          order_index: number
        }
        Insert: {
          id?: string
          routine_id: string
          name: string
          sets?: number | null
          reps?: string | null
          suggested_weight?: string | null
          notes?: string | null
          order_index?: number
        }
        Update: {
          name?: string
          sets?: number | null
          reps?: string | null
          suggested_weight?: string | null
          notes?: string | null
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: 'exercises_routine_id_fkey'
            columns: ['routine_id']
            isOneToOne: false
            referencedRelation: 'routines'
            referencedColumns: ['id']
          }
        ]
      }
      training_logs: {
        Row: {
          id: string
          client_id: string
          booking_id: string | null
          routine_id: string | null
          log_date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          booking_id?: string | null
          routine_id?: string | null
          log_date: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          booking_id?: string | null
          routine_id?: string | null
          log_date?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'training_logs_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      exercise_logs: {
        Row: {
          id: string
          training_log_id: string
          exercise_id: string | null
          exercise_name: string
          sets_done: number | null
          reps_done: string | null
          weight_used: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          training_log_id: string
          exercise_id?: string | null
          exercise_name: string
          sets_done?: number | null
          reps_done?: string | null
          weight_used?: string | null
          notes?: string | null
        }
        Update: {
          exercise_name?: string
          sets_done?: number | null
          reps_done?: string | null
          weight_used?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'exercise_logs_training_log_id_fkey'
            columns: ['training_log_id']
            isOneToOne: false
            referencedRelation: 'training_logs'
            referencedColumns: ['id']
          }
        ]
      }
      measurements: {
        Row: {
          id: string
          client_id: string
          measured_at: string
          weight_kg: number | null
          height_cm: number | null
          body_fat_pct: number | null
          biceps_mm: number | null
          triceps_mm: number | null
          subescapular_mm: number | null
          abdominal_mm: number | null
          suprailiaco_mm: number | null
          cuadricep_mm: number | null
          pantorrilla_mm: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          measured_at: string
          weight_kg?: number | null
          height_cm?: number | null
          body_fat_pct?: number | null
          biceps_mm?: number | null
          triceps_mm?: number | null
          subescapular_mm?: number | null
          abdominal_mm?: number | null
          suprailiaco_mm?: number | null
          cuadricep_mm?: number | null
          pantorrilla_mm?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          measured_at?: string
          weight_kg?: number | null
          height_cm?: number | null
          body_fat_pct?: number | null
          biceps_mm?: number | null
          triceps_mm?: number | null
          subescapular_mm?: number | null
          abdominal_mm?: number | null
          suprailiaco_mm?: number | null
          cuadricep_mm?: number | null
          pantorrilla_mm?: number | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'measurements_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      // Saldo de clases por suscripción (ver supabase/migrations/2026-10-05_05_*). Cada usuario ve
      // solo las suyas; el admin todas. Usar `available` donde antes se leía classes_remaining.
      subscription_class_balance: {
        Row: {
          subscription_id: string
          client_id: string
          plan_id: string
          plan_name: string
          status: SubscriptionStatus
          start_date: string
          end_date: string
          as_of: string
          is_unlimited: boolean
          plan_classes_per_month: number
          installments_started: number
          entitled: number | null
          adjustments: number
          used: number
          balance: number | null
          is_current: boolean
          available: number // 0 si no es vigente; 9999 si es ilimitado
          lost_classes: number
        }
        Relationships: []
      }
      subscription_history: {
        Row: {
          client_id: string
          subscription_id: string
          plan_name: string
          start_date: string
          end_date: string
          status: SubscriptionStatus
          effective_status: SubscriptionStatus
          entitled: number | null
          adjustments: number
          used: number
          balance: number | null
          lost_classes: number
          payments_paid: number
          payments_pending: number
          payments_overdue: number
        }
        Relationships: []
      }
    }
    Functions: {
      generate_time_blocks: {
        Args: { p_start_date: string; p_end_date: string; p_timezone?: string }
        Returns: number
      }
      monthly_classes_reset: {
        Args: Record<string, never>
        Returns: void
      }
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      adjust_my_subscription_classes: {
        Args: { p_subscription_id: string; p_delta: number }
        Returns: boolean
      }
      book_time_block: {
        Args: { p_time_block_id: string }
        Returns: string
      }
      complete_past_bookings: {
        Args: Record<string, never>
        Returns: number
      }
      roll_subscriptions: {
        Args: Record<string, never>
        Returns: number
      }
      /** @deprecated nada la llama desde 2026-10-05; el saldo se deriva de subscription_class_balance */
      decrement_subscription_classes: {
        Args: { p_client_id: string }
        Returns: boolean
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// Tipos de conveniencia
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Plan = Database['public']['Tables']['plans']['Row']
export type Subscription = Database['public']['Tables']['subscriptions']['Row']
export type Payment = Database['public']['Tables']['payments']['Row']
export type TimeBlock = Database['public']['Tables']['time_blocks']['Row']
export type Booking = Database['public']['Tables']['bookings']['Row']
export type Routine = Database['public']['Tables']['routines']['Row']
export type Exercise = Database['public']['Tables']['exercises']['Row']
export type TrainingLog = Database['public']['Tables']['training_logs']['Row']
export type ExerciseLog = Database['public']['Tables']['exercise_logs']['Row']
export type Measurement = Database['public']['Tables']['measurements']['Row']
export type ClassAdjustment = Database['public']['Tables']['class_adjustments']['Row']
export type SubscriptionClassBalance = Database['public']['Views']['subscription_class_balance']['Row']
export type SubscriptionHistoryRow = Database['public']['Views']['subscription_history']['Row']
