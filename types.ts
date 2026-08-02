
export enum Market {
  TW = 'TW',
  US = 'US',
  FUND = 'FUND',
  BOND = 'BOND',
  COMMODITY = 'COMMODITY'
}

export type MarketFilter = Market | 'ALL';

export type CostMethod = 'AVG' | 'FIFO';

export enum TransactionType {
  BUY = 'BUY',
  SELL = 'SELL',
  DIVIDEND = 'DIVIDEND',
  SPLIT = 'SPLIT'
}

export interface DCASetting {
  accountId: string;
  dates: number[];
  amount?: number;
  autoDeduct?: boolean;
}

export interface Stock {
  id: string;
  ticker: string;
  name: string;
  market: Market;
  category?: string;
  currentPrice?: number;
  lastUpdateDate?: string;
  sma20BreakdownDate?: string;
  ema50BreakdownDate?: string;
  ema100BreakdownDate?: string;
  sma20?: number;
  ema50?: number;
  ema100?: number;
  postMarketPrice?: number;
  preMarketPrice?: number;
  previousClose?: number; // 昨收，用於計算當日漲跌
  marketState?: string;
  note?: string; 
  hidden?: boolean;
  currency?: 'TWD' | 'USD'; 
  accountId?: string;
  // New field for Monthly Goal
  monthlyTarget?: number;      // Monthly investment target amount

  isTenX?: boolean;

  // Strategy Isolation
  strategy?: 'TENX';

  // New fields for 10x Strategy
  isTenXCandidate?: boolean;
  tenXTargetPrice?: number;
  tenXBuyPrice?: number; // Added for independent stat tracking
  tenXShares?: number;   // Added for independent stat tracking
  nav?: number; // 淨值
  
  strategyDate?: string;

  dcaDates?: number[];         // Legacy: Simple list (kept for backward compatibility)
  dcaSettings?: DCASetting[];  // New: Account-specific DCA dates
  dividendMonths?: number[];   // New: Dividend distribution months (1-12)
}

export interface StockPerformanceRecord {
  id: string;
  stockId: string;
  recordDate: string; 
  startDate: string;
  endDate: string;
  mode: 'PRICE' | 'ADJ';
  startPrice: number;
  endPrice: number;
  dividends: number;
  returnRate: number;
  totalDiff: number; 
  note?: string;
}

export interface Account {
  id: string;
  name: string;
  isSecurities?: boolean;
  isCash?: boolean;
  excludeFromTotals?: boolean;
  linkedCashAccountId?: string;
  username?: string; 
  password?: string; 
}

export interface Transaction {
  id: string;
  date: string;
  accountId: string;
  stockId: string;
  type: TransactionType;
  price: number;
  quantity: number;
  fee?: number;
  tax?: number;
  exchangeRate?: number;
  note?: string;
  exDividendDate?: string;
  paymentDate?: string;
  settlementDate?: string;
  isDCA?: boolean;
  dcaOriginalDate?: string;
  isDRIP?: boolean;
  isTenX?: boolean;
  dividendAccountId?: string;
  tenXSubStrategy?: 'WEEKLY' | 'MONTHLY';
}

export type CashTransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'INTEREST' | 'ADJUSTMENT';

export interface CashTransaction {
  id: string;
  date: string;
  accountId: string;
  type: CashTransactionType;
  amount: number;
  currency: 'TWD' | 'USD';
  note?: string;
  category?: string;
  subCategory?: string;
  exchangeRate?: number;
  sourceTransactionId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  fromAccountName?: string;
  toAccountName?: string;
  isCreditCardPayment?: boolean; 
  budgetId?: string; // Linked Budget Item ID
}

export interface RecurringCashRule {
  id: string;
  accountId: string;
  dayOfMonth: number; 
  amount: number;
  category: string;
  subCategory?: string;
  note: string;
  enabled: boolean;
  startDate?: string; 
  type?: 'WITHDRAWAL' | 'TRANSFER' | 'DEPOSIT'; 
  toAccountId?: string; 
  isHousehold?: boolean; 
  budgetId?: string;
  isCreditCardPayment?: boolean;
}

export interface BudgetItem {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  name: string;
  amount: number;
  note?: string;
}

export interface PortfolioItem {
  stock: Stock;
  totalShares: number;
  averageCost: number;
  totalCost: number;
  totalCostTWD?: number; 
  cycleInitialCost?: number;
  cycleInitialCostTWD?: number;
  marketValue: number;
  totalDividend: number;
  totalDividendTWD?: number;
  realizedGain: number;
  realizedGainTWD?: number;
  historicalRealizedGain?: number;
  historicalRealizedGainTWD?: number;
  historicalDividend?: number;
  historicalDividendTWD?: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  totalReturn: number;
  totalReturnPercent: number;
  costMethod?: CostMethod; 
}

export interface AssetSnapshot {
  date: string;
  totalCostTWD: number;
  totalMarketValueTWD: number;
  unrealizedPLTWD: number;
  todayDividendTWD?: number;
  subtotals?: {
    [Market.TW]?: SnapshotMetrics;
    [Market.US]?: SnapshotMetrics;
  };
}

export interface SnapshotMetrics {
  totalCostTWD: number;
  totalMarketValueTWD: number;
  unrealizedPLTWD: number;
  todayDividendTWD: number;
}

export type GeneralAssetType = 'ASSET' | 'LIABILITY';
export type AmortizationMethod = 'PRINCIPAL' | 'PRINCIPAL_INTEREST';
export type LoanType = 'CREDIT' | 'STOCK_PLEDGE';

export interface GeneralAssetItem {
  id: string;
  name: string;
  type: GeneralAssetType;
  category: string;
  value: number;
  note?: string;
  isLinked?: boolean;
  isExcluded?: boolean;
  projectedValue?: number;
  projectedWithoutDiv?: number;
  pendingDiv?: number;
  originalAmount?: number;
  monthlyPrincipal?: number;
  monthlyInterest?: number;
  interestRate?: number;
  amortizationMethod?: AmortizationMethod;
  customMonthlyPayment?: number;
  collateralValue?: number;
  loanDate?: string;
  maturityDate?: string;
  bank?: string;
  loanType?: LoanType;
  targetStockId?: string;
  pledgeLots?: number;
}

export interface CSVSettings {
    appTitle?: string;
    stockOrder?: string[];
    navOrder?: string[];
    autoSyncStartDate?: string;
    customCategories?: string[];
}

