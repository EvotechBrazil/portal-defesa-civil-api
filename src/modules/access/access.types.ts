import { AccessRequestStatus } from '@prisma/client';

export type WhatsappCheckStatus =
  | 'ALLOWED'
  | 'NOT_ALLOWED'
  | 'PENDING'
  | 'REJECTED'
  | 'REGISTERED';

export interface WhatsappCheckResult {
  status: WhatsappCheckStatus;
  whatsapp: string;
}

export interface AccessRequestView {
  id: string;
  whatsapp: string;
  name: string | null;
  lgndNumber: string | null;
  manada: string | null;
  email: string | null;
  justification: string | null;
  status: AccessRequestStatus;
  createdAt: Date;
  reviewedAt: Date | null;
}

export interface AllowedWhatsappView {
  id: string;
  whatsapp: string;
  label: string | null;
  createdAt: Date;
}

export interface SubmitAccessRequestResult {
  id: string;
  status: AccessRequestStatus;
}
