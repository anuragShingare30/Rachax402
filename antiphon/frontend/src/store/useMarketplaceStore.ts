import { create } from 'zustand';

export type ServiceType = 'analyze' | 'store' | 'retrieve';

export interface AgentInfo {
  address: string;
  reputation: number;
  totalRatings: number;
  serviceName: string;
}

export interface AnalysisResults {
  summary: string;
  statistics: {
    rowCount: number;
    columnCount: number;
    numericalStats: Record<
      string,
      {
        mean: number;
        median: number;
        stdDev: number;
        min: number;
        max: number;
      }
    >;
  };
  insights: string[];
  resultCID: string;
}

export interface StorageResults {
  cid: string;
  fileName: string;
  fileSize: number;
  retrievedDataBase64?: string;
  retrievedContentType?: string;
}

export interface Step {
  id: number;
  label: string;
  icon: string;
  protocol: 'emerald' | 'indigo' | 'orange' | 'violet' | 'green';
  desc: string;
}

// ── analysisSteps (1-6) maps to coordinator stepNums ──────────────────────────
export const analysisSteps: Step[] = [
  { id: 1, label: 'Submitted',  icon: '📤', protocol: 'orange',  desc: 'Task sent to AgentA' },
  { id: 2, label: 'Discovery',  icon: '🔍', protocol: 'emerald', desc: 'ERC-8004 on-chain lookup' },
  { id: 3, label: 'Payment',    icon: '💳', protocol: 'indigo',  desc: 'AgentA pays via x402' },
  { id: 4, label: 'Processing', icon: '⚙️', protocol: 'violet',  desc: 'AgentB analyzing CSV' },
  { id: 5, label: 'Reputation', icon: '⭐', protocol: 'emerald', desc: 'Rating posted on-chain' },
  { id: 6, label: 'Results',    icon: '✅', protocol: 'green',   desc: 'Report ready' },
];

// ── storageSteps (1-4) maps to coordinator stepNums ───────────────────────────
export const storageSteps: Step[] = [
  { id: 1, label: 'Submitted',  icon: '📤', protocol: 'orange',  desc: 'Task sent to AgentA' },
  { id: 2, label: 'Discovery',  icon: '🔍', protocol: 'emerald', desc: 'ERC-8004 on-chain lookup' },
  { id: 3, label: 'Payment',    icon: '💳', protocol: 'indigo',  desc: 'AgentA pays via x402' },
  { id: 4, label: 'Complete',   icon: '✅', protocol: 'green',   desc: 'File stored on IPFS' },
];

// ── PaymentContext kept for backwards compat (no longer used in main flow) ────
export interface PaymentContext {
  paymentRequired: string;
  url: string;
  forService: 'upload' | 'analyze';
  buildInit: () => RequestInit;
}

// ── State interface ───────────────────────────────────────────────────────────
interface MarketplaceState {
  service: ServiceType;
  currentStep: number;
  isProcessing: boolean;
  file: File | null;
  inputCID: string | null;
  resultCID: string | null;
  discoveredAgent: AgentInfo | null;
  analysisResults: AnalysisResults | null;
  storageResults: StorageResults | null;
  txHash: string | null;
  error: string | null;
  showRatingModal: boolean;
  paymentContext: PaymentContext | null;

  /** SSE live log lines from AgentA coordinator */
  liveLog: string[];

  // Actions
  setService: (s: ServiceType) => void;
  setCurrentStep: (step: number) => void;
  setIsProcessing: (v: boolean) => void;
  setFile: (f: File | null) => void;
  setInputCID: (cid: string | null) => void;
  setResultCID: (cid: string | null) => void;
  setDiscoveredAgent: (a: AgentInfo | null) => void;
  setAnalysisResults: (r: AnalysisResults | null) => void;
  setStorageResults: (r: StorageResults | null) => void;
  setTxHash: (h: string | null) => void;
  setError: (e: string | null) => void;
  setShowRatingModal: (v: boolean) => void;
  setPaymentContext: (ctx: PaymentContext | null) => void;

  /** Replace full live log (called on each SSE step event) */
  setLiveLog: (lines: string[]) => void;
  /** Append a single line to live log */
  appendLiveLog: (line: string) => void;

  reset: () => void;
}

// ── Initial state ─────────────────────────────────────────────────────────────
const initialState = {
  service: 'analyze' as ServiceType,
  currentStep: 0,
  isProcessing: false,
  file: null,
  inputCID: null,
  resultCID: null,
  discoveredAgent: null,
  analysisResults: null,
  storageResults: null,
  txHash: null,
  error: null,
  showRatingModal: false,
  paymentContext: null,
  liveLog: [] as string[],
};

// ── Store ─────────────────────────────────────────────────────────────────────
export const useMarketplaceStore = create<MarketplaceState>((set) => ({
  ...initialState,

  setService: (service) =>
    set({
      service,
      currentStep: 0,
      isProcessing: false,
      file: null,
      error: null,
      analysisResults: null,
      storageResults: null,
      txHash: null,
      liveLog: [],
    }),

  setCurrentStep:    (currentStep)    => set({ currentStep }),
  setIsProcessing:   (isProcessing)   => set({ isProcessing }),
  setFile:           (file)           => set({ file }),
  setInputCID:       (inputCID)       => set({ inputCID }),
  setResultCID:      (resultCID)      => set({ resultCID }),
  setDiscoveredAgent:(discoveredAgent)=> set({ discoveredAgent }),
  setAnalysisResults:(analysisResults)=> set({ analysisResults }),
  setStorageResults: (storageResults) => set({ storageResults }),
  setTxHash:         (txHash)         => set({ txHash }),
  setError:          (error)          => set({ error }),
  setShowRatingModal:(showRatingModal)=> set({ showRatingModal }),
  setPaymentContext: (paymentContext) => set({ paymentContext }),

  // SSE log actions
  setLiveLog:    (liveLog) => set({ liveLog }),
  appendLiveLog: (line)    => set((s) => ({ liveLog: [...s.liveLog, line] })),

  reset: () => set(initialState),
}));