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
  fetchHistoricalPrice,
  withTimeout,
  isTwMarketOpenNow,
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
// 停止操作後多久落地（debounce），以及連續操作時最長容忍多久一定要落地。
// 兩者都必須存在：只有 debounce 的話，使用者持續操作會讓計時器被無限重設，
// localStorage 永遠停在編輯開始前的舊快照，雲端備份也就跟著上傳舊資料。
const SAVE_DEBOUNCE_MS = 10000;
// 單一標的更新股價的時間上限，避免外部行情來源失聯時整個更新無止盡等待
const PRICE_UPDATE_PER_STOCK_MS = 20000;
// 更新開始前的共用批次抓取（ETF 淨值表、即時報價、全市場日收盤表）的時間上限。
// 這些是「有就更好」的資料，任一失敗都有後續退路，不該拖住整個更新。
const PRICE_UPDATE_PREFETCH_MS = 12000;
const SAVE_MAX_WAIT_MS = 10000;
const MOBILE_FILE_NAME = "smartvest_data.json";
const APP_PASSWORD_KEY = "smartvest_app_password";
const RECOVERY_KEY_KEY = "smartvest_recovery_key";

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
      // 趨勢分析已移除：清掉舊版留下的大盤日 K 與技術指標設定，
      // 這兩個 key 動輒數 MB，在 iPhone 有限的 localStorage 上特別佔空間。
      try {
        localStorage.removeItem("smartvest_market_data");
        localStorage.removeItem("smartvest_tech_settings_v2");
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

  // FORCE HEAL ALL WRONG TRANSACTIONS (STOCK + CASH + HOUSE)
  useEffect(() => {
    if (!isInitialized || transactions.length === 0) return;

    let needsUpdate = false;
    const nextTxs = transactions.map(tx => {
        if (tx.date < '2026-08-01') return tx;
        if (!tx.isDCA) return tx;
        const stock = stocks.find(s => s.id === tx.stockId);
        if (!stock) return tx;

        const isUS = stock.currency === "USD" || (stock.market as string) === "US" || stock.market === Market.US;
        if (isUS && tx.type === TransactionType.BUY) {
            const principalUSD = tx.price * tx.quantity;
            if (stock.monthlyTarget && stock.dcaSettings) {
                let totalDates = 0;
                stock.dcaSettings.forEach(s => { totalDates += s.dates.length });
                if (totalDates > 0) {
                    const amountPerDeduction = stock.monthlyTarget / totalDates;
                    // If principal USD is suspiciously close to the TWD amount, it's a bug!
                    if (Math.abs(principalUSD - amountPerDeduction) < 10) {
                        const correctRate = (tx.exchangeRate && tx.exchangeRate > 25) ? tx.exchangeRate : ((exchangeRate && exchangeRate > 25) ? exchangeRate : 32.5);
                        const effectiveAmount = amountPerDeduction / correctRate;
                        const correctQuantity = effectiveAmount / tx.price;
                        needsUpdate = true;
                        return {
                            ...tx,
                            quantity: correctQuantity,
                            exchangeRate: correctRate
                        };
                    }
                }
            }
        }
        return tx;
    });

    if (needsUpdate) {
        console.log("FORCE HEALED WRONG DCA TRANSACTIONS!");
        setTransactions(nextTxs);
    }

    // Also sweep all cash and house txs to make sure they match the stock tx
    let cashNeedsUpdate = false;
    const nextCash = cashTransactions.map(c => {
        if (c.date < '2026-08-01') return c;
        let stx = null;
        if (c.sourceTransactionId) {
            stx = nextTxs.find(t => t.id === c.sourceTransactionId);
        }
        if (!stx) {
            stx = nextTxs.find(t => {
                const s = stocks.find(stock => stock.id === t.stockId);
                return s && c.note && c.note.includes(s.name) && c.note.includes('(自動)') && (c.date === t.date || c.date === t.settlementDate) && t.isDCA;
            });
        }
        if (!stx) return c;
        const stock = stocks.find(s => s.id === stx.stockId);
        if (!stock) return c;

        const isUS = stock.currency === "USD" || (stock.market as string) === "US" || stock.market === Market.US;
        const principal = stx.price * stx.quantity;
        const fee = stx.fee || 0;
        let totalAmount = principal;

        if (stx.type === TransactionType.BUY) {
            totalAmount = principal + fee;
        } else if (stx.type === TransactionType.SELL) {
            totalAmount = principal - fee - (stx.tax || 0);
        } else if (stx.type === TransactionType.DIVIDEND) {
            totalAmount = principal - fee;
        }

        if (isUS) {
            totalAmount = Math.round(totalAmount * (stx.exchangeRate || exchangeRate));
        } else {
            totalAmount = Math.round(totalAmount);
        }

        if (c.amount !== totalAmount && totalAmount > 0) {
            console.log("HEALING CASH TX:", c.id, "Old amount:", c.amount, "New amount:", totalAmount, "Stock TX ID:", stx.id);
            cashNeedsUpdate = true;

            return { ...c, amount: totalAmount };
        }
        return c;
    });
    if (cashNeedsUpdate) {
        setCashTransactions(nextCash);
    }

    let houseNeedsUpdate = false;
    const nextHouse = householdTransactions.map(h => {
        if (h.date < '2026-08-01') return h;
        let stx = null;
        if (h.sourceTransactionId) {
            stx = nextTxs.find(t => t.id === h.sourceTransactionId);
        }
        if (!stx) {
            stx = nextTxs.find(t => {
                const s = stocks.find(stock => stock.id === t.stockId);
                return s && h.note && h.note.includes(s.name) && h.note.includes('(自動)') && (h.date === t.date || h.date === t.settlementDate) && t.isDCA;
            });
        }
        if (!stx) return h;
        const stock = stocks.find(s => s.id === stx.stockId);
        if (!stock) return h;

        const isUS = stock.currency === "USD" || (stock.market as string) === "US" || stock.market === Market.US;
        const principal = stx.price * stx.quantity;
        const fee = stx.fee || 0;
        let totalAmount = principal;

        if (stx.type === TransactionType.BUY) {
            totalAmount = principal + fee;
        } else if (stx.type === TransactionType.SELL) {
            totalAmount = principal - fee - (stx.tax || 0);
        } else if (stx.type === TransactionType.DIVIDEND) {
            totalAmount = principal - fee;
        }

        if (isUS) {
            totalAmount = Math.round(totalAmount * (stx.exchangeRate || exchangeRate));
        } else {
            totalAmount = Math.round(totalAmount);
        }

        if (h.amount !== totalAmount && totalAmount > 0) {
            console.log("HEALING HOUSE TX:", h.id, "Old amount:", h.amount, "New amount:", totalAmount, "Stock TX ID:", stx.id);
            houseNeedsUpdate = true;

            return { ...h, amount: totalAmount };
        }
        return h;
    });
    if (houseNeedsUpdate) {
        setHouseholdTransactions(nextHouse);
    }

  }, [transactions, cashTransactions, householdTransactions, isInitialized, stocks, exchangeRate]);

  // --- Auto DCA for Stocks ---
  useEffect(() => {
    if (!isInitialized || stocks.length === 0) return;

    const runSyncAutoDCA = async () => {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      const currentDay = today.getDate();

      let newStockTxs: Transaction[] = [];
      let updateStockTxs: Transaction[] = [];
      let newCashTxs: CashTransaction[] = [];
      let newHouseTxs: CashTransaction[] = [];

      for (const stock of stocks) {
        // Ensure we only process if there is a monthlyTarget and stock is not hidden
        if (!stock.monthlyTarget || stock.hidden) continue;
        const settings = stock.dcaSettings || (stock.dcaDates ? [{ accountId: 'UNASSIGNED', dates: stock.dcaDates }] : []);
        if (settings.length > 0) {

          let totalDates = 0;
          settings.forEach(s => { totalDates += s.dates.length });
          if (totalDates === 0) continue;

          const amountPerDeduction = stock.monthlyTarget / totalDates;

          for (const setting of settings) {
              let targetAccount = accounts.find(a => a.id === setting.accountId);
              let targetAccountId = setting.accountId;
              if (!targetAccount || targetAccountId === 'UNASSIGNED') {
                  targetAccount = accounts.find(a => a.isSecurities && !a.excludeFromTotals);
                  if (targetAccount) targetAccountId = targetAccount.id;
                  else continue;
              }

              for (const dcaDay of setting.dates) {
                 if (currentDay >= dcaDay) {
                    const txDate = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${dcaDay.toString().padStart(2, '0')}`;

                    // Enforce minimum start date of 2026-08-01 as requested
                    if (txDate < '2026-08-01') continue;
                    if (autoSyncStartDate && txDate < autoSyncStartDate) continue;

                    const existingStockTx = transactions.find(tx => 
                         tx.stockId === stock.id && 
                         tx.accountId === targetAccountId &&
                        (tx.dcaOriginalDate === txDate || (tx.date === txDate && tx.isDCA === true))
                    );

                    const isUS = stock.currency === "USD" || (stock.market === Market.US && !stock.currency);
                    let totalAmount = Math.round(amountPerDeduction); // TWD deduction amount

                    let txExchangeRate = exchangeRate;
                    let needsHeal = false;

                    if (existingStockTx && isUS && existingStockTx.isDCA) {
                        const principalUSD = existingStockTx.price * existingStockTx.quantity;
                        if (Math.abs(principalUSD - amountPerDeduction) < 5) {
                            needsHeal = true;
                        }
                    }

                    if (isUS && (!existingStockTx || needsHeal)) {
                      try {
                        let prevDateObj = new Date(txDate);
                        prevDateObj.setDate(prevDateObj.getDate() - 1);
                        const prevDateStr = prevDateObj.toISOString().split('T')[0];
                        const exRate = await withTimeout(fetchHistoricalPrice("TWD=X", prevDateStr), 8000);
                        if (exRate && exRate > 0) {
                          txExchangeRate = exRate;
                        }
                      } catch (e) {
                        console.warn("Failed to fetch exchange rate for App.tsx Auto DCA", e);
                      }
                    }

                    let targetCashAccountId = targetAccount!.linkedCashAccountId || targetAccount!.id;
                    let targetCashAccountName = targetAccount!.name;

                    if (!existingStockTx) {
                        const price = stock.currentPrice || stock.nav || 1;
                        const effectiveAmount = isUS ? amountPerDeduction / txExchangeRate : amountPerDeduction;
                        const quantity = effectiveAmount / price;

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
                            ...(isUS ? { exchangeRate: txExchangeRate } : {}),
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
                        if (needsHeal) {
                            const effectiveAmount = amountPerDeduction / ((existingStockTx.exchangeRate && existingStockTx.exchangeRate !== 1 ? existingStockTx.exchangeRate : txExchangeRate));
                            const correctQuantity = effectiveAmount / existingStockTx.price;
                            updateStockTxs.push({
                                ...existingStockTx,
                                quantity: correctQuantity,
                                exchangeRate: (existingStockTx.exchangeRate && existingStockTx.exchangeRate !== 1 ? existingStockTx.exchangeRate : txExchangeRate)
                            });
                        }

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
              }
          }
        }
      }

      if (newStockTxs.length > 0 || updateStockTxs.length > 0 || newCashTxs.length > 0 || newHouseTxs.length > 0) {
         if (newStockTxs.length > 0 || updateStockTxs.length > 0) {
             setTransactions(prev => {
                 let next = [...prev];
                 if (newStockTxs.length > 0) {
                     next = [...next, ...newStockTxs];
                 }
                 if (updateStockTxs.length > 0) {
                     next = next.map(t => {
                         const updated = updateStockTxs.find(u => u.id === t.id);
                         return updated ? updated : t;
                     });
                 }
                 return next;
             });
         }
         if (newCashTxs.length > 0) setCashTransactions(prev => [...prev, ...newCashTxs]);
         if (newHouseTxs.length > 0) setHouseholdTransactions(prev => [...prev, ...newHouseTxs]);
      }
    };

    runSyncAutoDCA();

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
      recurringCashRules,
      performanceRecords,
      budgetItems,
      appPassword,
      recoveryKey,
      customCategories,
      tenxStrategyConfig,
    ],
  );

  // 讓 persistData 永遠讀得到最新的匯出內容，又不必把自己重建一次。
  const getExportDataRef = useRef(getExportData);
  useEffect(() => {
    getExportDataRef.current = getExportData;
  }, [getExportData]);

  // 實際把目前記憶體中的資料寫入 localStorage／本機檔案。
  const persistData = useCallback(async () => {
    const data = getExportDataRef.current();
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
  }, [isDesktopMode, isMobileMode]);

  // 這一批未儲存的變更最晚必須在什麼時候落地。
  const saveDeadlineRef = useRef<number | null>(null);

  // 雲端備份／手動匯出前呼叫：立刻落地，確保打包到的是最新資料而非舊快照。
  const flushSave = useCallback(async () => {
    saveDeadlineRef.current = null;
    await persistData();
  }, [persistData]);

  useEffect(() => {
    if (!isInitialized) return;

    // 標記目前有尚未儲存的變更
    setHasUnsavedChanges(true);
    if (isDesktopMode || isMobileMode) setSaveStatus("idle");

    // 停止操作 SAVE_DEBOUNCE_MS 後才寫入，避免頻繁寫入過大資料造成延遲；
    // 但同時保證從第一筆未儲存的變更起，最多 SAVE_MAX_WAIT_MS 就一定會寫入。
    const now = Date.now();
    if (saveDeadlineRef.current === null) {
      saveDeadlineRef.current = now + SAVE_MAX_WAIT_MS;
    }
    const delay = Math.max(
      0,
      Math.min(SAVE_DEBOUNCE_MS, saveDeadlineRef.current - now),
    );

    const timer = setTimeout(() => {
      saveDeadlineRef.current = null;
      void persistData();
    }, delay);

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
    recurringCashRules,
    performanceRecords,
    budgetItems,
    isInitialized,
    isDesktopMode,
    isMobileMode,
    persistData,
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

      // 1. 共用批次資料：ETF 官方淨值表、台股盤中即時報價、全市場日收盤表。
      //
      // 這三者彼此不相依，過去是一段一段 await，等於把三段網路等待時間
      // 直接相加（光是 TWSE OpenAPI 的全市場日收盤表就要 8 秒以上）。
      // 改為一次並行，只花其中最慢的那一段。
      //
      // 即時報價的順序意義仍然保留在使用端：後面取價時一律「先看即時報價、
      // 再退回日收盤表」。FinMind / TWSE OpenAPI 的日線要等收盤後才有當日
      // 資料，盤中拿到的一律是昨天的收盤價，只有 mis.twse 有盤中即時價。
      let twseEtfList: any[] = [];
      let twRealtimeMap: Map<string, RealtimeQuote> | null = null;
      let twMarketMap: Map<string, { price: number; name?: string }> | null = null;

      const twCodes = stocks
        .filter(
          (s) =>
            s.market === Market.TW ||
            s.market === Market.BOND ||
            /^[0-9]{4,6}[A-Z]?(\.TW|\.TWO)?$/i.test(s.ticker || ""),
        )
        .map((s) => s.ticker);

      // 台股 ETF 代號一律以 00 開頭，沒有這類持股就不必抓官方淨值表
      //（實測 4.4 秒 / 61KB），它只服務於 ETF 的淨值欄位。
      const hasTwEtfHolding = stocks.some((s) => {
        if (s.hidden) return false;
        const code = String(s.ticker || "").split(".")[0].trim();
        return /^00/.test(code) || !!s.category?.includes("ETF");
      });

      const [twseDataResult, realtimeResult] = await Promise.all([
        (async () => {
          if (!hasTwEtfHolding) return null;
          try {
            if (isDesktopEnv) {
              const res = await window.electronAPI!.fetchTWSE();
              if (res.error) errorMessages.push(`TWSE Error: ${res.error}`);
              return res.data || null;
            }
            return await withTimeout(fetchTWSEEtfDirect(), PRICE_UPDATE_PREFETCH_MS);
          } catch (err: any) {
            console.error("Failed to fetch official TWSE ETF NAV data", err);
            errorMessages.push(`TWSE exception: ${err.message}`);
            return null;
          }
        })(),
        !isDesktopEnv && twCodes.length > 0
          ? withTimeout(fetchTWRealtimeBatch(twCodes), PRICE_UPDATE_PREFETCH_MS).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (twseDataResult?.a1) {
        twseEtfList = twseDataResult.a1.flatMap(
          (group: any) => group.msgArray || [],
        );
      }
      twRealtimeMap = realtimeResult;

      // 全市場日收盤表改為「按需才抓」。
      //
      // 2026-08-04 實測：TWSE OpenAPI 6.2 秒 / 318KB、TPEx OpenAPI 17.7 秒，
      // 而 mis.twse 只要 3~4 秒、1KB，且上市與上櫃都涵蓋，收盤後一樣給得出
      // 當日收盤價（z 欄位）。也就是說即時報價成功時，這張整個市場的日收盤
      // 大表完全是多餘的，卻是股價更新最大的一段等待。
      //
      // 因此只有在確實還有台股標的沒被即時報價涵蓋時（例如 mis.twse 查無的
      // 代號，或即時報價整批失敗）才去抓它，作為補漏用的後備。
      if (!isDesktopEnv) {
        const uncovered = twCodes.filter((t) => {
          const code = String(t || "").split(".")[0].trim().toUpperCase();
          return !twRealtimeMap?.has(code);
        });
        if (uncovered.length > 0) {
          twMarketMap = await withTimeout(
            fetchFullTWMarketPriceMap(),
            PRICE_UPDATE_PREFETCH_MS,
          ).catch(() => null);
        }
      }

      // 盤中卻拿不到即時價的台股標的。這些標的只能退回日收盤表（＝昨收），
      // 使用者需要知道，否則會誤以為更新成功、實際看到的卻是舊價格。
      const staleIntradayTickers: string[] = [];
      // 逾時、完全沒能更新到的標的
      const timedOutTickers: string[] = [];

      // 同一次更新中，同一個代號的 Yahoo 報價只抓一次。
      // ETF 的淨值區塊原本會對「完全相同的代號」再打一次完全相同的請求
      // （兩邊都只是讀 regularMarketPrice），等於每檔 ETF 白跑一趟網路。
      const quoteCache = new Map<string, Promise<any>>();
      const getYahooQuote = (symbol: string): Promise<any> => {
        const key = String(symbol || "").trim().toUpperCase();
        let hit = quoteCache.get(key);
        if (!hit) {
          hit = fetchCurrentYahooQuote(symbol);
          quoteCache.set(key, hit);
        }
        return hit;
      };

      // 2. Fetch prices & map NAV
      const updateOneStock = async (stock: Stock): Promise<Stock> => {
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
              updatedStock.marketState = "CLOSED";
              priceResolved = true;
              // 盤中走到這裡代表即時報價失敗，拿到的是日收盤（昨收），要告知使用者
              if (isTwMarketOpenNow()) {
                staleIntradayTickers.push(stock.ticker);
              }
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
                  const apiRes = await getYahooQuote(stock.ticker || stock.name);
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
              const apiRes = await getYahooQuote(finalSymbol);
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
                const otcApiRes = await getYahooQuote(
                  stock.ticker + ".TWO",
                );
                if (otcApiRes.success && otcApiRes.regularMarketPrice > 0) {
                  updatedStock.currentPrice = otcApiRes.regularMarketPrice;
                  finalSymbol = stock.ticker + ".TWO";
                }
              }
            }

            // 最後手段：前面所有來源都沒拿到價格時，才用 300 天歷史 K 線
            // 的最後一筆收盤價補上。
            //
            // 這裡原本是「無條件」為每一檔股票抓一次 300 天 K 線（台股失敗
            // 還會再補抓一次 .TWO）來計算 sma20/ema50/ema100，即使價格早就
            // 由 mis.twse 即時報價取得也照抓。但自從趨勢分析與動態平衡策略
            // 移除後，那三個欄位已經沒有任何畫面在讀，等於每次更新都為死資料
            // 付出全部標的的歷史 K 線流量，是股價更新最主要的耗時來源。
            if (!updatedStock.currentPrice || updatedStock.currentPrice <= 0) {
              try {
                const maRes = await fetchMADataForSymbol(finalSymbol);
                if (maRes?.currentPrice) {
                  updatedStock.currentPrice = maRes.currentPrice;
                } else if (
                  stock.market === Market.TW &&
                  finalSymbol.endsWith(".TW")
                ) {
                  const otcMaRes = await fetchMADataForSymbol(
                    stock.ticker + ".TWO",
                  );
                  if (otcMaRes?.currentPrice) {
                    updatedStock.currentPrice = otcMaRes.currentPrice;
                  }
                }
              } catch (e) {}
            }
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
                  const quoteRes = await getYahooQuote(finalSymbol);
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
      };

      // 每一檔各自設定時間上限。外部行情來源全數失聯時（例如使用者網路
      // 不通、或公用代理同時掛掉），過去會讓整個更新無止盡地等下去、
      // 連完成訊息都不會出現。逾時的標的保留原本價格，其餘照常更新，
      // 讓「股價更新」永遠會在可預期的時間內結束並回報結果。
      const updatedStocks = await Promise.all(
        stocks.map(async (stock) => {
          const done = await withTimeout(updateOneStock(stock), PRICE_UPDATE_PER_STOCK_MS);
          if (done) return done;
          timedOutTickers.push(stock.ticker);
          return stock;
        }),
      );
      setStocks(updatedStocks);

      // 盤中卻只拿到日收盤價時明確告知，不要讓使用者以為看到的是即時價
      const staleNotice =
        staleIntradayTickers.length > 0
          ? `\n\n⚠️ 以下 ${staleIntradayTickers.length} 檔目前為盤中，但即時報價來源暫時無法取得，` +
            `顯示的是最近一個交易日的收盤價，並非即時價：\n` +
            staleIntradayTickers.join("、") +
            `\n（稍後再按一次「股價更新」通常就會取得即時價）`
          : "";

      const timeoutNotice =
        timedOutTickers.length > 0
          ? `\n\n⏱️ 以下 ${timedOutTickers.length} 檔在時限內未能取得報價，已保留原本的價格：\n` +
            timedOutTickers.join("、")
          : "";

      if (errorMessages.length > 0) {
        alert(
          "部分股價更新失敗 (Partial Update Error):\n\n" +
            errorMessages.join("\n") +
            staleNotice +
            timeoutNotice,
        );
      } else if (staleNotice || timeoutNotice) {
        alert("股價與資產淨值已更新。" + staleNotice + timeoutNotice);
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
    exchangeRate,
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
                setCustomCategories(["市值型ETF", "高股息型ETF", "債券型ETF"]);
              }}
              onSaveToPC={handleSaveToPC}
              onSaveAsToPC={handleSaveAsToPC}
              onOpenFromPC={handleOpenFromPC}
              getExportData={getExportData}
              onFlushSave={flushSave}
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
