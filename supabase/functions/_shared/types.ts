export type EmailType =
  | 'welcome'
  | 'order_confirmation'
  | 'payment_approved'
  | 'order_shipped'
  | 'order_delivered'
  | 'password_recovery'
  | 'contact_received'
  | 'invoice_available'

// Types that don't require an authenticated user JWT
export const PUBLIC_EMAIL_TYPES = new Set<EmailType>(['contact_received'])

export interface EmailPayload {
  to: string
  type: EmailType
  data: Record<string, unknown>
}

export interface OrderItem {
  nombre_producto: string
  sku?: string | null
  cantidad: number
  precio_unitario: number
}

export interface OrderData {
  numero: string
  cliente_nombre?: string | null
  cliente_email?: string | null
  estado?: string
  metodo_pago?: string
  pago_estado?: string
  metodo_envio?: string
  subtotal?: number
  descuento?: number
  costo_envio?: number
  total?: number
  items?: OrderItem[]
  tracking_code?: string | null
  numero_seguimiento?: string | null
  eta?: string | null
  created_at?: string
}

export interface WelcomeData {
  nombre?: string | null
  email?: string
}

export interface ContactData {
  nombre: string
  email: string
  telefono?: string
  tipo?: string
  rubro?: string
  asunto?: string
  mensaje: string
  motivo?: string
  submitted_at?: string
}

export interface PasswordRecoveryData {
  nombre?: string | null
  email: string
}

export interface InvoiceData {
  numero: string
  cliente_nombre?: string | null
  total?: number
  created_at?: string
}

export interface TemplateResult {
  subject: string
  html: string
}
