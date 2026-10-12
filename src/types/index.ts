export type ColorMode = 'bw' | 'color';
export type SidesMode = 'single' | 'double';
export type PaperSize = 'A4' | 'A3' | 'A5' | 'Legal';
export type Orientation = 'portrait' | 'landscape';
export type Quality = 'draft' | 'normal' | 'high';
export type PagesPerSheet = 1 | 2 | 4 | 6;

export interface PrintOptions {
  color: ColorMode;
  sides: SidesMode;
  size: PaperSize;
  orient: Orientation;
  pps: PagesPerSheet;
  quality: Quality;
  copies: number;
  range: 'all' | 'custom';
  rangeText?: string;
  staple: boolean;
  collate: boolean;
}

export interface UploadedFileInfo {
  id: string;
  originalName: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  detectedPages: number;
  createdAt: string;
}

export interface PricingBreakdown {
  selectedPages: number;
  sheetsPerCopy: number;
  totalPaperSheets: number;
  pricePerPage: number;
  printPrice: number;
  staplePrice: number;
  totalPrice: number;
}

export type JobStatus = 
  | 'pending_payment'
  | 'payment_received'
  | 'queued'
  | 'sending_to_machine'
  | 'printing'
  | 'completed'
  | 'failed';

export interface PrintJob {
  jobCode: string;
  machineId: string;
  file: UploadedFileInfo;
  options: PrintOptions;
  pricing: PricingBreakdown;
  status: JobStatus;
  statusMessage: string;
  printedPages: number;
  totalPhysicalPages: number;
  paymentMethod: string;
  paymentId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface MachineInfo {
  id: string;
  name: string;
  location: string;
  isOnline: boolean;
  paperRemaining: number;
  maxPaperCapacity: number;
  tonerLevelPercent: number;
  lastHeartbeat: string;
}
