import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Market,
  Stock,
  Transaction,
  Account,
  MarketFilter,
  AssetSnapshot,
  TransactionType,
  GeneralAssetItem,
  CashTransaction,
  KLineData,
  TechSettings,
  RecurringCashRule,
  StockPerformanceRecord,
  BudgetItem,
} from "./types";
import {
  calculatePortfolio,
  generateId,
  calculateStockPerformance,
  fetchCurrentYahooQuote,
  fetchMADataForSymbol,
  fetchTWSEEtfDirect,
  getLocalTodayString,
  fetchFullTWMarketPriceMap,
  fetchTWRealtimeBatch,
  fetchFundNavByName,
} from "./utils";
import type { RealtimeQuote } from "./utils";
import StockManager from "./components/StockManager";
import AccountManager from "./components/AccountManager";
import TransactionForm from "./components/TransactionForm";
import TransactionList from "./components/TransactionList";
import Dashboard from "./components/Dashboard";
import DataTools from "./components/DataTools";
import AssetTrend from "./components/AssetTrend";
import GeneralAssetOverview from "./components/GeneralAssetOverview";
import HouseholdExpenses from "./components/HouseholdExpenses";
import MarketMonitor from "./components/MarketMonitor";
import BudgetOverview from "./components/BudgetOverview";
import TenXMarketStrategy from "./components/TenXMarketStrategy";
import {
  LayoutDashboard,
  List,
  Settings,
  Wallet,
  TrendingUp,
  Sparkles,
  FileJson,
  PieChart,
  ShoppingBag,
  RefreshCcw,
  Loader2,
  CheckCircle2,
  CandlestickChart,
  Lock,
  ArrowRight,
  HelpCircle,
  Table2,
  Target,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";

const STORAGE_KEY = "smartvest_data_v2";
const MOBILE_FILE_NAME = "smartvest_data.json";
const APP_PASSWORD_KEY = "smartvest_app_password";
const RECOVERY_KEY_KEY = "smartvest_recovery_key";

const DEFAULT_TECH_SETTINGS: TechSettings = {
  mas: [
    { period: 5, visible: true, color: "#fbce07", mode: "SMA" },
    { period: 10, visible: true, color: "#f97316", mode: "SMA" },
    { period: 20, visible: true, color: "#a855f7", mode: "SMA" },
    { period: 60, visible: true, color: "#3b82f6", mode: "SMA" },
    { period: 120, visible: false, color: "#10b981", mode: "SMA" },
    { period: 240, visible: false, color: "#94a3b8", mode: "SMA" },
  ],
  kd: { period: 9 },
  macd: { fast: 12, slow: 26, signal: 9 },
  rsi: { period: 14 },
  jr: {
    jPeriod: 14,
    rsiPeriod: 14,
    normalizePeriod: 60,
    smoothMode: "S-EMA",
    trendPeriod: 9,
    strategyMode: "SWING",
    maDefensePeriod: 60,
    maDefenseMode: "SMA",
    accJrJThresh: 10,
    accJrRsiThresh1: 50,
    accJrRsiThresh2: 45,
    accCooldownDays: 5,
    accPriceDropThresh: 0.03,
    swingKdThreshBuy: 65,
    swingJrRsiThreshBuy: 65,
    swingKdThreshBreakout: 80,
    swingKdThreshOversold: 25,
    swingJrJThreshOversold: 25,
    swingJrRsiThreshOversold: 35,
    swingKdThreshSell: 75,
    swingJrRsiThreshSell: 70,
    swingMaStopLossDrop: 0.995,
    swingKdThreshWeak: 50,
    swingJrRsiThreshWeak: 50,
  },
  bollinger: {
    middle: { period: 20, color: "#fbce07", visible: false },
    upper1: { period: 20, stdDev: 2.0, color: "#a855f7", visible: false },
    lower1: { period: 20, stdDev: 2.0, color: "#a855f7", visible: false },
    upper2: { period: 20, stdDev: 2.5, color: "#f97316", visible: false },
    lower2: { period: 20, stdDev: 2.5, color: "#f97316", visible: false },
  },
  bbw: { period: 20, stdDev: 2.0, color: "#3b82f6", visible: false },
  rangeAnalysis: { period: 60, tolerance: 0.03 },
  bias: { period: 20, mode: "SMA", visible: true },
  bias2: { period: 60, mode: "SMA", visible: true },
  horizontalLines: [],
};

declare global {
  interface Window {
    electronAPI?: {
      loadData: () => Promise<any>;
      saveData: (data: any) => Promise<{ success: boolean; error?: string }>;
      saveDataAs: (data: any) => Promise<{
        success: boolean;
        canceled?: boolean;
        filePath?: string;
        fileName?: string;
        error?: string;
      }>;
      openDataFile: () => Promise<{
        success: boolean;
        canceled?: boolean;
        data?: any;
        filePath?: string;
        fileName?: string;
        error?: string;
      }>;
      openBackupFolder: () => Promise<{ success: boolean; error?: string }>;
      fetchTWSE: () => Promise<any>;
      fetchYahooQuote: (symbol: string) => Promise<any>;
      fetchFearGreed: () => Promise<any>;
      fetchYahooSummary: (symbol: string) => Promise<any>;
      fetchETFHoldings: (symbol: string) => Promise<any>;
      fetchYahooHistory: (options: any) => Promise<any>;
      fetchFundNAV: (name: string) => Promise<any>;
      isElectron: boolean;
    };
  }
}

const NAV_ITEMS = [
  { id: "market", label: "趨勢分析", icon: CandlestickChart },
  { id: "overview", label: "總體資產概況", icon: PieChart },
  { id: "dashboard", label: "(股)資產總覽", icon: LayoutDashboard },
  { id: "trend", label: "報酬走勢", icon: TrendingUp },
  { id: "transactions", label: "(股)交易明細", icon: List },
  { id: "stocks", label: "股票管理", icon: Settings },
  { id: "tenx", label: "十倍大盤策略", icon: Target },
  { id: "accounts", label: "帳戶管理", icon: Wallet },
  { id: "budget", label: "基本收支總表", icon: Table2 },
  { id: "expenses", label: "家用記帳", icon: ShoppingBag },
  { id: "settings", label: "檔案存取", icon: FileJson },
];

import { useAutoDCA } from "./hooks/useAutoDCA";

const WelcomeScreen = ({
  onLogin,
  onReset,
}: {
  onLogin: (password: string) => boolean;
  onReset: (key: string) => boolean;
}) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [resetMsg, setResetMsg] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onLogin(password)) {
      setError(false);
    } else {
      setError(true);
      setTimeout(() => setError(false), 500);
    }
  };

  const handleRecovery = (e: React.FormEvent) => {
    e.preventDefault();
    if (onReset(recoveryKey)) {
      setResetMsg("密碼已重置為預設值: 1234");
      setIsForgot(false);
      setRecoveryKey("");
      setPassword("");
    } else {
      setResetMsg("還原碼錯誤");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-60"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1611974765215-0c71733e61bf?q=80&w=2070&auto=format&fit=crop')`,
          filter: "grayscale(20%) contrast(110%)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-0"></div>

      <div className="relative z-10 w-full max-w-md p-8 bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl animate-in fade-in zoom-in-95 duration-500">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl mb-4 shadow-lg shadow-amber-500/30">
            <TrendingUp size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">
            SmartVest
          </h1>
          <p className="text-slate-300 text-sm font-medium tracking-wide uppercase">
            Professional Asset Tracker
          </p>
        </div>

        {!isForgot ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative group">
              <Lock
                className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-amber-400 transition-colors"
                size={20}
              />
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(false);
                }}
                className={`w-full bg-black/40 border ${error ? "border-rose-500" : "border-white/10 focus:border-amber-400"} rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 outline-none transition-all font-mono text-lg tracking-widest`}
                placeholder="ENTER PASSWORD"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <span>UNLOCK SYSTEM</span>
              <ArrowRight size={18} />
            </button>
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => {
                  setIsForgot(true);
                  setResetMsg("");
                }}
                className="text-xs text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-1 mx-auto"
              >
                <HelpCircle size={12} /> 忘記密碼?
              </button>
            </div>
            {resetMsg && (
              <p className="text-center text-emerald-400 text-sm font-bold bg-emerald-500/10 py-2 rounded-lg border border-emerald-500/30">
                {resetMsg}
              </p>
            )}
          </form>
        ) : (
          <form
            onSubmit={handleRecovery}
            className="space-y-4 animate-in slide-in-from-right-4"
          >
            <div className="text-center text-white mb-4">
              <h3 className="font-bold text-lg">系統救援</h3>
              <p className="text-xs text-slate-400">
                請輸入救援還原碼以重置密碼
              </p>
            </div>
            <input
              type="password"
              autoFocus
              value={recoveryKey}
              onChange={(e) => {
                setRecoveryKey(e.target.value);
                setResetMsg("");
              }}
              className="w-full bg-black/40 border border-white/10 focus:border-blue-400 rounded-xl py-3 px-4 text-white placeholder-slate-500 outline-none transition-all text-center"
              placeholder="RECOVERY KEY"
            />
            <button
              type="submit"
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-all active:scale-95"
            >
              驗證還原
            </button>
            <button
              type="button"
              onClick={() => setIsForgot(false)}
              className="w-full text-slate-400 hover:text-white text-sm py-2"
            >
              返回登入
            </button>
            {resetMsg && (
              <p className="text-center text-rose-400 text-sm font-bold">
                {resetMsg}
              </p>
            )}
          </form>
        )}
      </div>

      <div className="absolute bottom-6 text-white/20 text-[10px] font-mono tracking-widest">
        SECURE FINANCIAL TERMINAL v4.8
      </div>
    </div>
  );
};

function App() {
  const [market, setMarket] = useState<MarketFilter>("ALL");
  const [activeTab, setActiveTab] = useState<
    | "market"
    | "overview"
    | "dashboard"
    | "transactions"
    | "stocks"
    | "accounts"
    | "trend"
    | "settings"
    | "expenses"
    | "budget"
    | "tenx"
  >("overview");

  const [isAppUnlocked, setIsAppUnlocked] = useState(false);
  const [appPassword, setAppPassword] = useState(
    () => localStorage.getItem(APP_PASSWORD_KEY) || "1234",
  );
  const [recoveryKey, setRecoveryKey] = useState(
    () => localStorage.getItem(RECOVERY_KEY_KEY) || "admin",
  );

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assetHistory, setAssetHistory] = useState<AssetSnapshot[]>([]);
  const [stockOrder, setStockOrder] = useState<string[]>([]);
  const [appTitle, setAppTitle] = useState("SmartVest");

  const [generalAssets, setGeneralAssets] = useState<GeneralAssetItem[]>([]);
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>(
    [],
  );
  const [householdTransactions, setHouseholdTransactions] = useState<
    CashTransaction[]
  >([]);
  const [recurringCashRules, setRecurringCashRules] = useState<
    RecurringCashRule[]
  >([]);
  const [performanceRecords, setPerformanceRecords] = useState<
    StockPerformanceRecord[]
  >([]);

  // New State for Budget
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem("smartvest_custom_categories");
    return saved
      ? JSON.parse(saved)
      : ["市值型ETF", "高股息型ETF", "債券型ETF"];
  });

  const [tenxStrategyConfig, setTenxStrategyConfig] = useState<{
    symbols: string[];
    enabledSymbols?: string[];
    priceData: Record<string, any>;
    dates: {
      p0: string;
      p1: string;
      p3: string;
      p6: string;
      w0?: string;
      w1?: string;
      w2?: string;
      w4?: string;
    };
    lastUpdated: string;
    totalCapital?: number;
    allocation?: {
      QLD: number;
      TLT: number;
      VT: number;
      CASH: number;
    };
    monthlyPeriods?: [number, number, number];
    weeklyPeriods?: [number, number, number];
  }>(() => {
    return {
      symbols: ["QQQ", "TLT", "VT"],
      enabledSymbols: ["QQQ", "TLT", "VT"],
      priceData: {},
      dates: { p0: "", p1: "", p3: "", p6: "" },
      lastUpdated: "",
      monthlyPeriods: [1, 3, 6],
      weeklyPeriods: [1, 2, 4],
      totalCapital: 1000000,
      allocation: {
        QLD: 100,
        TLT: 0,
        VT: 0,
        CASH: 0,
      },
    };
  });

  const [autoSyncStartDate, setAutoSyncStartDate] = useState<string>("");
  const [navOrder, setNavOrder] = useState<string[]>(
    NAV_ITEMS.map((i) => i.id),
  );
  const [exchangeRate, setExchangeRate] = useState<number>(32.5);
  const [marketSymbol, setMarketSymbol] = useState<string | null>(null);

  const [marketData, setMarketData] = useState<KLineData[]>([]);
  const [techSettings, setTechSettings] = useState<TechSettings>(
    DEFAULT_TECH_SETTINGS,
  );

  const [showTxForm, setShowTxForm] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [prefillStockId, setPrefillStockId] = useState<string | null>(null);
  const [prefillAccountId, setPrefillAccountId] = useState<string | null>(null);

  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [fileHandle, setFileHandle] = useState<any>(null);
  const [fileName, setFileName] = useState<string>("未儲存的專案");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isDesktopMode, setIsDesktopMode] = useState(false);
  const [isMobileMode, setIsMobileMode] = useState(false);
  const isElectronBrowser = useMemo(
    () => navigator.userAgent.toLowerCase().indexOf(" electron/") > -1,
    [],
  );
  const [isInitialized, setIsInitialized] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const [isGeneratingReports, setIsGeneratingReports] = useState(false);
  const [reportProgress, setReportProgress] = useState("");

  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navContainerRef = useRef<HTMLDivElement>(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollState = useCallback(() => {
    const el = navContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = navContainerRef.current;
    if (!el) return;
    checkScrollState();
    el.addEventListener("scroll", checkScrollState);
    window.addEventListener("resize", checkScrollState);
    const observer = new ResizeObserver(() => checkScrollState());
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", checkScrollState);
      window.removeEventListener("resize", checkScrollState);
      observer.disconnect();
    };
  }, [checkScrollState, navOrder]);

  const handleScrollNav = (direction: 'left' | 'right') => {
    if (navContainerRef.current) {
      const amount = direction === 'left' ? -280 : 280;
      navContainerRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  const mainStocks = useMemo(() => {
    return stocks;
  }, [stocks]);

  const activeTransactions = useMemo(() => {
    const excludedAccountIds = new Set(
      accounts.filter((a) => a.excludeFromTotals).map((a) => a.id),
    );
    return transactions.filter(
      (t) => !excludedAccountIds.has(String(t.accountId)),
    );
  }, [transactions, accounts]);

  const portfolio = useMemo(() => {
    return calculatePortfolio(mainStocks, activeTransactions);
  }, [mainStocks, activeTransactions]);

  const totalStockValueTWD = useMemo(() => {
    return portfolio.reduce((acc, item) => {
      const isUSD =
        item.stock.currency === "USD" ||
        (item.stock.market === Market.US && !item.stock.currency);
      return acc + (isUSD ? item.marketValue * exchangeRate : item.marketValue);
    }, 0);
  }, [portfolio, exchangeRate]);

  const activeCashTransactions = useMemo(() => {
    const excludedAccountIds = new Set(
      accounts.filter((a) => a.excludeFromTotals).map((a) => a.id),
    );
    return cashTransactions.filter(
      (t) => !excludedAccountIds.has(String(t.accountId)),
    );
  }, [cashTransactions, accounts]);

  const activeHouseholdTransactions = useMemo(() => {
    const excludedAccountIds = new Set(
      accounts.filter((a) => a.excludeFromTotals).map((a) => a.id),
    );
    return householdTransactions.filter(
      (t) => !excludedAccountIds.has(String(t.accountId)),
    );
  }, [householdTransactions, accounts]);

  const budgetTransactions = useMemo(() => {
    const householdSourceIds = new Set(
      activeHouseholdTransactions
        .map((t) => t.sourceTransactionId)
        .filter((id): id is string => !!id),
    );
    return [
      ...activeHouseholdTransactions,
      ...activeCashTransactions.filter((t) => !householdSourceIds.has(t.id)),
    ];
  }, [activeHouseholdTransactions, activeCashTransactions]);

  // [修改] 強化初始化邏輯
  useEffect(() => {
    const initData = async () => {
      try {
        const legacyMarket = localStorage.getItem("smartvest_market_data");
        if (legacyMarket) {
          const parsed = JSON.parse(legacyMarket);
          if (Array.isArray(parsed) && parsed.length > 0) setMarketData(parsed);
        }
        const legacySettings = localStorage.getItem(
          "smartvest_tech_settings_v2",
        );
        if (legacySettings) {
          setTechSettings(JSON.parse(legacySettings));
        }
      } catch (e) {}

      let dataLoadedFromDisk = false;
      const isDesktopEnv =
        window.electronAPI?.isElectron || window.location.protocol === "file:";
      if (isDesktopEnv) {
        setIsDesktopMode(true);
        setFileName("本機資料庫 (SmartVest_Data)");
        try {
          if (window.electronAPI) {
            const diskData = await window.electronAPI.loadData();
            if (diskData) {
              loadData(diskData);
              setSaveStatus("saved");
              dataLoadedFromDisk = true;
            }
          }
        } catch (e) {
          console.error("Init Error", e);
        }
      } else if (Capacitor.isNativePlatform()) {
        setIsMobileMode(true);
        setFileName("手機內部儲存");
        try {
          const result = await Filesystem.readFile({
            path: MOBILE_FILE_NAME,
            directory: Directory.Documents,
            encoding: Encoding.UTF8,
          });
          if (result.data) {
            loadData(JSON.parse(result.data as string));
            setSaveStatus("saved");
            dataLoadedFromDisk = true;
          }
        } catch (e) {}
      }

      // [關鍵修復]：如果已經從本機硬碟/隨身碟或手機成功載入資料，就不要再用 localStorage 覆蓋。
      // 這樣可以確保在不同電腦插上隨身碟使用時，不會被該電腦舊的 localStorage 覆蓋掉隨身碟內的新資料！
      if (!dataLoadedFromDisk) {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            loadData(JSON.parse(saved));
          } catch (e) {}
        }
      }

      setIsInitialized(true);
    };
    initData();
  }, []);

  // Cleanup orphaned sync transactions from stocks
  useEffect(() => {
    if (!isInitialized || transactions.length === 0) return;

    const validStockTxIds = new Set(transactions.map((t) => t.id));
    const cleanup = (prev: CashTransaction[]) => {
      const toRemoveIds = new Set(
        prev
          .filter((ct) => {
            if (!ct.sourceTransactionId) return false;
            const isSync =
              ct.note?.includes("(自動)") &&
              (ct.note?.startsWith("買進") ||
                ct.note?.startsWith("賣出") ||
                ct.note?.startsWith("領息"));
            return isSync && !validStockTxIds.has(ct.sourceTransactionId);
          })
          .map((t) => t.id),
      );
      if (toRemoveIds.size === 0) return prev;
      return prev.filter((t) => !toRemoveIds.has(t.id));
    };

    setCashTransactions((prev) => cleanup(prev));
    setHouseholdTransactions((prev) => cleanup(prev));
  }, [isInitialized, transactions]);

  // Retroactive Sync Effect: Fix missing transfers in Household Expenses
  useEffect(() => {
    if (!isInitialized) return;

    setHouseholdTransactions((prevHouse) => {
      const existingSourceIds = new Set(
        prevHouse.map((h) => h.sourceTransactionId).filter(Boolean),
      );
      const missingSyncs: CashTransaction[] = [];

      cashTransactions.forEach((cashTx) => {
        // Check if this is a Transfer or Manual Adjustment that should be in household
        // Criteria: Category is '轉帳' OR it is a Transfer type transaction
        const isTransfer =
          cashTx.category === "轉帳" || cashTx.note?.includes("轉帳");

        if (isTransfer && !existingSourceIds.has(cashTx.id)) {
          missingSyncs.push({
            ...cashTx,
            id: generateId(),
            sourceTransactionId: cashTx.id,
            note: (cashTx.note || "") + " (補步同步)",
            category: "轉帳",
          });
        }
      });

      if (missingSyncs.length > 0) {
        console.log(
          `[SmartVest] Auto-Synced ${missingSyncs.length} missing transfer records to Household.`,
        );
        return [...prevHouse, ...missingSyncs];
      }
      return prevHouse;
    });
  }, [isInitialized, cashTransactions.length]);

  const attemptedReports = useRef<Set<string>>(new Set());

  // ... (Other useEffects for Reports, Recurring Rules remain same) ...
  useEffect(() => {
    if (!isInitialized || isGeneratingReports || stocks.length === 0) return;

    const checkAndGenerateReports = async () => {
      const now = new Date();
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const year = lastMonthEnd.getFullYear();
      const month = (lastMonthEnd.getMonth() + 1).toString().padStart(2, "0");
      const day = lastMonthEnd.getDate().toString().padStart(2, "0");
      const reportDate = `${year}-${month}-${day}`;

      const activeStockIds = new Set<string>();
      // Use locally calculated portfolio if possible or calculate here
      const currentPortfolio = calculatePortfolio(stocks, transactions);
      currentPortfolio
        .filter((p) => p.totalShares > 0)
        .forEach((p) => activeStockIds.add(p.stock.id));

      if (activeStockIds.size === 0) return;

      const missingStocks = stocks.filter((s) => {
        if (!activeStockIds.has(s.id)) return false;
        
        const attemptKey = `${s.id}_${reportDate}`;
        if (attemptedReports.current.has(attemptKey)) return false;

        if (
          performanceRecords.some(
            (r) => r.stockId === s.id && r.recordDate === reportDate,
          )
        )
          return false;

        // 跳過基金標的 (因為一般不進行 Yahoo Finance 的技術分析或月結報表)
        const isProbablyFund =
          s.market === Market.FUND ||
          ((s.category?.includes("基金") || s.name?.includes("基金")) &&
            !/^[0-9]{4,6}[A-Z]?(\.TW|\.TWO)?$/i.test(s.ticker) &&
            !/^[A-Z]{1,5}$/.test(s.ticker));

        return !isProbablyFund;
      });

      if (missingStocks.length === 0) return;

      setIsGeneratingReports(true);
      const newRecords: StockPerformanceRecord[] = [];

      for (let i = 0; i < missingStocks.length; i++) {
        const stock = missingStocks[i];
        
        const attemptKey = `${stock.id}_${reportDate}`;
        attemptedReports.current.add(attemptKey);
        
        setReportProgress(
          `補產月結報表 ${reportDate}: ${stock.name} (${i + 1}/${missingStocks.length})`,
        );

        const result = await calculateStockPerformance(
          stock,
          "2000-01-01",
          reportDate,
        );

        if (result.success && result.returnRate !== undefined) {
          newRecords.push({
            id: generateId(),
            stockId: stock.id,
            recordDate: reportDate,
            startDate: result.actualStartDate || "2000-01-01",
            endDate: reportDate,
            mode: "ADJ",
            startPrice: result.startPrice || 0,
            endPrice: result.endPrice || 0,
            dividends: 0,
            returnRate: result.returnRate,
            totalDiff: result.totalDiff || 0,
            note: "系統自動月結 (還原權值)",
          });
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (newRecords.length > 0) {
        setPerformanceRecords((prev) => [...prev, ...newRecords]);
      }
      setIsGeneratingReports(false);
      setReportProgress("");
    };

    const timeout = setTimeout(checkAndGenerateReports, 3000);
    return () => clearTimeout(timeout);
  }, [isInitialized, stocks, transactions, performanceRecords]);

  useEffect(() => {
    if (!isInitialized || recurringCashRules.length === 0) return;

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();
    const yearMonthKey = `${currentYear}_${currentMonth.toString().padStart(2, "0")}`;

    let newInvestTxs: CashTransaction[] = [];
    let newHouseTxs: CashTransaction[] = [];

    recurringCashRules.forEach((rule) => {
      if (!rule.enabled) return;

      if (currentDay >= rule.dayOfMonth) {
        const expectedSourceId = `auto_rec_${rule.id}_${yearMonthKey}`;

        const targetList = rule.isHousehold
          ? householdTransactions
          : cashTransactions;
        const exists = targetList.some(
          (tx) => tx.sourceTransactionId === expectedSourceId,
        );

        if (!exists) {
          const txDate = `${currentYear}-${currentMonth.toString().padStart(2, "0")}-${rule.dayOfMonth.toString().padStart(2, "0")}`;

          if (rule.startDate && txDate < rule.startDate) return;

          const baseTx = {
            date: txDate,
            amount: rule.amount,
            currency: "TWD" as const,
            sourceTransactionId: expectedSourceId,
          };

          if (rule.type === "TRANSFER" && rule.toAccountId) {
            const txOut: CashTransaction = {
              ...baseTx,
              id: generateId(),
              accountId: rule.accountId,
              type: "WITHDRAWAL",
              category: "轉帳",
              note: `${rule.note} (固定轉帳出)`,
              toAccountId: rule.toAccountId,
            };
            const txIn: CashTransaction = {
              ...baseTx,
              id: generateId(),
              accountId: rule.toAccountId,
              type: "DEPOSIT",
              category: "轉帳",
              note: `${rule.note} (固定轉帳入)`,
              sourceTransactionId: expectedSourceId + "_IN",
              fromAccountId: rule.accountId,
            };

            if (rule.isHousehold) {
              newHouseTxs.push(txOut, txIn);
            } else {
              newInvestTxs.push(txOut, txIn);
            }
          } else {
            const ruleType = rule.type || "WITHDRAWAL";
            const txType = ruleType === "DEPOSIT" ? "DEPOSIT" : "WITHDRAWAL";
            const suffix =
              ruleType === "DEPOSIT" ? "(每月固定入帳)" : "(每月固定扣款)";

            const tx: CashTransaction = {
              ...baseTx,
              id: generateId(),
              accountId: rule.accountId,
              type: txType,
              category: rule.category,
              subCategory: rule.subCategory,
              note: `${rule.note} ${suffix}`,
              budgetId: rule.budgetId, // Pass linkage
              isCreditCardPayment: rule.isCreditCardPayment,
            };
            if (rule.isHousehold) {
              newHouseTxs.push(tx);
            } else {
              newInvestTxs.push(tx);
            }
          }
        }
      }
    });

    if (newInvestTxs.length > 0) {
      setCashTransactions((prev) => [...prev, ...newInvestTxs]);
      // Also sync investment recurring txs to household
      const syncedHouseTxs = newInvestTxs.map((tx) => ({
        ...tx,
        id: generateId(),
        sourceTransactionId: tx.id,
        note: (tx.note || "") + " (資產連動)",
        category: tx.category, // Keep as '轉帳' if it is a transfer
      }));
      setHouseholdTransactions((prev) => [...prev, ...syncedHouseTxs]);
    }
    if (newHouseTxs.length > 0) {
      setHouseholdTransactions((prev) => [...prev, ...newHouseTxs]);
    }
  }, [
    recurringCashRules,
    cashTransactions,
    householdTransactions,
    isInitialized,
  ]);

  // --- Auto DCA for Stocks ---
  useEffect(() => {
    if (!isInitialized || stocks.length === 0) return;
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();
    
    let newStockTxs: Transaction[] = [];
    let newCashTxs: CashTransaction[] = [];
    let newHouseTxs: CashTransaction[] = [];

    stocks.forEach(stock => {
      // Ensure we only process if there is a monthlyTarget and stock is not hidden
      if (!stock.monthlyTarget || stock.hidden) return;

      const settings = stock.dcaSettings || (stock.dcaDates ? [{ accountId: 'UNASSIGNED', dates: stock.dcaDates }] : []);
      if (settings.length > 0) {
        
        let totalDates = 0;
        settings.forEach(s => { totalDates += s.dates.length });
        if (totalDates === 0) return;
        
        const amountPerDeduction = stock.monthlyTarget / totalDates;
        

        settings.forEach(setting => {
            let targetAccount = accounts.find(a => a.id === setting.accountId);
            let targetAccountId = setting.accountId;
            if (!targetAccount || targetAccountId === 'UNASSIGNED') {
                targetAccount = accounts.find(a => a.isSecurities && !a.excludeFromTotals);
                if (targetAccount) targetAccountId = targetAccount.id;
                else return; 
            }

            setting.dates.forEach(dcaDay => {
               if (currentDay >= dcaDay) {
                  const txDate = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${dcaDay.toString().padStart(2, '0')}`;
                  
                  // Enforce minimum start date of 2026-07-20 as requested
                  if (txDate < '2026-07-20') return;
                  if (autoSyncStartDate && txDate < autoSyncStartDate) return;

                  const existingStockTx = transactions.find(tx => 
                       tx.stockId === stock.id && 
                       tx.accountId === targetAccountId &&
                       tx.isDCA === true &&
                      (tx.dcaOriginalDate === txDate || tx.date === txDate)
                  );
                  
                  const isUS = stock.currency === "USD" || (stock.market === Market.US && !stock.currency);
                  let totalAmount = Math.round(isUS ? amountPerDeduction * exchangeRate : amountPerDeduction);
                  
                  let targetCashAccountId = targetAccount!.linkedCashAccountId || targetAccount!.id;
                  let targetCashAccountName = targetAccount!.name;

                  if (!existingStockTx) {
                      const price = stock.currentPrice || stock.nav || 1;
                      const quantity = amountPerDeduction / price;
                      
                      const txId = generateId();
                      newStockTxs.push({
                          id: txId,
                          date: txDate,
                          settlementDate: txDate,
                          accountId: targetAccountId,
                          stockId: stock.id,
                          type: TransactionType.BUY,
                          price: price,
                          quantity: quantity,
                          isDCA: true,
                          dcaOriginalDate: txDate,
                          note: '定期定額自動買進'
                      });

                      newCashTxs.push({
                          id: generateId(),
                          date: txDate,
                          accountId: targetCashAccountId,
                          type: "WITHDRAWAL",
                          amount: totalAmount,
                          currency: "TWD",
                          category: `買進 ${stock.ticker}`,
                          note: `買進 ${stock.name} (自動)`,
                          sourceTransactionId: txId,
                      });

                      newHouseTxs.push({
                          id: generateId(),
                          date: txDate,
                          accountId: targetCashAccountName,
                          type: "WITHDRAWAL",
                          amount: totalAmount,
                          currency: "TWD",
                          category: "投資支出",
                          note: `買進 ${stock.name} (自動) - 連動`,
                          sourceTransactionId: txId,
                      });
                  } else {
                      // Self-healing: if stock tx exists but cash/house txs are missing, add them
                      const existingCashTxDate = existingStockTx.settlementDate || existingStockTx.date;
                      const cashExists = cashTransactions.some(c => c.sourceTransactionId === existingStockTx.id);
                      if (!cashExists) {
                          newCashTxs.push({
                              id: generateId(),
                              date: existingCashTxDate,
                              accountId: targetCashAccountId,
                              type: "WITHDRAWAL",
                              amount: totalAmount,
                              currency: "TWD",
                              category: `買進 ${stock.ticker}`,
                              note: `買進 ${stock.name} (自動)`,
                              sourceTransactionId: existingStockTx.id,
                          });
                      }

                      const houseExists = householdTransactions.some(h => h.sourceTransactionId === existingStockTx.id);
                      if (!houseExists) {
                          newHouseTxs.push({
                              id: generateId(),
                              date: existingCashTxDate,
                              accountId: targetCashAccountName,
                              type: "WITHDRAWAL",
                              amount: totalAmount,
                              currency: "TWD",
                              category: "投資支出",
                              note: `買進 ${stock.name} (自動) - 連動`,
                              sourceTransactionId: existingStockTx.id,
                          });
                      }
                  }
               }
            });
        });
      }
    });

    if (newStockTxs.length > 0 || newCashTxs.length > 0 || newHouseTxs.length > 0) {
       if (newStockTxs.length > 0) setTransactions(prev => [...prev, ...newStockTxs]);
       if (newCashTxs.length > 0) setCashTransactions(prev => [...prev, ...newCashTxs]);
       if (newHouseTxs.length > 0) setHouseholdTransactions(prev => [...prev, ...newHouseTxs]);
    }
  }, [stocks, transactions, cashTransactions, householdTransactions, isInitialized, accounts, autoSyncStartDate, exchangeRate]);
  // Helper function for saving data (used in useEffect and initial load)
  const getExportData = useCallback(
    () => ({
      stocks,
      transactions,
      accounts,
      exchangeRate,
      assetHistory,
      stockOrder,
      appTitle,
      generalAssets,
      cashTransactions,
      householdTransactions,
      autoSyncStartDate,
      navOrder,
      marketData,
      techSettings,
      recurringCashRules,
      performanceRecords,
      budgetItems,
      appPassword,
      recoveryKey,
      customCategories,
      tenxStrategyConfig,
    }),
    [
      stocks,
      transactions,
      accounts,
      exchangeRate,
      assetHistory,
      stockOrder,
      appTitle,
      generalAssets,
      cashTransactions,
      householdTransactions,
      autoSyncStartDate,
      navOrder,
      marketData,
      techSettings,
      recurringCashRules,
      performanceRecords,
      budgetItems,
      appPassword,
      recoveryKey,
      customCategories,
      tenxStrategyConfig,
    ],
  );

  useEffect(() => {
    if (!isInitialized) return;

    // 標記目前有尚未儲存的變更
    setHasUnsavedChanges(true);
    if (isDesktopMode || isMobileMode) setSaveStatus("idle");

    // 改為 10 秒後才執行儲存動作，避免頻繁寫入過大資料造成延遲
    const timer = setTimeout(async () => {
      const data = getExportData();
      const dataStr = JSON.stringify(data);

      // 寫入瀏覽器快取 (Local Web Cache)
      localStorage.setItem(STORAGE_KEY, dataStr);

      if (isDesktopMode || isMobileMode) {
        setSaveStatus("saving");
        try {
          if (isDesktopMode) {
            const res = await window.electronAPI?.saveData(data);
            if (res?.success) setSaveStatus("saved");
            else setSaveStatus("error");
          } else if (isMobileMode) {
            await Filesystem.writeFile({
              path: MOBILE_FILE_NAME,
              data: dataStr,
              directory: Directory.Documents,
              encoding: Encoding.UTF8,
            });
            setSaveStatus("saved");
          }
        } catch (e) {
          setSaveStatus("error");
        }
      }
      setHasUnsavedChanges(false);
    }, 10000);

    return () => clearTimeout(timer);
  }, [
    stocks,
    transactions,
    accounts,
    exchangeRate,
    assetHistory,
    stockOrder,
    appTitle,
    generalAssets,
    cashTransactions,
    householdTransactions,
    autoSyncStartDate,
    navOrder,
    marketData,
    techSettings,
    recurringCashRules,
    performanceRecords,
    budgetItems,
    isInitialized,
    isDesktopMode,
    isMobileMode,
    getExportData,
  ]);

  // ... (loadData, handleUpdateStock, etc. remain the same) ...
  const loadData = (data: any) => {
    if (!data) return;
    setStocks(data.stocks || []);
    setTransactions(data.transactions || []);
    setAccounts(data.accounts || []);
    setAssetHistory(data.assetHistory || []);
    setStockOrder(data.stockOrder || []);
    setGeneralAssets(data.generalAssets || []);
    setCashTransactions(data.cashTransactions || []);
    setHouseholdTransactions(data.householdTransactions || []);
    if (data.marketData && Array.isArray(data.marketData))
      setMarketData(data.marketData);
    if (data.techSettings)
      setTechSettings({ ...DEFAULT_TECH_SETTINGS, ...data.techSettings });
    if (data.recurringCashRules) setRecurringCashRules(data.recurringCashRules);
    if (data.performanceRecords) setPerformanceRecords(data.performanceRecords);
    if (data.budgetItems) setBudgetItems(data.budgetItems);
    if (data.exchangeRate) setExchangeRate(data.exchangeRate);
    if (data.customCategories) setCustomCategories(data.customCategories);
    if (data.tenxStrategyConfig) setTenxStrategyConfig(data.tenxStrategyConfig);
    if (data.appTitle) setAppTitle(data.appTitle);
    if (data.autoSyncStartDate) setAutoSyncStartDate(data.autoSyncStartDate);
    if (data.appPassword) {
      setAppPassword(data.appPassword);
      localStorage.setItem(APP_PASSWORD_KEY, data.appPassword);
    }
    if (data.recoveryKey) {
      setRecoveryKey(data.recoveryKey);
      localStorage.setItem(RECOVERY_KEY_KEY, data.recoveryKey);
    }
    if (data.navOrder && Array.isArray(data.navOrder)) {
      const defaultIds = NAV_ITEMS.map((n) => n.id);
      const uniqueOrder = Array.from(
        new Set([...data.navOrder, ...defaultIds]),
      ).filter((id) => defaultIds.includes(id));
      setNavOrder(uniqueOrder);
      if (uniqueOrder.length > 0) {
        setActiveTab(uniqueOrder[0] as any);
      }
    }
    setHasUnsavedChanges(false);
  };

  const handleAddStock = useCallback((s: Stock) => {
    setStocks((prev) => [...prev, s]);
  }, []);

  const handleDeleteStock = useCallback((id: string) => {
    setStocks((prev) => prev.filter((s) => s.id !== id));

    // Also cleanup transactions associated with this stock
    // and their linked cash transactions
    setTransactions((prev) => {
      const txsToRemove = prev.filter((t) => t.stockId === id);
      const txIdsToRemove = new Set(txsToRemove.map((t) => t.id));

      if (txIdsToRemove.size > 0) {
        setCashTransactions((ctxs) =>
          ctxs.filter(
            (ct) =>
              !ct.sourceTransactionId ||
              !txIdsToRemove.has(ct.sourceTransactionId),
          ),
        );
        setHouseholdTransactions((htxs) =>
          htxs.filter(
            (ht) =>
              !ht.sourceTransactionId ||
              !txIdsToRemove.has(ht.sourceTransactionId),
          ),
        );
      }

      return prev.filter((t) => t.stockId !== id);
    });
  }, []);

  const handleAddPerformanceRecord = useCallback(
    (rec: StockPerformanceRecord) => {
      setPerformanceRecords((prev) => [...prev, rec]);
    },
    [],
  );

  const handleDeletePerformanceRecord = useCallback((id: string) => {
    setPerformanceRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleAddHistory = useCallback((r: AssetSnapshot) => {
    setAssetHistory((prev) =>
      [...prev.filter((p) => p.date !== r.date), r].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    );
  }, []);

  const handleDeleteHistory = useCallback((d: string) => {
    setAssetHistory((prev) => prev.filter((p) => p.date !== d));
  }, []);

  const handleUpdateStock = useCallback((s: Stock) => {
    setStocks((prev) => prev.map((os) => (os.id === s.id ? s : os)));
  }, []);

  const handleAddAccount = useCallback((a: Account) => {
    setAccounts((prev) => [...prev, a]);
  }, []);

  const handleDeleteAccount = useCallback((id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleUpdateAccount = useCallback((a: Account) => {
    setAccounts((prev) => prev.map((oa) => (oa.id === a.id ? a : oa)));
  }, []);

  const handleTransferTransactions = useCallback(
    (fromAccountId: string, toAccountId: string) => {
      // Get target accounts for mapping
      const fromAccount = accounts.find((a) => a.id === fromAccountId);
      const toAccount = accounts.find((a) => a.id === toAccountId);

      if (!fromAccount || !toAccount) return;

      const oldName = fromAccount.name.trim();
      const newName = toAccount.name;

      // Collect IDs of stock transactions being moved to accurately update linked ledger entries
      const movedTxIds = new Set(
        transactions
          .filter((tx) => tx.accountId === fromAccountId)
          .map((tx) => tx.id),
      );

      // 1. Update stock transactions
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.accountId === fromAccountId
            ? { ...tx, accountId: toAccountId }
            : tx,
        ),
      );

      // 2. Update linked household transactions
      setHouseholdTransactions((prev) =>
        prev.map((tx) => {
          const txAccId = (tx.accountId || "").toString().trim();
          const txAccIdLower = txAccId.toLowerCase();
          const oldNameLower = oldName.toLowerCase();

          // Matches:
          // 1. Linked by sourceTransactionId
          // 2. Name match (case-insensitive)
          // 3. ID match (fallback)
          const isLinkedToMoved =
            tx.sourceTransactionId && movedTxIds.has(tx.sourceTransactionId);
          const matchesOldName =
            txAccIdLower === oldNameLower ||
            txAccIdLower === fromAccount.name.toLowerCase().trim();
          const matchesOldId = tx.accountId === fromAccountId;

          let updatedTx = { ...tx };
          let changed = false;

          if (isLinkedToMoved || matchesOldName || matchesOldId) {
            updatedTx.accountId = newName;
            changed = true;
          }

          // Also update transfer metadata if matched by name or ID
          if (
            tx.fromAccountName?.trim().toLowerCase() === oldNameLower ||
            tx.fromAccountId === fromAccountId
          ) {
            updatedTx.fromAccountName = newName;
            updatedTx.fromAccountId = toAccountId;
            changed = true;
          }
          if (
            tx.toAccountName?.trim().toLowerCase() === oldNameLower ||
            tx.toAccountId === fromAccountId
          ) {
            updatedTx.toAccountName = newName;
            updatedTx.toAccountId = toAccountId;
            changed = true;
          }

          return changed ? updatedTx : tx;
        }),
      );

      // 3. Update cash transactions (Ledger)
      const fromCashId = fromAccount.linkedCashAccountId || fromAccount.id;
      const toCashId = toAccount.linkedCashAccountId || toAccount.id;

      setCashTransactions((prev) =>
        prev.map((tx) => {
          let updatedTx = { ...tx };
          let changed = false;

          // Update main account link
          if (tx.accountId === fromCashId) {
            updatedTx.accountId = toCashId;
            changed = true;
          }

          // Update transfer metadata
          if (tx.fromAccountId === fromCashId) {
            updatedTx.fromAccountId = toCashId;
            updatedTx.fromAccountName = newName;
            changed = true;
          }
          if (tx.toAccountId === fromCashId) {
            updatedTx.toAccountId = toCashId;
            updatedTx.toAccountName = newName;
            changed = true;
          }

          // Update accountId if linked to a moved stock transaction
          if (
            tx.sourceTransactionId &&
            movedTxIds.has(tx.sourceTransactionId)
          ) {
            updatedTx.accountId = toCashId;
            changed = true;
          }

          // Fallback: Name-based matching for ledger entries that might have used the name
          const txAccIdLower = (tx.accountId || "")
            .toString()
            .trim()
            .toLowerCase();
          const oldNameLower = oldName.toLowerCase();
          if (txAccIdLower === oldNameLower) {
            updatedTx.accountId = toCashId;
            changed = true;
          }

          return changed ? updatedTx : tx;
        }),
      );

      // 4. Update recurring rules
      setRecurringCashRules((prev) =>
        prev.map((rule) => {
          let updatedRule = { ...rule };
          let changed = false;
          if (rule.accountId === fromAccountId) {
            updatedRule.accountId = toAccountId;
            changed = true;
          }
          if (rule.toAccountId === fromAccountId) {
            updatedRule.toAccountId = toAccountId;
            changed = true;
          }
          return changed ? updatedRule : rule;
        }),
      );
    },
    [accounts, transactions],
  );

  const syncCashTransaction = useCallback(
    (
      tx: Transaction,
      targetAccount: Account,
      stock: Stock,
      deleteOnly: boolean = false,
    ) => {
      const cashTxDate =
        tx.settlementDate ||
        (tx.type === TransactionType.DIVIDEND && tx.paymentDate
          ? tx.paymentDate
          : tx.date);
      // Only block if autoSyncStartDate IS set AND the transaction date is before it
      if (autoSyncStartDate && cashTxDate < autoSyncStartDate) {
        if (deleteOnly) {
          setCashTransactions((prev) =>
            prev.filter((ct) => ct.sourceTransactionId !== tx.id),
          );
          setHouseholdTransactions((prev) =>
            prev.filter((ct) => ct.sourceTransactionId !== tx.id),
          );
        }
        return;
      }

      let targetCashAccountId = targetAccount.linkedCashAccountId || targetAccount.id;
      let targetCashAccountName = targetAccount.name;

      if (tx.type === TransactionType.DIVIDEND && tx.dividendAccountId) {
          targetCashAccountId = tx.dividendAccountId;
          const divAcc = accounts.find(a => a.id === tx.dividendAccountId);
          if (divAcc) targetCashAccountName = divAcc.name;
      }
      // Fixed: Check currency or Market.US. Stocks like COMMODITY might have currency='USD'
      const isUS =
        stock.currency === "USD" ||
        (stock.market === Market.US && !stock.currency);

      const principal = tx.price * tx.quantity;
      const fee = tx.fee || 0;
      let totalAmount = 0,
        type: "DEPOSIT" | "WITHDRAWAL" = "WITHDRAWAL",
        category = "投資",
        noteSuffix = "(自動)";

      if (tx.type === TransactionType.BUY) {
        totalAmount = principal + fee;
        type = "WITHDRAWAL";
        category = `買進 ${stock.ticker}`;
        noteSuffix = `買進 ${stock.name} (自動)`;
      } else if (tx.type === TransactionType.SELL) {
        totalAmount = principal - fee - (tx.tax || 0);
        type = "DEPOSIT";
        category = `賣出 ${stock.ticker}`;
        noteSuffix = `賣出 ${stock.name} (自動)`;
      } else if (tx.type === TransactionType.DIVIDEND) {
        totalAmount = principal - fee;
        type = "DEPOSIT";
        category = `領息 ${stock.ticker}`;
        noteSuffix = `領息 ${stock.name} (自動)`;
      }

      totalAmount = Math.round(
        isUS ? totalAmount * (tx.exchangeRate || exchangeRate) : totalAmount,
      );
      if (totalAmount < 0) return;

      setCashTransactions((prev) => {
        if (deleteOnly)
          return prev.filter((ct) => ct.sourceTransactionId !== tx.id);
        const existingIndex = prev.findIndex(
          (ct) => ct.sourceTransactionId === tx.id,
        );
        const newCashTx: CashTransaction = {
          id: existingIndex >= 0 ? prev[existingIndex].id : generateId(),
          date: cashTxDate,
          accountId: targetCashAccountId,
          type,
          amount: totalAmount,
          currency: "TWD",
          category,
          note: noteSuffix,
          sourceTransactionId: tx.id,
        };
        if (existingIndex >= 0) {
          const newArr = [...prev];
          newArr[existingIndex] = newCashTx;
          return newArr;
        }
        return [...prev, newCashTx];
      });

      setHouseholdTransactions((prev) => {
        if (deleteOnly)
          return prev.filter((ct) => ct.sourceTransactionId !== tx.id);
        const existingIndex = prev.findIndex(
          (ct) => ct.sourceTransactionId === tx.id,
        );

        let houseCategory = "投資";
        if (tx.type === TransactionType.BUY) houseCategory = "投資支出";
        else if (tx.type === TransactionType.SELL) houseCategory = "投資收入";
        else if (tx.type === TransactionType.DIVIDEND)
          houseCategory = "股息收入";

        const newHouseTx: CashTransaction = {
          id: existingIndex >= 0 ? prev[existingIndex].id : generateId(),
          date: cashTxDate,
          accountId: targetCashAccountName,
          type: type === "DEPOSIT" ? "DEPOSIT" : "WITHDRAWAL",
          amount: totalAmount,
          currency: "TWD",
          category: houseCategory,
          note: `${noteSuffix} - 連動`,
          sourceTransactionId: tx.id,
        };
        if (existingIndex >= 0) {
          const newArr = [...prev];
          newArr[existingIndex] = newHouseTx;
          return newArr;
        }
        return [...prev, newHouseTx];
      });
    },
    [autoSyncStartDate, exchangeRate],
  );

  const handleDeleteStockTransaction = useCallback(
    (id: string) => {
      const tx = transactions.find((t) => t.id === id);
      if (tx) {
        const account = accounts.find((a) => a.id === tx.accountId);
        const stock = stocks.find((s) => s.id === tx.stockId);
        if (account && stock) {
          syncCashTransaction(tx, account, stock, true);
        }

        if (stock && tx.isTenX) {
          setStocks((prev) =>
            prev.map((s) => {
              if (s.id !== stock.id) return s;
              let updated = { ...s };

              if (tx.type === TransactionType.BUY) {
                updated.tenXBuyPrice = undefined;
                updated.tenXShares = 0;
              }
              return updated;
            }),
          );
        }

        setTransactions((prev) => prev.filter((t) => t.id !== id));
      }
    },
    [transactions, accounts, stocks, syncCashTransaction],
  );

  const handleEditStockTransaction = useCallback((tx: Transaction) => {
    setEditingTx(tx);
    setShowTxForm(true);
  }, []);

  const handleAddStockTransaction = useCallback(() => {
    setEditingTx(null);
    setShowTxForm(true);
  }, []);

  const handleSaveManyTransactions = (txsToUpdate: Transaction[]) => {
    setTransactions((prev) => {
      const newTxs = [...prev];
      txsToUpdate.forEach((tx) => {
        const idx = newTxs.findIndex((t) => t.id === tx.id);
        if (idx !== -1) {
          newTxs[idx] = tx;
        }
      });
      return newTxs;
    });

    txsToUpdate.forEach((tx) => {
      if (tx.accountId) {
        const account = accounts.find((a) => a.id === tx.accountId);
        const stock = stocks.find((s) => s.id === tx.stockId);
        if (account && stock) syncCashTransaction(tx, account, stock);
      }
    });
  };

  const handleSaveTransaction = (tx: Transaction, optionalStock?: Stock) => {
    setTransactions((prev) => {
      const exists = prev.some((t) => t.id === tx.id);
      if (exists) {
        return prev.map((t) => (t.id === tx.id ? tx : t));
      }
      return [...prev, tx];
    });

    if (tx.accountId) {
      const account = accounts.find((a) => a.id === tx.accountId);
      const stock = optionalStock || stocks.find((s) => s.id === tx.stockId);
      if (account && stock) syncCashTransaction(tx, account, stock);

      // Update stock strategy flags if changed in transaction
      if (stock) {
        const needsStockUpdate = tx.isTenX || (editingTx && editingTx.isTenX);

        if (needsStockUpdate && stock) {
          setStocks((prev) =>
            prev.map((s) => {
              if (s.id !== stock.id) return s;

              let updated = {
                ...s,
                isTenX: tx.isTenX ?? s.isTenX,
                strategy: ((tx.isTenX ? "TENX" : s.strategy) as any),
              };

              if (editingTx) {
                if (editingTx.isTenX) {
                  updated.tenXBuyPrice = undefined;
                  updated.tenXShares = 0;
                }
              }

              if (tx.isTenX) {
                if (tx.type === TransactionType.BUY) {
                  updated.tenXBuyPrice = tx.price;
                  updated.tenXShares = tx.quantity;
                  updated.strategyDate = tx.date;
                }
              } else if (editingTx && editingTx.isTenX) {
                updated.tenXBuyPrice = undefined;
                updated.tenXShares = 0;
              }

              return updated;
            }),
          );
        }
      }
    }
    setShowTxForm(false);
    setEditingTx(null);
  };

  const handleSmartDeleteCashTx = useCallback(
    (id: string, isHousehold: boolean) => {
      const targetList = isHousehold ? householdTransactions : cashTransactions;
      const setTarget = isHousehold
        ? setHouseholdTransactions
        : setCashTransactions;
      const setOther = isHousehold
        ? setCashTransactions
        : setHouseholdTransactions;

      const txToDelete = targetList.find((t) => t.id === id);
      if (!txToDelete) return;

      setTarget((prev) => prev.filter((t) => t.id !== id));

      const sourceId = txToDelete.sourceTransactionId;

      setOther((prev) =>
        prev.filter((otherTx) => {
          if (sourceId && otherTx.sourceTransactionId === sourceId)
            return false;
          if (otherTx.sourceTransactionId === id) return false;
          if (sourceId && otherTx.id === sourceId) return false;
          if (
            sourceId &&
            (sourceId.startsWith("manual_transfer_") ||
              sourceId.startsWith("auto_rec"))
          ) {
            const baseId = sourceId.replace("_IN", "");
            const partnerId = sourceId.endsWith("_IN")
              ? baseId
              : `${baseId}_IN`;
            if (otherTx.sourceTransactionId === partnerId) return false;
          }
          return true;
        }),
      );

      if (
        sourceId &&
        (sourceId.startsWith("manual_transfer_") ||
          sourceId.startsWith("auto_rec"))
      ) {
        const baseId = sourceId.replace("_IN", "");
        const partnerId = sourceId.endsWith("_IN") ? baseId : `${baseId}_IN`;
        setTarget((prev) =>
          prev.filter((t) => t.sourceTransactionId !== partnerId),
        );
      }
    },
    [householdTransactions, cashTransactions],
  );

  const handleDeleteCashTx = useCallback(
    (id: string) => handleSmartDeleteCashTx(id, false),
    [handleSmartDeleteCashTx],
  );
  const handleDeleteHouseholdTx = useCallback(
    (id: string) => handleSmartDeleteCashTx(id, true),
    [handleSmartDeleteCashTx],
  );

  const handleAddCashTxWithSync = useCallback((tx: CashTransaction) => {
    setCashTransactions((prev) => [...prev, tx]);

    if (tx.isCreditCardPayment) return;

    const houseTx: CashTransaction = {
      ...tx,
      id: generateId(),
      sourceTransactionId: tx.id,
      note: (tx.note || "") + " (資產連動)",
      category: tx.category, // Usually '轉帳' for manual transfers
    };
    setHouseholdTransactions((prev) => [...prev, houseTx]);
  }, []);

  const handleUpdateCashTxWithSync = useCallback(
    (updatedTx: CashTransaction) => {
      setCashTransactions((prev) =>
        prev.map((t) => (t.id === updatedTx.id ? updatedTx : t)),
      );

      setHouseholdTransactions((prev) =>
        prev.map((t) => {
          if (t.sourceTransactionId === updatedTx.id) {
            return {
              ...t,
              date: updatedTx.date,
              amount: updatedTx.amount,
              category: updatedTx.category,
              subCategory: updatedTx.subCategory,
              note: (updatedTx.note || "") + " (資產連動)",
              type: updatedTx.type,
              accountId: t.accountId,
            };
          }
          return t;
        }),
      );
    },
    [],
  );

  const handleUpdateHouseholdTx = useCallback((updatedTx: CashTransaction) => {
    setHouseholdTransactions((prev) =>
      prev.map((t) => (t.id === updatedTx.id ? updatedTx : t)),
    );
  }, []);

  const handleSaveToPC = async () => {
    if (isDesktopMode || isMobileMode) return;
    const data = JSON.stringify(getExportData(), null, 2);
    try {
      if (fileHandle) {
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        setHasUnsavedChanges(false);
      } else {
        await handleSaveAsToPC();
      }
    } catch (err) {
      handleLegacyDownload(data);
    }
  };

  const handleSaveAsToPC = async () => {
    const exportData = getExportData();
    if (window.electronAPI?.saveDataAs) {
      try {
        const res = await window.electronAPI.saveDataAs(exportData);
        if (res && res.success) {
          setFileName(`已另存新檔：${res.fileName}`);
          setSaveStatus("saved");
          setHasUnsavedChanges(false);
          alert(`儲存成功！\n儲存路徑：${res.filePath}`);
        } else if (res && !res.canceled && res.error) {
          alert(`另存新檔失敗：${res.error}`);
        }
      } catch (err: any) {
        alert(`另存新檔失敗：${err.message}`);
      }
      return;
    }

    const data = JSON.stringify(exportData, null, 2);
    try {
      if ("showSaveFilePicker" in window && !isElectronBrowser) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `smartvest_data_${new Date().toISOString().split("T")[0]}.json`,
          types: [
            {
              description: "SmartVest JSON File",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
        setFileHandle(handle);
        setFileName(handle.name);
        setHasUnsavedChanges(false);
      } else {
        handleLegacyDownload(data);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") handleLegacyDownload(data);
    }
  };

  const handleOpenFromPC = async (): Promise<boolean> => {
    if (window.electronAPI?.openDataFile) {
      try {
        const res = await window.electronAPI.openDataFile();
        if (res && res.success && res.data) {
          loadData(res.data);
          setFileName(`已開啟：${res.fileName}`);
          setSaveStatus("saved");
          setHasUnsavedChanges(false);
          alert(`成功開啟檔案！\n檔案路徑：${res.filePath}`);
          return true;
        } else if (res && !res.canceled && res.error) {
          alert(`開啟檔案失敗：${res.error}`);
        }
      } catch (err: any) {
        alert(`開啟檔案錯誤：${err.message}`);
      }
      return true; // We handled it via Electron API (even if canceled or errored), so don't fallback to legacy input
    }

    if (!("showOpenFilePicker" in window) || isElectronBrowser) return false;
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "SmartVest JSON File",
            accept: { "application/json": [".json"] },
          },
        ],
        multiple: false,
      });
      const file = await handle.getFile();
      const text = await file.text();
      loadData(JSON.parse(text));
      setFileHandle(handle);
      setFileName(file.name);
      return true;
    } catch (err: any) {
      return err.name === "AbortError";
    }
  };

  const handleLegacyDownload = (dataString: string) => {
    const blob = new Blob([dataString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smartvest_backup_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setHasUnsavedChanges(false);
  };

  const handleLegacyFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data) {
          loadData(data);
          setFileHandle(null);
          setFileName(file.name);
        }
      } catch (err) {}
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpdateStockPrices = async () => {
    if (isUpdatingPrices) return;
    setIsUpdatingPrices(true);
    let errorMessages: string[] = [];

    // 強制偵測是否處於桌面打包環境 (若 protocol 為 file: 則肯定是)
    const isDesktopEnv =
      window.electronAPI?.isElectron || window.location.protocol === "file:";

    try {
      if (isDesktopEnv && !window.electronAPI) {
        throw new Error(
          "桌面橋接器 (Preload) 載入失敗或遺失，無法執行連線。請重新啟動程式或確認安裝完整性。",
        );
      }

      // 1. Fetch official TWSE ETF NAV data for all Taiwanese ETFs
      let twseEtfList: any[] = [];
      try {
        let twseData = null;
        if (isDesktopEnv) {
          const res = await window.electronAPI!.fetchTWSE();
          if (res.error) errorMessages.push(`TWSE Error: ${res.error}`);
          if (res.data) twseData = res.data;
        } else {
          twseData = await fetchTWSEEtfDirect();
        }

        if (twseData?.a1) {
          twseEtfList = twseData.a1.flatMap(
            (group: any) => group.msgArray || [],
          );
        }
      } catch (err: any) {
        console.error("Failed to fetch official TWSE ETF NAV data", err);
        errorMessages.push(`TWSE exception: ${err.message}`);
      }

      // 台股即時報價：一次抓齊所有台股標的。
      // 必須排在全市場日收盤表之前 —— FinMind / TWSE OpenAPI 的日線要等收盤後
      // 才有當日資料，盤中拿到的一律是昨天的收盤價，這會讓「更新股價」
      // 看起來像是把價格改回昨收。mis.twse 才有盤中即時價。
      let twRealtimeMap: Map<string, RealtimeQuote> | null = null;
      if (!isDesktopEnv) {
        try {
          const twCodes = stocks
            .filter(
              (s) =>
                s.market === Market.TW ||
                s.market === Market.BOND ||
                /^[0-9]{4,6}[A-Z]?(\.TW|\.TWO)?$/i.test(s.ticker || ""),
            )
            .map((s) => s.ticker);
          if (twCodes.length > 0) {
            twRealtimeMap = await fetchTWRealtimeBatch(twCodes);
          }
        } catch (e) {}
      }

      let twMarketMap: Map<string, { price: number; name?: string }> | null = null;
      if (!isDesktopEnv) {
        try {
          twMarketMap = await fetchFullTWMarketPriceMap();
        } catch (e) {}
      }

      // 2. Fetch prices & map NAV
      const updatedStocks = await Promise.all(
        stocks.map(async (stock) => {
          let updatedStock = { ...stock };

          const cleanCode = stock.ticker.split(".")[0].trim().toUpperCase();

          // 市價是否已取得。這些快速路徑刻意「不 return」——
          // 函式尾端還有 ETF 淨值(NAV)區塊要跑，提早返回會讓淨值停在舊值。
          let priceResolved = false;

          // 最優先：盤中即時價
          const live = twRealtimeMap?.get(cleanCode);
          if (!isDesktopEnv && live && live.price > 0) {
            updatedStock.currentPrice = live.price;
            if (live.prevClose > 0) updatedStock.previousClose = live.prevClose;
            if (live.name && (!updatedStock.name || updatedStock.name === updatedStock.ticker)) {
              updatedStock.name = live.name;
            }
            updatedStock.marketState = live.isLive ? "REGULAR" : "CLOSED";
            updatedStock.lastUpdateDate = getLocalTodayString();
            priceResolved = true;
          }

          // 次選：全台股日收盤對照表 O(1) 拿取價格 (適用於 GitHub Pages 網頁版)
          if (!priceResolved && !isDesktopEnv && twMarketMap && twMarketMap.has(cleanCode)) {
            const matched = twMarketMap.get(cleanCode)!;
            if (matched.price > 0) {
              updatedStock.currentPrice = matched.price;
              if (matched.name && (!updatedStock.name || updatedStock.name === updatedStock.ticker)) {
                updatedStock.name = matched.name;
              }
              updatedStock.lastUpdateDate = getLocalTodayString();
              priceResolved = true;
            }
          }

          // 特殊處理：基金標的
          const isProbablyFund =
            stock.market === Market.FUND ||
            ((stock.category?.includes("基金") ||
              stock.name?.includes("基金")) &&
              !/^[0-9]{4,6}[A-Z]?(\.TW|\.TWO)?$/i.test(stock.ticker) &&
              !/^[A-Z]{1,5}$/.test(stock.ticker));

          if (!priceResolved && isProbablyFund) {
            try {
              let fundData = null;
              if (isDesktopEnv) {
                const res = await window.electronAPI!.fetchFundNAV(stock.name);
                if (res.data) fundData = res.data;
              } else {
                // 網頁版先查 MoneyDJ 淨值（以基金名稱搜尋）。
                // 基金沒有股票代號，先前只丟給 Yahoo 查，對境內基金幾乎必定查無，
                // 淨值因此一直不動。Yahoo 僅保留給有掛牌代號的境外標的當備援。
                const fundNav = await fetchFundNavByName(stock.name || stock.ticker);
                if (fundNav && fundNav.nav > 0) {
                  fundData = { nav: fundNav.nav, date: fundNav.date };
                } else {
                  const apiRes = await fetchCurrentYahooQuote(stock.ticker || stock.name);
                  if (apiRes.success && apiRes.regularMarketPrice > 0) {
                    fundData = { nav: apiRes.regularMarketPrice, date: getLocalTodayString() };
                  }
                }
              }

              if (fundData && fundData.nav != null) {
                updatedStock.currentPrice = fundData.nav;
                updatedStock.nav = fundData.nav;
                updatedStock.lastUpdateDate = getLocalTodayString();
              }
            } catch (error: any) {
              console.error(`Fund fetch failed for ${stock.name}`, error);
            }
            if (updatedStock.currentPrice && updatedStock.currentPrice > 0) {
              return updatedStock;
            }
          }

          let finalSymbol = stock.ticker;
          if (stock.market === Market.TW && !stock.ticker.includes("."))
            finalSymbol = `${stock.ticker}.TW`;

          // 市價已由即時報價/日收盤表取得時就別再打 Yahoo：
          // 它較慢、盤中資料也不如 mis.twse 新，重抓只會把好資料蓋掉。
          // 注意 finalSymbol 已在上方算好，下方的淨值區塊仍要用到它。
          try {
            if (priceResolved) {
              // 市價已取得，直接進入淨值處理
            } else if (isDesktopEnv) {
              const res =
                await window.electronAPI!.fetchYahooQuote(finalSymbol);
              if (res.error)
                errorMessages.push(`${finalSymbol} Quote Err: ${res.error}`);
              if (res.data && res.data.regularMarketPrice != null) {
                updatedStock.currentPrice = res.data.regularMarketPrice;
              }
              if (res.data && res.data.postMarketPrice != null) {
                updatedStock.postMarketPrice = res.data.postMarketPrice;
              }
              if (res.data && res.data.preMarketPrice != null) {
                updatedStock.preMarketPrice = res.data.preMarketPrice;
              }
              if (res.data && res.data.marketState != null) {
                updatedStock.marketState = res.data.marketState;
              }
            } else {
              const apiRes = await fetchCurrentYahooQuote(finalSymbol);
              if (apiRes.success && apiRes.regularMarketPrice > 0) {
                updatedStock.currentPrice = apiRes.regularMarketPrice;
                if (apiRes.postMarketPrice != null) {
                  updatedStock.postMarketPrice = apiRes.postMarketPrice;
                }
                if (apiRes.preMarketPrice != null) {
                  updatedStock.preMarketPrice = apiRes.preMarketPrice;
                }
                if (apiRes.marketState != null) {
                  updatedStock.marketState = apiRes.marketState;
                }
              } else if (stock.market === Market.TW) {
                const otcApiRes = await fetchCurrentYahooQuote(
                  stock.ticker + ".TWO",
                );
                if (otcApiRes.success && otcApiRes.regularMarketPrice > 0) {
                  updatedStock.currentPrice = otcApiRes.regularMarketPrice;
                  finalSymbol = stock.ticker + ".TWO";
                }
              }
            }

            // Fetch MA Data (SMA20, EMA50, EMA100)
            try {
              const maRes = await fetchMADataForSymbol(finalSymbol);
              if (maRes) {
                if (maRes.sma20) updatedStock.sma20 = maRes.sma20;
                if (maRes.ema50) updatedStock.ema50 = maRes.ema50;
                if (maRes.ema100) updatedStock.ema100 = maRes.ema100;
                if (!updatedStock.currentPrice && maRes.currentPrice) {
                  updatedStock.currentPrice = maRes.currentPrice;
                }
              } else if (
                stock.market === Market.TW &&
                finalSymbol.endsWith(".TW")
              ) {
                // Try OTC fallback for MA
                const otcMaRes = await fetchMADataForSymbol(
                  stock.ticker + ".TWO",
                );
                if (otcMaRes) {
                  if (otcMaRes.sma20) updatedStock.sma20 = otcMaRes.sma20;
                  if (otcMaRes.ema50) updatedStock.ema50 = otcMaRes.ema50;
                  if (otcMaRes.ema100) updatedStock.ema100 = otcMaRes.ema100;
                  if (!updatedStock.currentPrice && otcMaRes.currentPrice) {
                    updatedStock.currentPrice = otcMaRes.currentPrice;
                  }
                }
              }
            } catch (e) {}
          } catch (error: any) {
            errorMessages.push(
              `${finalSymbol} Quote Exception: ${error.message}`,
            );
          }

          try {
            // Try Official TWSE First
            let navFound = false;
            const cleanTicker = stock.ticker.split(".")[0].trim().toUpperCase();
            const twseEtf = twseEtfList.find((e: any) => e.a === cleanTicker);

            if (twseEtf) {
              if (
                twseEtf.e &&
                (!updatedStock.currentPrice || updatedStock.currentPrice === 0)
              ) {
                const mktPrice = parseFloat(twseEtf.e);
                if (!isNaN(mktPrice) && mktPrice > 0)
                  updatedStock.currentPrice = mktPrice;
              }
              if (twseEtf.f) {
                const officialNav = parseFloat(twseEtf.f);
                // 未更新的 ETF 會回 0，寫進去會讓折溢價顯示成 -100%
                if (!isNaN(officialNav) && officialNav > 0) {
                  updatedStock.nav = officialNav;
                  navFound = true;
                }
              }
            }

            // 只有 ETF / 基金才有淨值可言。一般個股沒有淨值，
            // 卻為每一檔都打一次 Yahoo，既拖慢更新又只是把市價填進 nav。
            const isEtfLike =
              !!twseEtf || stock.market === Market.FUND || isProbablyFund;

            // Fallback to Yahoo QuoteSummary
            if (!navFound && isEtfLike) {
              let usNavFound = false;
              try {
                if (isDesktopEnv) {
                  const res =
                    await window.electronAPI!.fetchYahooSummary(finalSymbol);
                  if (res.data && res.data.nav != null) {
                    updatedStock.nav = res.data.nav;
                    usNavFound = true;
                  }
                } else {
                  const quoteRes = await fetchCurrentYahooQuote(finalSymbol);
                  if (quoteRes.success && quoteRes.regularMarketPrice != null) {
                    if (!updatedStock.nav) updatedStock.nav = quoteRes.regularMarketPrice;
                    usNavFound = true;
                  }
                }
              } catch (e: any) {
                errorMessages.push(
                  `${finalSymbol} NAV Fetch Err: ${e.message}`,
                );
              }
            }
          } catch (error: any) {
            errorMessages.push(
              `${finalSymbol} NAV Block Exception: ${error.message}`,
            );
          }

          return updatedStock;
        }),
      );
      setStocks(updatedStocks);

      if (errorMessages.length > 0) {
        alert(
          "部分股價更新失敗 (Partial Update Error):\n\n" +
            errorMessages.join("\n"),
        );
      } else {
        alert("🎉 所有持股即時股價與資產淨值已成功更新！");
      }
    } catch (e: any) {
      alert("更新程序發生嚴重錯誤:\n" + e.message);
    } finally {
      setIsUpdatingPrices(false);
    }
  };

  const handleTabDragStart = (e: React.DragEvent, id: string) => {
    setDraggingTabId(id);
    e.dataTransfer.effectAllowed = "move";
    if (e.currentTarget instanceof HTMLElement)
      e.currentTarget.style.opacity = "0.5";
  };

  const handleTabDragEnd = (e: React.DragEvent) => {
    setDraggingTabId(null);
    if (e.currentTarget instanceof HTMLElement)
      e.currentTarget.style.opacity = "1";
  };

  const handleTabDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleTabDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggingTabId || draggingTabId === targetId) return;
    const currentOrder = [...navOrder];
    const fromIndex = currentOrder.indexOf(draggingTabId);
    const toIndex = currentOrder.indexOf(targetId);
    if (fromIndex !== -1 && toIndex !== -1) {
      currentOrder.splice(fromIndex, 1);
      currentOrder.splice(toIndex, 0, draggingTabId);
      setNavOrder(currentOrder);
    }
    setDraggingTabId(null);
  };

  const handleOpenTxForm = useCallback(
    (stockId?: string | any, accountId?: string | any) => {
      setEditingTx(null);
      setPrefillStockId(typeof stockId === "string" ? stockId : null);
      setPrefillAccountId(typeof accountId === "string" ? accountId : null);
      setShowTxForm(true);
    },
    [],
  );

  const handleAppLogin = (pass: string) => {
    if (pass === appPassword) {
      setIsAppUnlocked(true);
      return true;
    }
    return false;
  };

  const handleAppReset = (key: string) => {
    if (key === recoveryKey) {
      setAppPassword("1234");
      localStorage.setItem(APP_PASSWORD_KEY, "1234");
      return true;
    }
    return false;
  };

  useAutoDCA(
    isInitialized,
    stocks,
    transactions,
    accounts,
    handleSaveTransaction,
  );

  if (!isAppUnlocked) {
    return <WelcomeScreen onLogin={handleAppLogin} onReset={handleAppReset} />;
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="sticky top-0 z-50">
        <div className="absolute inset-0 bg-[#f3f4f6]/85 backdrop-blur-md shadow-sm -z-10" />
        <header className="px-2 sm:px-4 py-1.5 sm:py-3">
          <div className="w-full xl:px-6 mx-auto glass-panel rounded-2xl px-3 sm:px-4 py-1.5 sm:py-2 shadow-md flex flex-wrap md:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-start">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-2 rounded-xl">
                <Sparkles size={18} fill="currentColor" />
              </div>
              <input
                type="text"
                value={appTitle}
                onChange={(e) => setAppTitle(e.target.value)}
                className="text-lg font-bold text-slate-800 bg-transparent border-none focus:ring-0 p-0 w-48 outline-none"
              />
              {(isDesktopMode || isMobileMode) && (
                <div
                  className={`flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-bold border ${saveStatus === "saving" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-emerald-100 text-emerald-700 border-emerald-200"}`}
                >
                  {saveStatus === "saving" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={12} />
                  )}
                  <span>{saveStatus === "saving" ? "儲存中" : "同步成功"}</span>
                </div>
              )}
              {isGeneratingReports && (
                <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-bold animate-pulse">
                  <Loader2 size={12} className="animate-spin" />
                  <span>{reportProgress}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".json,application/json,text/plain,*"
                ref={fileInputRef}
                onChange={handleLegacyFileImport}
                className="hidden"
              />
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400">
                  USD/TWD
                </span>
                <input
                  type="number"
                  step="0.001"
                  value={exchangeRate}
                  onChange={(e) =>
                    setExchangeRate(parseFloat(e.target.value) || 0)
                  }
                  className="w-20 text-xs font-bold text-slate-700 outline-none bg-transparent text-right"
                />
              </div>

              <button
                onClick={handleUpdateStockPrices}
                disabled={isUpdatingPrices}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-bold"
              >
                {isUpdatingPrices ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCcw size={14} />
                )}
                <span>股價更新</span>
              </button>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setMarket("ALL")}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold ${market === "ALL" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
                >
                  全部
                </button>
                <button
                  onClick={() => setMarket(Market.TW)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold ${market === Market.TW ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
                >
                  台股
                </button>
                <button
                  onClick={() => setMarket(Market.US)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold ${market === Market.US ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
                >
                  美股
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="px-2 sm:px-4 pb-2">
          <div className="w-full max-w-[1920px] px-2 sm:px-4 xl:px-6 mx-auto flex items-center gap-1.5 relative">
            {canScrollLeft && (
              <button 
                onClick={() => handleScrollNav('left')}
                title="向左滾動選單"
                className="flex items-center justify-center p-1.5 rounded-full bg-white/90 text-slate-600 hover:bg-slate-800 hover:text-white shadow-md border border-slate-200 transition-all shrink-0 z-20 active:scale-95"
              >
                <ChevronLeft size={16} />
              </button>
            )}

            <div className="relative flex-1 min-w-0 overflow-hidden">
              {canScrollLeft && (
                <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-[#f3f4f6] to-transparent z-10" />
              )}

              <nav 
                ref={navContainerRef}
                onWheel={(e) => {
                  if (navContainerRef.current && e.deltaY !== 0) {
                    navContainerRef.current.scrollBy({ left: e.deltaY, behavior: 'auto' });
                  }
                }}
                className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-1 w-full flex-nowrap scroll-smooth px-1"
              >
                {navOrder.map((id) => {
                  const tab = NAV_ITEMS.find((t) => t.id === id);
                  if (!tab) return null;
                  const Icon = tab.icon;
                  const isDragging = draggingTabId === tab.id;
                  return (
                    <button
                      key={tab.id}
                      draggable
                      onDragStart={(e) => handleTabDragStart(e, tab.id)}
                      onDragEnd={handleTabDragEnd}
                      onDragOver={handleTabDragOver}
                      onDrop={(e) => handleTabDrop(e, tab.id)}
                      onClick={(e) => {
                        setActiveTab(tab.id as any);
                        if (tab.id === "market") setMarketSymbol(null);
                        (e.currentTarget as HTMLElement).scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
                      }}
                      className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer select-none shrink-0 active:scale-95 ${activeTab === tab.id ? "bg-slate-800 text-white shadow-md" : "bg-white/80 text-slate-600 hover:bg-white border border-slate-200/50"} ${isDragging ? "opacity-50 ring-2 ring-blue-300" : ""}`}
                    >
                      <Icon size={14} className="shrink-0" />
                      <span className="whitespace-nowrap tracking-tight">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>

              {canScrollRight && (
                <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[#f3f4f6] to-transparent z-10" />
              )}
            </div>

            {canScrollRight && (
              <button 
                onClick={() => handleScrollNav('right')}
                title="向右滾動選單看更多按鈕"
                className="flex items-center justify-center p-1.5 rounded-full bg-white/90 text-slate-600 hover:bg-slate-800 hover:text-white shadow-md border border-slate-200 transition-all shrink-0 z-20 active:scale-95 animate-pulse"
              >
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="w-full max-w-[1920px] mx-auto px-2 sm:px-4 xl:px-6 space-y-4 pt-2">
        <div className="min-h-[500px]">
          {activeTab === "market" && (
            <MarketMonitor
              data={marketData}
              onUpdateData={setMarketData}
              techSettings={techSettings}
              onUpdateTechSettings={setTechSettings}
              initialSymbol={marketSymbol}
              onClearInitialSymbol={() => setMarketSymbol(null)}
            />
          )}
          {activeTab === "overview" && (
            <GeneralAssetOverview
              assets={generalAssets}
              onUpdateAssets={setGeneralAssets}
              stockValueTWD={totalStockValueTWD}
              stocks={stocks}
              accounts={accounts}
              onUpdateAccount={handleUpdateAccount}
              stockTransactions={transactions}
              cashTransactions={cashTransactions}
              householdTransactions={householdTransactions}
              onAddCashTx={handleAddCashTxWithSync}
              onUpdateCashTx={handleUpdateCashTxWithSync}
              onDeleteCashTx={handleDeleteCashTx}
              onUpdateHouseholdTx={handleUpdateHouseholdTx}
              onDeleteHouseholdTx={handleDeleteHouseholdTx}
              globalExchangeRate={exchangeRate}
              autoSyncStartDate={autoSyncStartDate}
              onUpdateAutoSyncDate={setAutoSyncStartDate}
              recurringRules={recurringCashRules}
              onUpdateRecurringRules={setRecurringCashRules}
              budgetItems={budgetItems}
            />
          )}
          {activeTab === "dashboard" && (
            <Dashboard
              portfolio={portfolio}
              market={market}
              transactions={transactions}
              accounts={accounts}
              onUpdateStock={handleUpdateStock}
              exchangeRate={exchangeRate}
              stocks={mainStocks}
              stockOrder={stockOrder}
              onUpdateOrder={setStockOrder}
              onAddTransaction={handleOpenTxForm}
              onNavigateToMarket={(sym) => {
                setMarketSymbol(sym);
                setActiveTab("market");
              }}
            />
          )}
          {activeTab === "trend" && (
            <AssetTrend
              history={assetHistory}
              onAddHistory={handleAddHistory}
              onDeleteHistory={handleDeleteHistory}
              marketFilter={market}
              transactions={activeTransactions}
              stocks={mainStocks}
              exchangeRate={exchangeRate}
            />
          )}
          {activeTab === "transactions" && (
            <TransactionList
              transactions={transactions}
              stocks={mainStocks}
              accounts={accounts}
              marketFilter={market}
              onEdit={handleEditStockTransaction}
              onDelete={handleDeleteStockTransaction}
              onAddTransaction={handleOpenTxForm}
            />
          )}
          {activeTab === "stocks" && (
            <StockManager
              stocks={mainStocks}
              stockOrder={stockOrder}
              onUpdateOrder={setStockOrder}
              marketFilter={market}
              onAddStock={handleAddStock}
              onUpdateStock={handleUpdateStock}
              onDeleteStock={handleDeleteStock}
              performanceRecords={performanceRecords}
              onAddPerformanceRecord={handleAddPerformanceRecord}
              onDeletePerformanceRecord={handleDeletePerformanceRecord}
              accounts={accounts} // Pass accounts for account-specific DCA settings
              suggestedCategories={customCategories}
              onUpdateSuggestedCategories={setCustomCategories}
            />
          )}
          {activeTab === "tenx" && (
            <TenXMarketStrategy
              stocks={stocks}
              transactions={transactions}
              onUpdateStock={handleUpdateStock}
              onAddStock={handleAddStock}
              marketFilter={market}
              accounts={accounts}
              onAddTransaction={handleOpenTxForm}
              exchangeRate={exchangeRate}
              config={tenxStrategyConfig}
              onUpdateConfig={setTenxStrategyConfig}
            />
          )}
          {activeTab === "accounts" && (
            <AccountManager
              accounts={accounts}
              onAddAccount={handleAddAccount}
              onUpdateAccount={handleUpdateAccount}
              onDeleteAccount={handleDeleteAccount}
              onReorderAccounts={setAccounts}
              onTransferTransactions={handleTransferTransactions}
            />
          )}
          {activeTab === "budget" && (
            <BudgetOverview
              items={budgetItems}
              onUpdateItems={setBudgetItems}
              transactions={budgetTransactions}
            />
          )}
          {activeTab === "expenses" && (
            <HouseholdExpenses
              accounts={accounts}
              cashTransactions={activeHouseholdTransactions}
              onAddCashTx={(tx) =>
                setHouseholdTransactions((prev) => [...prev, tx])
              }
              onUpdateCashTx={(updatedTx) =>
                setHouseholdTransactions((prev) =>
                  prev.map((t) => (t.id === updatedTx.id ? updatedTx : t)),
                )
              }
              onDeleteCashTx={(id) => handleSmartDeleteCashTx(id, true)}
              recurringRules={recurringCashRules}
              onUpdateRecurringRules={setRecurringCashRules}
              budgetItems={budgetItems}
            />
          )}
          {activeTab === "settings" && (
            <DataTools
              transactions={transactions}
              stocks={stocks}
              accounts={accounts}
              assetHistory={assetHistory}
              cashTransactions={cashTransactions}
              householdTransactions={householdTransactions}
              stockOrder={stockOrder}
              appTitle={appTitle}
              generalAssets={generalAssets}
              autoSyncStartDate={autoSyncStartDate}
              navOrder={navOrder}
              marketData={marketData}
              techSettings={techSettings}
              recurringCashRules={recurringCashRules}
              budgetItems={budgetItems}
              suggestedCategories={customCategories}
              onImportJSON={loadData}
              onImportCSV={(txs, sts, accs, hist, gen, cash, house, setts) => {
                setStocks(sts);
                setTransactions(txs);
                setAccounts(accs);
                setAssetHistory(hist);
                setGeneralAssets(gen);
                setCashTransactions(cash);
                setHouseholdTransactions(house);
                if (setts.appTitle) setAppTitle(setts.appTitle);
                if (setts.autoSyncStartDate)
                  setAutoSyncStartDate(setts.autoSyncStartDate);
                if (setts.customCategories)
                  setCustomCategories(setts.customCategories);
                setHasUnsavedChanges(true);
              }}
              onClearAllData={() => {
                setStocks([]);
                setTransactions([]);
                setAccounts([]);
                setAssetHistory([]);
                setGeneralAssets([]);
                setCashTransactions([]);
                setHouseholdTransactions([]);
                setRecurringCashRules([]);
                setPerformanceRecords([]);
                setBudgetItems([]);
                setAppTitle("SmartVest");
                setMarketData([]);
                setTechSettings(DEFAULT_TECH_SETTINGS);
                setCustomCategories(["市值型ETF", "高股息型ETF", "債券型ETF"]);
                localStorage.removeItem("smartvest_market_data");
                localStorage.removeItem("smartvest_tech_settings_v2");
              }}
              onSaveToPC={handleSaveToPC}
              onSaveAsToPC={handleSaveAsToPC}
              onOpenFromPC={handleOpenFromPC}
              currentFileName={fileName}
              currentAppPassword={appPassword}
              onUpdateAppPassword={(p) => {
                setAppPassword(p);
                localStorage.setItem(APP_PASSWORD_KEY, p);
              }}
              currentRecoveryKey={recoveryKey}
              onUpdateRecoveryKey={(k) => {
                setRecoveryKey(k);
                localStorage.setItem(RECOVERY_KEY_KEY, k);
              }}
            />
          )}
        </div>
      </main>
      {showTxForm && (
        <TransactionForm
          stocks={stocks}
          accounts={accounts}
          transactions={transactions}
          marketFilter={market}
          onSave={handleSaveTransaction}
          onSaveMany={handleSaveManyTransactions}
          onCancel={() => {
            setShowTxForm(false);
            setEditingTx(null);
          }}
          initialData={editingTx}
          defaultStockId={prefillStockId}
          defaultAccountId={prefillAccountId}
        />
      )}
    </div>
  );
}

export default App;
