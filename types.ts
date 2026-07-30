
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
  // New fields for Dream Goals
  expectedReturnRate?: number; // Annualized return rate (percentage)
  targetYears?: number;        // Years to grow
  annualInvestment?: number;   // Annual contribution (original currency)
  // New field for Monthly Goal
  monthlyTarget?: number;      // Monthly investment target amount
  cheapPrice?: number;
  fairPrice?: number;
  expensivePrice?: number;
  
  isDynamicBalancing?: boolean;
  isLongTerm?: boolean;
  isShortTerm?: boolean;
  isTenX?: boolean;
  isNova?: boolean;
  novaPattern?: 'C1_BREAKOUT' | 'C2_READY' | 'C3_RETEST' | 'NONE';
  strategySetupTime?: string;

  // Strategy Isolation
  strategy?: 'DEFENSE' | 'TENX' | 'NOVA';

  // New fields for 10x Strategy
  isTenXCandidate?: boolean;
  tenXTargetPrice?: number;
  tenXBuyPrice?: number; // Added for independent stat tracking
  tenXShares?: number;   // Added for independent stat tracking
  nav?: number; // 淨值
  
  // Value Defense Strategy Fields
  strategyDate?: string;
  defenseBuyPrice?: number | string;
  defenseBuyFee?: number | string;
  defenseBuySettlementDate?: string;
  defenseStopLoss?: number | string;
  defenseActualShares?: number | string;
  defenseStatus?: 'active' | 'settled';
  defenseRealizedPnL?: number | string;

  // New defense sell tracking fields
  defenseSellStopLossPrice?: number | string;
  defenseSellStopLossDate?: string;
  defenseSellStopLossShares?: number | string;
  defenseSellStopLossSettlementDate?: string;
  defenseSellStopLossFee?: number | string;
  defenseSellStopLossTax?: number | string;

  defenseSellSma20Price?: number | string;
  defenseSellSma20Date?: string;
  defenseSellSma20Shares?: number | string;
  defenseSellSma20SettlementDate?: string;
  defenseSellSma20Fee?: number | string;
  defenseSellSma20Tax?: number | string;

  defenseSellEma50Price?: number | string;
  defenseSellEma50Date?: string;
  defenseSellEma50Shares?: number | string;
  defenseSellEma50SettlementDate?: string;
  defenseSellEma50Fee?: number | string;
  defenseSellEma50Tax?: number | string;

  defenseSellEma100Price?: number | string;
  defenseSellEma100Date?: string;
  defenseSellEma100Shares?: number | string;
  defenseSellEma100SettlementDate?: string;
  defenseSellEma100Fee?: number | string;
  defenseSellEma100Tax?: number | string;

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
  isDynamicBalancing?: boolean;
  isLongTerm?: boolean;
  isShortTerm?: boolean;
  isTenX?: boolean;
  dividendAccountId?: string;
  isNova?: boolean;
  novaPattern?: 'C1_BREAKOUT' | 'C2_READY' | 'C3_RETEST' | 'NONE';
  tenXSubStrategy?: 'WEEKLY' | 'MONTHLY';
  strategySetupTime?: string;
  stopLossPrice?: number;
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

export interface ETFHolding {
  symbol?: string;
  name: string;
  weight: number; // percentage
  shares?: number;
  value?: number;
  sector?: string;
}

export interface ETFDetails {
  ticker: string;
  name: string;
  updatedAt: string;
  holdings: ETFHolding[];
  category?: string;
  description?: string;
  expenseRatio?: number;
  yield?: number;
}

export interface NovaWatchlistItem {
  id: string;
  symbol: string;
  name: string;      // 股票名稱
  dateAdded: string; // 選入時間
  rangeHigh: number; // 區間高點股價
  rangeLow: number;  // 區間低點股價
  pattern: 'C1_BREAKOUT' | 'C2_READY' | 'C3_RETEST' | string; // 目前型態
  note?: string;     // 備註
}

export interface CSVSettings {
    appTitle?: string;
    stockOrder?: string[];
    navOrder?: string[];
    autoSyncStartDate?: string;
    customCategories?: string[];
}

export interface KLineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjOpen?: number;
  adjHigh?: number;
  adjLow?: number;
  adjClose?: number;
  foreign?: number;
  trust?: number;
  dealer?: number;
  marginBalance?: number;
  marginChange?: number;
  shortBalance?: number;
  shortChange?: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
  taiexTotalReturn?: number; // New: 加權報酬指數 (SYS IR0001)
  foreignTxNet?: number;
  foreignTxNetChange?: number;
  retailMtxNet?: number;
  retailMtxNetChange?: number;
  retailTmfNet?: number;
  retailTmfNetChange?: number;
  txOpen?: number;
  txHigh?: number;
  txLow?: number;
  txClose?: number;
  txVolume?: number;
}

export interface ChipData {
  date: string;
  foreign: number; 
  trust: number;   
  dealer: number;  
  total: number;
}

export type MAMode = 'SMA' | 'EMA' | 'WMA' | 'S-EMA';

export interface MASetting {
  period: number;
  visible: boolean;
  color: string;
  mode: MAMode;
}

export interface BollingerBandSetting {
  period: number;
  stdDev: number;
  color: string;
  visible: boolean;
}

export interface BollingerSettings {
  middle: { period: number; color: string; visible: boolean };
  upper1: BollingerBandSetting;
  lower1: BollingerBandSetting;
  upper2: BollingerBandSetting;
  lower2: BollingerBandSetting;
}

export interface HorizontalLineSetting {
  id: string;
  value: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  visible: boolean;
}

export interface TechSettings {
  mas: MASetting[];
  kd: { period: number };
  macd: { fast: number; slow: number; signal: number };
  rsi: { period: number };
  jr?: { 
    jPeriod: number; 
    rsiPeriod: number; 
    normalizePeriod?: number; 
    smoothMode?: 'SMA' | 'EMA' | 'S-EMA'; 
    trendPeriod?: number;
    strategyMode?: 'SWING' | 'ACCUMULATE';
    maDefensePeriod?: number;
    maDefenseMode?: 'SMA' | 'EMA' | 'WMA' | 'S-EMA';
    accJrJThresh?: number;
    accJrRsiThresh1?: number;
    accJrRsiThresh2?: number;
    accCooldownDays?: number;
    accPriceDropThresh?: number;
    swingKdThreshBuy?: number;
    swingJrRsiThreshBuy?: number;
    swingKdThreshBreakout?: number;
    swingKdThreshOversold?: number;
    swingJrJThreshOversold?: number;
    swingJrRsiThreshOversold?: number;
    swingKdThreshSell?: number;
    swingJrRsiThreshSell?: number;
    swingMaStopLossDrop?: number;
    swingKdThreshWeak?: number;
    swingJrRsiThreshWeak?: number;
  };
  bbw?: { period: number; stdDev: number; color: string; visible: boolean };
  bollinger?: BollingerSettings;
  rangeAnalysis: { period: number; tolerance?: number };
  bias?: { period: number; mode: 'SMA' | 'EMA'; visible: boolean };
  bias2?: { period: number; mode: 'SMA' | 'EMA'; visible: boolean };
  horizontalLines?: HorizontalLineSetting[];
}
