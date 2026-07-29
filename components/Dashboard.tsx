import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  PortfolioItem,
  Market,
  Transaction,
  Account,
  TransactionType,
  Stock,
  MarketFilter,
  CostMethod,
} from "../types";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import {
  Wallet,
  TrendingUp,
  DollarSign,
  PieChart as PieIcon,
  Layers,
  Coins,
  Activity,
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  Building2,
  Landmark,
  Sparkles,
  Percent,
  Search,
  Edit3,
  Save,
  FileText,
  Plus,
  Calculator,
  Check,
  Globe,
  Target,
  Trophy,
  Calendar,
  Split,
} from "lucide-react";
import { calculatePortfolio } from "../utils";

interface Props {
  portfolio: PortfolioItem[]; // Legacy prop, we might recalculate locally now
  market: MarketFilter;
  transactions: Transaction[];
  accounts: Account[];
  onUpdateStock: (stock: Stock) => void;
  exchangeRate: number;
  stocks: Stock[];
  stockOrder: string[];
  onUpdateOrder: (order: string[]) => void;
  onAddTransaction: (
    stockId?: string,
    accountId?: string,
    strategy?: string,
  ) => void;
  onNavigateToMarket?: (symbol: string) => void;
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
  "#f43f5e",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
];

// --- MultiSelect Component ---
const MultiSelect = ({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (val: string[]) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (id: string) => {
    if (id === "ALL") {
      onChange(["ALL"]);
    } else {
      let newValue = [...value];
      if (newValue.includes("ALL")) {
        newValue = [];
      }

      if (newValue.includes(id)) {
        newValue = newValue.filter((v) => v !== id);
      } else {
        newValue.push(id);
      }

      if (newValue.length === 0) {
        onChange(["ALL"]);
      } else {
        onChange(newValue);
      }
    }
  };

  const displayValue = value.includes("ALL")
    ? `所有${label}`
    : value.length === 1
      ? options.find((o) => o.id === value[0])?.name || value[0]
      : `已選 ${value.length} ${label}`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 bg-transparent text-slate-800 text-sm font-bold pl-2 pr-2 py-1 focus:outline-none min-w-[100px] hover:bg-slate-50 rounded transition-colors"
      >
        <span className="truncate max-w-[120px]">{displayValue}</span>
        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 max-h-[300px] overflow-y-auto animate-in fade-in zoom-in-95">
          <div
            onClick={() => toggleOption("ALL")}
            className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 cursor-pointer"
          >
            <div
              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${value.includes("ALL") ? "bg-blue-500 border-blue-500" : "border-slate-300"}`}
            >
              {value.includes("ALL") && (
                <Check size={10} className="text-white" />
              )}
            </div>
            <span
              className={`text-sm font-bold ${value.includes("ALL") ? "text-blue-600" : "text-slate-700"}`}
            >
              所有{label}
            </span>
          </div>
          <div className="h-px bg-slate-100 my-1"></div>
          {options.map((opt) => (
            <div
              key={opt.id}
              onClick={() => toggleOption(opt.id)}
              className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 cursor-pointer group"
            >
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${value.includes(opt.id) ? "bg-blue-500 border-blue-500" : "border-slate-300 group-hover:border-blue-300"}`}
              >
                {value.includes(opt.id) && (
                  <Check size={10} className="text-white" />
                )}
              </div>
              <span
                className={`text-sm font-medium truncate ${value.includes(opt.id) ? "text-slate-900" : "text-slate-600"}`}
              >
                {opt.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- XIRR Calculation Helper ---
const calculateXIRR = (
  values: number[],
  dates: Date[],
  guess = 0.1,
): number | null => {
  if (values.length !== dates.length || values.length < 2) return null;

  const maxIter = 50;
  const tol = 1e-6;
  let x0 = guess;

  // Check if we have both positive and negative cash flows
  let hasPos = false;
  let hasNeg = false;
  for (const v of values) {
    if (v > 0) hasPos = true;
    if (v < 0) hasNeg = true;
  }
  if (!hasPos || !hasNeg) return null;

  const t0 = dates[0].getTime(); // Reference date (first transaction)
  // Normalize dates to days fraction of year (365 days)
  const d = dates.map(
    (dt) => (dt.getTime() - t0) / (1000 * 60 * 60 * 24 * 365),
  );

  for (let i = 0; i < maxIter; i++) {
    let fValue = 0;
    let fDerivative = 0;

    for (let j = 0; j < values.length; j++) {
      const val = values[j];
      const dt = d[j];
      const base = 1 + x0;
      if (base <= 0) return null; // Invalid base for log/pow

      const discount = Math.pow(base, -dt);
      fValue += val * discount;
      fDerivative += -dt * val * Math.pow(base, -dt - 1);
    }

    if (Math.abs(fDerivative) < 1e-9) break; // Avoid division by zero
    const x1 = x0 - fValue / fDerivative;

    if (Math.abs(x1 - x0) < tol) {
      return x1;
    }
    x0 = x1;
  }

  // If no convergence, return null or best guess if reasonable
  if (!isNaN(x0) && x0 > -1) return x0;
  return null;
};

const Dashboard: React.FC<Props> = ({
  portfolio,
  market,
  transactions,
  accounts,
  onUpdateStock,
  exchangeRate,
  stocks,
  stockOrder,
  onUpdateOrder,
  onAddTransaction,
  onNavigateToMarket,
}) => {
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [filterAccountId, setFilterAccountId] = useState<string[]>(["ALL"]); // Changed to Array
  const [filterStockId, setFilterStockId] = useState<string[]>(["ALL"]); // Changed to Array
  const [searchTerm, setSearchTerm] = useState("");
  const [showCharts, setShowCharts] = useState(false);
  const [showAnnualized, setShowAnnualized] = useState(false);
  const [costMethod, setCostMethod] = useState<CostMethod>("FIFO"); // New State for Calculation Method

  const [draggingId, setDraggingId] = useState<string | null>(null);

  // States for Editing Notes
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [tempNote, setTempNote] = useState("");

  // State for Expanded Dividend Info
  const [expandedDivStockIds, setExpandedDivStockIds] = useState<Set<string>>(
    new Set(),
  );
  // State for Expanded Note Info
  const [expandedNoteStockIds, setExpandedNoteStockIds] = useState<Set<string>>(
    new Set(),
  );

  const toggleDivInfo = (stockId: string) => {
    const newSet = new Set(expandedDivStockIds);
    if (newSet.has(stockId)) {
      newSet.delete(stockId);
    } else {
      newSet.add(stockId);
    }
    setExpandedDivStockIds(newSet);
  };

  const toggleNoteInfo = (stockId: string) => {
    const newSet = new Set(expandedNoteStockIds);
    if (newSet.has(stockId)) {
      newSet.delete(stockId);
      if (editingNoteId === stockId) setEditingNoteId(null);
    } else {
      newSet.add(stockId);
    }
    setExpandedNoteStockIds(newSet);
  };

  useEffect(() => {
    if (selectedStockId) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setSelectedStockId(null);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [selectedStockId]);

  // --- Filter Logic ---
  // Updated to include Multi-Select Stock and Account Filter
  const currentTransactions = useMemo(() => {
    let txs = transactions;

    if (!filterAccountId.includes("ALL")) {
      const accSet = new Set(filterAccountId);
      txs = txs.filter((t) => accSet.has(String(t.accountId)));
    } else {
      // Exclude transactions from accounts marked as excludeFromTotals by default
      const excludedAccountIds = new Set(
        accounts.filter((a) => a.excludeFromTotals).map((a) => a.id),
      );
      txs = txs.filter((t) => !excludedAccountIds.has(String(t.accountId)));
    }

    if (!filterStockId.includes("ALL")) {
      const stockSet = new Set(filterStockId);
      txs = txs.filter((t) => stockSet.has(t.stockId));
    }

    return txs;
  }, [transactions, filterAccountId, filterStockId, accounts]);

  const currentPortfolio = useMemo(() => {
    // If we are using the default 'AVG' method and no filters, we *could* use the prop `portfolio`
    // but to support dynamic toggle consistency, we recalculate locally.

    let relevantStocks = stocks;
    if (market !== "ALL") {
      relevantStocks = relevantStocks.filter((s) => s.market === market);
    }
    if (!filterStockId.includes("ALL")) {
      const stockSet = new Set(filterStockId);
      relevantStocks = relevantStocks.filter((s) => stockSet.has(s.id));
    }

    // Pass the selected cost method to the utility function
    return calculatePortfolio(relevantStocks, currentTransactions, costMethod);
  }, [
    currentTransactions,
    filterAccountId,
    filterStockId,
    stocks,
    market,
    costMethod,
  ]);

  // Available Stocks for Dropdown (based on current market filter AND account filter)
  const availableStocks = useMemo(() => {
    let filtered = stocks.filter(
      (s) => market === "ALL" || s.market === market,
    );

    // Goal 2: If accounts are selected, only show stocks present in those accounts' transactions
    if (!filterAccountId.includes("ALL")) {
      const selectedAccountIds = new Set(filterAccountId);
      const accountStockIds = new Set(
        transactions
          .filter((t) => selectedAccountIds.has(String(t.accountId)))
          .map((t) => t.stockId),
      );
      filtered = filtered.filter((s) => accountStockIds.has(s.id));
    }

    return filtered.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [stocks, market, filterAccountId, transactions]);

  // --- Global Stats Calculation ---
  const isAll = market === "ALL";

  const normalizeValue = (item: PortfolioItem, value: number) => {
    // 重要修正：判斷幣別而非判斷市場
    const isUSD =
      item.stock.currency === "USD" ||
      (item.stock.market === Market.US && !item.stock.currency);

    if (isAll && isUSD) {
      return value * exchangeRate;
    }
    return value;
  };

  // For Cost, use the historical totalCostTWD if available, otherwise fallback
  const totalCost = currentPortfolio.reduce((acc, item) => {
    const isUSD =
      item.stock.currency === "USD" ||
      (item.stock.market === Market.US && !item.stock.currency);
    if (item.totalCostTWD !== undefined) {
      if (market === Market.US && isUSD) {
        return acc + item.totalCost; // USD
      } else {
        return acc + item.totalCostTWD; // TWD (Historical)
      }
    }
    // Fallback (e.g. legacy data)
    return acc + normalizeValue(item, item.totalCost);
  }, 0);

  const totalCostTWD = currentPortfolio.reduce(
    (acc, item) =>
      acc +
      (item.totalCostTWD !== undefined
        ? item.totalCostTWD
        : item.totalCost * exchangeRate),
    0,
  );

  // Use cycleInitialCost as denominator for the entire portfolio to prevent distortion
  const totalCycleInitialCost = currentPortfolio.reduce((acc, item) => {
    const isUSD =
      item.stock.currency === "USD" ||
      (item.stock.market === Market.US && !item.stock.currency);
    if (item.cycleInitialCostTWD !== undefined) {
      if (market === Market.US && isUSD)
        return acc + (item.cycleInitialCost || item.totalCost);
      else return acc + item.cycleInitialCostTWD;
    }
    return acc + normalizeValue(item, item.cycleInitialCost || item.totalCost);
  }, 0);

  const totalMarketValue = currentPortfolio.reduce(
    (acc, item) => acc + normalizeValue(item, item.marketValue),
    0,
  );

  // Split calculations for Current vs Historical
  const currentTotalDividends = currentPortfolio.reduce((acc, item) => {
    const isUSD =
      item.stock.currency === "USD" ||
      (item.stock.market === Market.US && !item.stock.currency);
    if (item.totalDividendTWD !== undefined) {
      if (market === Market.US && isUSD) return acc + item.totalDividend;
      else return acc + item.totalDividendTWD;
    }
    return acc + normalizeValue(item, item.totalDividend);
  }, 0);

  const currentTotalDividendsTWD = currentPortfolio.reduce(
    (acc, item) =>
      acc +
      (item.totalDividendTWD !== undefined
        ? item.totalDividendTWD
        : item.totalDividend * exchangeRate),
    0,
  );

  const historicalTotalDividends = currentPortfolio.reduce((acc, item) => {
    const isUSD =
      item.stock.currency === "USD" ||
      (item.stock.market === Market.US && !item.stock.currency);
    if (item.historicalDividendTWD !== undefined) {
      if (market === Market.US && isUSD)
        return acc + (item.historicalDividend || 0);
      else return acc + item.historicalDividendTWD;
    }
    return acc + normalizeValue(item, item.historicalDividend || 0);
  }, 0);

  const currentTotalRealizedGain = currentPortfolio.reduce((acc, item) => {
    const isUSD =
      item.stock.currency === "USD" ||
      (item.stock.market === Market.US && !item.stock.currency);
    if (item.realizedGainTWD !== undefined) {
      if (market === Market.US && isUSD) return acc + item.realizedGain;
      else return acc + item.realizedGainTWD;
    }
    return acc + normalizeValue(item, item.realizedGain);
  }, 0);

  const currentTotalRealizedGainTWD = currentPortfolio.reduce(
    (acc, item) =>
      acc +
      (item.realizedGainTWD !== undefined
        ? item.realizedGainTWD
        : item.realizedGain * exchangeRate),
    0,
  );

  const historicalTotalRealizedGain = currentPortfolio.reduce((acc, item) => {
    const isUSD =
      item.stock.currency === "USD" ||
      (item.stock.market === Market.US && !item.stock.currency);
    if (item.historicalRealizedGainTWD !== undefined) {
      if (market === Market.US && isUSD)
        return acc + (item.historicalRealizedGain || 0);
      else return acc + item.historicalRealizedGainTWD;
    }
    return acc + normalizeValue(item, item.historicalRealizedGain || 0);
  }, 0);

  // Unrealized Gain = Market Value - Cost
  const totalUnrealizedGain = totalMarketValue - totalCost;
  const totalUnrealizedGainPercent =
    totalCost > 0 ? (totalUnrealizedGain / totalCost) * 100 : 0;
  const totalUnrealizedGainTWD = totalMarketValue * exchangeRate - totalCostTWD;

  // Current Total Return (Active Holdings)
  const currentTotalReturn =
    currentTotalRealizedGain + totalUnrealizedGain + currentTotalDividends;
  const currentTotalReturnPercent =
    totalCycleInitialCost > 0
      ? (currentTotalReturn / totalCycleInitialCost) * 100
      : totalCost > 0
        ? (currentTotalReturn / totalCost) * 100
        : 0;
  const currentTotalReturnTWD =
    currentTotalRealizedGainTWD +
    totalUnrealizedGainTWD +
    currentTotalDividendsTWD;

  // Historical Total Return (Sold Out)
  const historicalTotalReturn =
    historicalTotalRealizedGain + historicalTotalDividends;

  const activeHoldings = currentPortfolio.filter((p) => p.totalShares > 0);

  // --- Sort Logic ---
  const allItems = useMemo(() => {
    // Filter out stocks based on visibility rules (Req 1 & Req 2)
    const filteredPortfolio = currentPortfolio.filter((item) => {
      // 0. Search Filter (Search overrides some visibility rules but respects manual hide)
      if (searchTerm.trim() !== "") {
        const term = searchTerm.toLowerCase();
        const matches =
          item.stock.name.toLowerCase().includes(term) ||
          item.stock.ticker.toLowerCase().includes(term);
        if (!matches) return false;
        // If it matches search, we might want to show it even if shares are 0 and it's old
        // but for now let's keep it strictly within the current list logic
      }

      // 1. Manual Hide Check
      if (item.stock.hidden) return false;

      // 2. Shares > 0 Check
      if (item.totalShares > 0) return true;

      // 3. Auto-hide if zero shares and no activity for > 5 days
      const stockTxs = currentTransactions.filter(
        (t) => t.stockId === item.stock.id,
      );

      // If never traded or just added, keep it visible (treat as new)
      if (stockTxs.length === 0) return true;

      // Find latest transaction date
      // Note: dates are stored as YYYY-MM-DD string, simple comparison works
      const sortedTxs = stockTxs.sort((a, b) => b.date.localeCompare(a.date));
      const lastTxDate = new Date(sortedTxs[0].date);
      const today = new Date();

      // Normalize time to midnight for accurate day difference
      lastTxDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);

      const diffTime = today.getTime() - lastTxDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Hide if more than 5 days have passed since last activity
      return diffDays <= 5;
    });

    const defaultSorted = [...filteredPortfolio].sort((a, b) => {
      if (a.totalShares > 0 && b.totalShares === 0) return -1;
      if (a.totalShares === 0 && b.totalShares > 0) return 1;
      const costA = normalizeValue(a, a.totalCost);
      const costB = normalizeValue(b, b.totalCost);
      return costB - costA;
    });

    if (!stockOrder || stockOrder.length === 0) return defaultSorted;

    return defaultSorted.sort((a, b) => {
      const idxA = stockOrder.indexOf(a.stock.id);
      const idxB = stockOrder.indexOf(b.stock.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });
  }, [
    currentPortfolio,
    stockOrder,
    market,
    exchangeRate,
    currentTransactions,
    searchTerm,
  ]);

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = "0.5";
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggingId(null);
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = "1";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggingId || draggingId === targetId) return;

    const currentList = allItems.map((item) => item.stock.id);
    let newOrder = stockOrder && stockOrder.length > 0 ? [...stockOrder] : [];

    currentList.forEach((id) => {
      if (!newOrder.includes(id)) newOrder.push(id);
    });

    newOrder = newOrder.filter(
      (id) => currentList.includes(id) || stockOrder.includes(id),
    );

    const fromIndex = newOrder.indexOf(draggingId);
    const toIndex = newOrder.indexOf(targetId);

    if (fromIndex !== -1 && toIndex !== -1) {
      newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, draggingId);
      onUpdateOrder(newOrder);
    }
  };

  // --- Charts Data Preparation ---
  // 1. Stock Allocation
  const stockAllocationDataCost = activeHoldings
    .map((item) => ({
      name: item.stock.name,
      value: normalizeValue(item, item.totalCost),
    }))
    .sort((a, b) => b.value - a.value);

  const stockAllocationDataMarket = activeHoldings
    .map((item) => ({
      name: item.stock.name,
      value: normalizeValue(item, item.marketValue),
    }))
    .sort((a, b) => b.value - a.value);

  // 2. Category Allocation
  const categoryMapCost = new Map<string, number>();
  activeHoldings.forEach((item) => {
    const cat = item.stock.category?.split(",")[0].trim() || "未分類";
    const normCost = normalizeValue(item, item.totalCost);
    categoryMapCost.set(cat, (categoryMapCost.get(cat) || 0) + normCost);
  });
  const categoryAllocationDataCost = Array.from(categoryMapCost.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const categoryMapMarket = new Map<string, number>();
  activeHoldings.forEach((item) => {
    const cat = item.stock.category?.split(",")[0].trim() || "未分類";
    const normValue = normalizeValue(item, item.marketValue);
    categoryMapMarket.set(cat, (categoryMapMarket.get(cat) || 0) + normValue);
  });
  const categoryAllocationDataMarket = Array.from(categoryMapMarket.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // 3. Market Allocation (TW / US / FUND / BOND / COMMODITY)
  const marketMapCost = new Map<string, number>();
  activeHoldings.forEach((item) => {
    let label = "其他";
    if (item.stock.market === Market.TW) label = "台股";
    else if (item.stock.market === Market.US) label = "美股";
    else if (item.stock.market === Market.FUND) label = "基金";
    else if (item.stock.market === Market.BOND) label = "債券";
    else if (item.stock.market === Market.COMMODITY) label = "原物料";

    const normCost = normalizeValue(item, item.totalCost);
    marketMapCost.set(label, (marketMapCost.get(label) || 0) + normCost);
  });
  const marketAllocationDataCost = Array.from(marketMapCost.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const marketMapMarket = new Map<string, number>();
  activeHoldings.forEach((item) => {
    let label = "其他";
    if (item.stock.market === Market.TW) label = "台股";
    else if (item.stock.market === Market.US) label = "美股";
    else if (item.stock.market === Market.FUND) label = "基金";
    else if (item.stock.market === Market.BOND) label = "債券";
    else if (item.stock.market === Market.COMMODITY) label = "原物料";

    const normValue = normalizeValue(item, item.marketValue);
    marketMapMarket.set(label, (marketMapMarket.get(label) || 0) + normValue);
  });
  const marketAllocationDataMarket = Array.from(marketMapMarket.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // --- Helpers ---
  const formatCurrency = (val: number, forceStock?: Stock) => {
    // 優先根據標的設定的幣別來顯示單位
    let currency = "TWD";
    if (forceStock) {
      currency =
        forceStock.currency === "USD" ||
        (forceStock.market === Market.US && !forceStock.currency)
          ? "USD"
          : "TWD";
    } else {
      // 如果沒傳特定標的（全局彙整），則根據市場篩選器
      currency = market === Market.US ? "USD" : "TWD";
    }

    return new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: currency === "USD" ? 2 : 0,
      maximumFractionDigits: currency === "USD" ? 3 : 0,
    }).format(val);
  };

  const formatPercent = (val: number) => {
    const sign = val > 0 ? "+" : "";
    return `${sign}${val.toFixed(2)}%`;
  };

  const getPnlColor = (val: number) => {
    if (val > 0) return "text-rose-500";
    if (val < 0) return "text-emerald-500";
    return "text-slate-600";
  };

  const getAccountName = (id: string) =>
    accounts.find((a) => a.id === id)?.name || "未知帳戶";

  const handlePriceUpdate = (stock: Stock, newVal: string) => {
    const price = parseFloat(newVal);
    if (!isNaN(price)) {
      onUpdateStock({ ...stock, currentPrice: price });
    }
  };

  const handleSaveNote = (stock: Stock) => {
    onUpdateStock({ ...stock, note: tempNote });
    setEditingNoteId(null);
  };

  const formatConvertedTWD = (val: number, actualTWD?: number) => {
    if (market !== Market.US) return null;
    const twd = actualTWD !== undefined ? actualTWD : val * exchangeRate;
    return (
      <div className="text-xs text-slate-400 font-medium font-mono mt-1 opacity-80">
        ≈ NT$ {twd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
    );
  };

  // --- Calculate XIRR for an item ---
  const getItemPerformance = (item: PortfolioItem) => {
    // 1. Filter relevant transactions
    const txs = currentTransactions.filter((t) => t.stockId === item.stock.id);
    if (txs.length === 0) return { annualized: null, monthly: null };

    const values: number[] = [];
    const dates: Date[] = [];

    txs.forEach((t) => {
      const total = t.price * t.quantity;
      const fee = t.fee || 0;
      let amount = 0;

      if (t.type === TransactionType.BUY) amount = -(total + fee);
      else if (t.type === TransactionType.SELL) amount = total - fee;
      else if (t.type === TransactionType.DIVIDEND) amount = total - fee;

      values.push(amount);
      dates.push(new Date(t.date));
    });

    // Add Current Market Value (if holding)
    if (item.totalShares > 0) {
      values.push(item.marketValue);
      dates.push(new Date());
    }

    // Calculate Annualized Return (XIRR)
    const annualizedRate = calculateXIRR(values, dates);

    let annualizedPercent = null;
    let monthlyPercent = null;

    if (annualizedRate !== null) {
      annualizedPercent = annualizedRate * 100;
      // Monthly Return = (1 + Annual)^(1/12) - 1
      monthlyPercent = (Math.pow(1 + annualizedRate, 1 / 12) - 1) * 100;
    }

    return { annualized: annualizedPercent, monthly: monthlyPercent };
  };

  // --- Components ---
  const StatCard = ({
    title,
    value,
    sub,
    icon: Icon,
    colorClass,
    gradient,
  }: any) => (
    <div
      className={`relative overflow-hidden p-5 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 card-hover bg-white border border-slate-100 group animate-in fade-in zoom-in-95`}
    >
      <div
        className={`absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10 ${gradient} group-hover:scale-150 transition-transform duration-500`}
      ></div>

      <div className="relative z-10 flex flex-col h-full justify-between">
        <div className="flex items-center gap-2 mb-3">
          <div
            className={`p-2 rounded-lg ${colorClass} bg-opacity-10 text-white shadow-sm`}
          >
            <Icon
              size={18}
              className={`${colorClass.replace("bg-", "text-")}`}
            />
          </div>
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">
            {title}
          </h3>
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-800 tracking-tight font-mono">
            {value}
          </div>
          {sub}
        </div>
      </div>
    </div>
  );

  const AllocationCard = ({
    title,
    icon,
    data,
    total,
    emptyMsg,
  }: {
    title: string;
    icon: React.ReactNode;
    data: { name: string; value: number }[];
    total: number;
    emptyMsg: string;
  }) => {
    const sortedData = [...data].sort((a, b) => b.value - a.value);

    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full transition-all hover:shadow-md">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-50">
          <div className="p-2 bg-slate-50 text-slate-600 rounded-xl">
            {icon}
          </div>
          <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
        </div>

        {sortedData.length > 0 ? (
          <div className="flex flex-col sm:flex-row items-center h-full gap-6">
            <div className="w-full sm:w-1/2 h-[220px] min-h-[220px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    {sortedData.map((entry, index) => (
                      <linearGradient
                        key={`grad-${index}`}
                        id={`color-${index}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={COLORS[index % COLORS.length]}
                          stopOpacity={1}
                        />
                        <stop
                          offset="100%"
                          stopColor={COLORS[index % COLORS.length]}
                          stopOpacity={0.8}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <Pie
                    data={sortedData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    cornerRadius={6}
                  >
                    {sortedData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={`url(#color-${index})`}
                        strokeWidth={0}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={
                      <CustomTooltip
                        total={total}
                        market={market === "ALL" ? Market.TW : market}
                      />
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="w-full sm:w-1/2 flex flex-col gap-2.5 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
              {sortedData.map((entry, index) => {
                const percent =
                  total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0.0";
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between text-xs w-full group p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className="w-3 h-3 rounded-md shrink-0 shadow-sm"
                        style={{
                          backgroundColor: COLORS[index % COLORS.length],
                        }}
                      />
                      <span
                        className="text-slate-600 font-medium truncate group-hover:text-slate-900 transition-colors"
                        title={entry.name}
                      >
                        {entry.name}
                      </span>
                    </div>
                    <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded ml-2 whitespace-nowrap">
                      {percent}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 min-h-[200px] gap-2">
            <Layers size={32} className="opacity-20" />
            <span className="text-sm font-medium">{emptyMsg}</span>
          </div>
        )}
      </div>
    );
  };

  const renderDetailView = () => {
    if (!selectedStockId) return null;
    const stockItem = currentPortfolio.find(
      (p) => p.stock.id === selectedStockId,
    );
    if (!stockItem) return null;
    const stock = stockItem.stock;

    const stockTransactions = currentTransactions
      .filter((t) => t.stockId === selectedStockId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const getIcon = (type: TransactionType) => {
      switch (type) {
        case TransactionType.BUY:
          return <ArrowDownRight className="text-emerald-500" size={16} />;
        case TransactionType.SELL:
          return <ArrowUpRight className="text-rose-500" size={16} />;
        case TransactionType.DIVIDEND:
          return <Coins className="text-amber-500" size={16} />;
        case TransactionType.SPLIT:
          return <Split className="text-purple-500" size={16} />;
      }
    };

    return (
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-300">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white rounded-t-2xl">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setSelectedStockId(null);
                setFilterAccountId(["ALL"]);
              }}
              className="p-2 hover:bg-white hover:shadow-md rounded-full text-slate-500 transition-all"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                {stock.name}
                <span
                  className={`text-sm font-bold px-2.5 py-1 rounded-lg border ${
                    stock.market === Market.TW
                      ? "bg-blue-50 text-blue-600 border-blue-100"
                      : stock.market === Market.US
                        ? "bg-green-50 text-green-600 border-green-100"
                        : stock.market === Market.BOND
                          ? "bg-cyan-50 text-cyan-600 border-cyan-100"
                          : stock.market === Market.COMMODITY
                            ? "bg-orange-50 text-orange-600 border-orange-100"
                            : "bg-purple-50 text-purple-600 border-purple-100"
                  }`}
                >
                  {stock.ticker}
                  {stock.market === Market.TW &&
                    (stock.ticker.endsWith(".TW") ||
                      stock.ticker.endsWith(".TWO")) && (
                      <span
                        className={`text-[10px] px-1 py-0.5 rounded leading-none border bg-white/50 ${stock.ticker.endsWith(".TWO") ? "text-teal-600 border-teal-200" : "text-blue-600 border-blue-200"}`}
                      >
                        {stock.ticker.endsWith(".TWO") ? "上櫃" : "上市"}
                      </span>
                    )}
                </span>
              </h2>
            </div>
          </div>
          <div className="flex gap-2">
            {!filterAccountId.includes("ALL") && (
              <span className="px-4 py-1.5 bg-blue-600 text-white text-xs rounded-full font-bold flex items-center gap-2 shadow-lg shadow-blue-200">
                <Wallet size={14} />
                {filterAccountId.length === 1
                  ? getAccountName(filterAccountId[0])
                  : `多帳戶 (${filterAccountId.length})`}
              </span>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-4 font-bold">日期</th>
                <th className="px-8 py-4 font-bold">帳戶</th>
                <th className="px-8 py-4 font-bold">類別</th>
                <th className="px-8 py-4 font-bold text-right">單價</th>
                <th className="px-8 py-4 font-bold text-right">數量</th>
                <th className="px-8 py-4 font-bold text-right">總金額</th>
                <th className="px-8 py-4 font-bold">備註</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockTransactions.map((tx) => {
                const principal = tx.price * tx.quantity;
                const fee = tx.fee || 0;
                let total = principal;
                if (tx.type === TransactionType.BUY) total = principal + fee;
                else if (tx.type === TransactionType.SELL)
                  total = principal - fee;
                else if (tx.type === TransactionType.DIVIDEND)
                  total = principal - fee;
                else if (tx.type === TransactionType.SPLIT) total = 0;

                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-8 py-4 text-slate-600 font-medium">
                      {tx.date}
                    </td>
                    <td className="px-8 py-4">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-bold">
                        {getAccountName(tx.accountId)}
                      </span>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-2 font-medium">
                        {getIcon(tx.type)}{" "}
                        <span>
                          {tx.type === TransactionType.BUY
                            ? "買進"
                            : tx.type === TransactionType.SELL
                              ? "賣出"
                              : tx.type === TransactionType.SPLIT
                                ? "股票分割"
                                : "領息"}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-right font-mono text-slate-600">
                      {tx.type === TransactionType.DIVIDEND ||
                      tx.type === TransactionType.SPLIT
                        ? "-"
                        : tx.price.toLocaleString(undefined, {
                            maximumFractionDigits:
                              stock.market === Market.US ? 4 : 2,
                            minimumFractionDigits:
                              stock.market === Market.US ? 3 : 2,
                          })}
                    </td>
                    <td className="px-8 py-4 text-right font-mono text-slate-600">
                      {tx.type === TransactionType.DIVIDEND
                        ? "-"
                        : tx.quantity.toLocaleString(undefined, {
                            maximumFractionDigits: 5,
                          })}
                    </td>
                    <td className="px-8 py-4 text-right font-mono font-bold text-slate-800">
                      {Math.abs(total).toLocaleString(undefined, {
                        maximumFractionDigits:
                          stock.market === Market.US ? 3 : 0,
                        minimumFractionDigits:
                          stock.market === Market.US ? 3 : 0,
                      })}
                    </td>
                    <td className="px-8 py-4 text-slate-400 italic max-w-xs truncate">
                      {tx.note || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (selectedStockId) return renderDetailView();

  const emptyMsg =
    !filterAccountId.includes("ALL") || !filterStockId.includes("ALL")
      ? "此篩選條件下無部位"
      : "無持有部位";
  const emptyMsgCat =
    !filterAccountId.includes("ALL") || !filterStockId.includes("ALL")
      ? "無分類數據"
      : "無分類數據";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* --- 8-GRID STATS --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <StatCard
          title="總市值"
          value={formatCurrency(totalMarketValue)}
          sub={formatConvertedTWD(totalMarketValue)}
          icon={Building2}
          colorClass="bg-blue-500"
          gradient="bg-gradient-to-br from-blue-400 to-blue-600"
        />
        <StatCard
          title="總成本"
          value={formatCurrency(totalCost)}
          sub={
            market === Market.US
              ? formatConvertedTWD(totalCost, totalCostTWD)
              : null
          } // Only show approx if US market selected
          icon={Wallet}
          colorClass="bg-slate-500"
          gradient="bg-gradient-to-br from-slate-400 to-slate-600"
        />
        <StatCard
          title="未實現損益"
          value={formatCurrency(totalUnrealizedGain)}
          sub={formatConvertedTWD(totalUnrealizedGain, totalUnrealizedGainTWD)}
          icon={Activity}
          colorClass={
            totalUnrealizedGain >= 0 ? "bg-rose-500" : "bg-emerald-500"
          }
          gradient={
            totalUnrealizedGain >= 0
              ? "bg-gradient-to-br from-rose-400 to-rose-600"
              : "bg-gradient-to-br from-emerald-400 to-emerald-600"
          }
        />
        <StatCard
          title="未實現報酬率"
          value={formatPercent(totalUnrealizedGainPercent)}
          sub={
            <div
              className={`text-xs font-bold mt-1 ${getPnlColor(totalUnrealizedGainPercent)}`}
            >
              不含股息
            </div>
          }
          icon={BarChart3}
          colorClass={
            totalUnrealizedGainPercent >= 0 ? "bg-rose-500" : "bg-emerald-500"
          }
          gradient={
            totalUnrealizedGainPercent >= 0
              ? "bg-gradient-to-br from-rose-400 to-rose-600"
              : "bg-gradient-to-br from-emerald-400 to-emerald-600"
          }
        />
        <StatCard
          title="總報酬 (含息)"
          value={formatCurrency(currentTotalReturn)}
          sub={
            <div className="flex flex-col">
              {formatConvertedTWD(currentTotalReturn, currentTotalReturnTWD)}
              {historicalTotalReturn !== 0 && (
                <div className="text-[10px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-200/50 flex justify-between items-center gap-2">
                  <span className="font-medium opacity-80">歷史結算:</span>
                  <span
                    className={`font-bold font-mono ${historicalTotalReturn >= 0 ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {historicalTotalReturn > 0 ? "+" : ""}
                    {formatCurrency(historicalTotalReturn)}
                  </span>
                </div>
              )}
            </div>
          }
          icon={TrendingUp}
          colorClass={
            currentTotalReturn >= 0 ? "bg-rose-500" : "bg-emerald-500"
          }
          gradient={
            currentTotalReturn >= 0
              ? "bg-gradient-to-br from-rose-400 to-rose-600"
              : "bg-gradient-to-br from-emerald-400 to-emerald-600"
          }
        />
        <StatCard
          title="總報酬率 (含息)"
          value={formatPercent(currentTotalReturnPercent)}
          sub={
            <div className="text-xs text-slate-400 mt-1 font-medium">
              ROI (當下)
            </div>
          }
          icon={TrendingUp}
          colorClass={
            currentTotalReturnPercent >= 0 ? "bg-rose-500" : "bg-emerald-500"
          }
          gradient={
            currentTotalReturnPercent >= 0
              ? "bg-gradient-to-br from-rose-400 to-rose-600"
              : "bg-gradient-to-br from-emerald-400 to-emerald-600"
          }
        />
        <StatCard
          title="已實現損益"
          value={formatCurrency(currentTotalRealizedGain)}
          sub={
            <div className="flex flex-col">
              {formatConvertedTWD(
                currentTotalRealizedGain,
                currentTotalRealizedGainTWD,
              )}
              {historicalTotalRealizedGain !== 0 && (
                <div className="text-[10px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-200/50 flex justify-between items-center gap-2">
                  <span className="font-medium opacity-80">歷史結算:</span>
                  <span
                    className={`font-bold font-mono ${historicalTotalRealizedGain >= 0 ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {historicalTotalRealizedGain > 0 ? "+" : ""}
                    {formatCurrency(historicalTotalRealizedGain)}
                  </span>
                </div>
              )}
            </div>
          }
          icon={DollarSign}
          colorClass="bg-amber-500"
          gradient="bg-gradient-to-br from-amber-400 to-amber-600"
        />
        <StatCard
          title="累積領息"
          value={formatCurrency(currentTotalDividends)}
          sub={
            <div className="flex flex-col">
              {formatConvertedTWD(
                currentTotalDividends,
                currentTotalDividendsTWD,
              )}
              {historicalTotalDividends !== 0 && (
                <div className="text-[10px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-200/50 flex justify-between items-center gap-2">
                  <span className="font-medium opacity-80">歷史結算:</span>
                  <span className="font-bold font-mono text-purple-600">
                    +{formatCurrency(historicalTotalDividends)}
                  </span>
                </div>
              )}
            </div>
          }
          icon={Coins}
          colorClass="bg-purple-500"
          gradient="bg-gradient-to-br from-purple-400 to-purple-600"
        />
      </div>

      {/* --- COLLAPSIBLE CHART SECTION --- */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <button
          onClick={() => setShowCharts(!showCharts)}
          className="w-full flex items-center justify-between p-5 bg-gradient-to-r from-slate-50 to-white transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 text-blue-600 p-2 rounded-xl">
              <PieIcon size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg">
                資產配置圖表分析
              </h3>
              {!showCharts && (
                <p className="text-xs text-slate-500 mt-0.5">
                  點擊展開詳細圖表
                </p>
              )}
            </div>
          </div>
          {showCharts ? (
            <ChevronUp size={24} className="text-slate-400" />
          ) : (
            <ChevronDown size={24} className="text-slate-400" />
          )}
        </button>

        {showCharts && (
          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-50/30 border-t border-slate-100 animate-in slide-in-from-top-2">
            {/* Cost Row */}
            <AllocationCard
              title="市場占比分析 (成本)"
              icon={<Globe size={20} className="text-indigo-600" />}
              data={marketAllocationDataCost}
              total={totalCost}
              emptyMsg={emptyMsg}
            />
            <AllocationCard
              title="股票標的占比 (成本)"
              icon={<PieIcon size={20} className="text-blue-600" />}
              data={stockAllocationDataCost}
              total={totalCost}
              emptyMsg={emptyMsg}
            />
            <AllocationCard
              title="股票分類占比 (成本)"
              icon={<Layers size={20} className="text-purple-600" />}
              data={categoryAllocationDataCost}
              total={totalCost}
              emptyMsg={emptyMsgCat}
            />

            {/* Market Value Row */}
            <AllocationCard
              title="市場占比分析 (市值)"
              icon={<Globe size={20} className="text-teal-600" />}
              data={marketAllocationDataMarket}
              total={totalMarketValue}
              emptyMsg={emptyMsg}
            />
            <AllocationCard
              title="股票標的占比 (市值)"
              icon={<PieIcon size={20} className="text-emerald-600" />}
              data={stockAllocationDataMarket}
              total={totalMarketValue}
              emptyMsg={emptyMsg}
            />
            <AllocationCard
              title="股票分類占比 (市值)"
              icon={<Layers size={20} className="text-amber-600" />}
              data={categoryAllocationDataMarket}
              total={totalMarketValue}
              emptyMsg={emptyMsgCat}
            />
          </div>
        )}
      </div>

      {/* --- STOCK CARDS --- */}
      <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                <Layers size={20} />
              </div>
              股票標的明細
            </h3>

            <div className="flex flex-wrap items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
              <div className="relative border-r border-slate-200 pr-2 mr-1">
                <MultiSelect
                  label="帳戶"
                  options={accounts
                    .filter((a) => a.isSecurities !== false)
                    .map((a) => ({ id: a.id, name: a.name }))}
                  value={filterAccountId}
                  onChange={setFilterAccountId}
                />
              </div>

              <div className="relative">
                <MultiSelect
                  label="標的"
                  options={availableStocks.map((s) => ({
                    id: s.id,
                    name: `${s.ticker} ${s.name}`,
                  }))}
                  value={filterStockId}
                  onChange={setFilterStockId}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-300 transition-all">
              <Search size={14} className="text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜尋名稱或代號..."
                className="bg-transparent text-xs font-bold text-slate-700 outline-none w-24 sm:w-32 placeholder:text-slate-300 placeholder:font-medium"
              />
            </div>

            <div className="flex items-center gap-2 bg-white p-1 rounded-full border border-slate-200 shadow-sm">
              <button
                onClick={() => setCostMethod("AVG")}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${
                  costMethod === "AVG"
                    ? "bg-blue-100 text-blue-700 shadow-sm"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                平均成本
              </button>
              <button
                onClick={() => setCostMethod("FIFO")}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-all flex items-center gap-1 ${
                  costMethod === "FIFO"
                    ? "bg-indigo-100 text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Calculator size={12} /> 先進先出
              </button>
            </div>

            <button
              onClick={() => setShowAnnualized(!showAnnualized)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                showAnnualized
                  ? "bg-amber-50 text-amber-600 border-amber-200"
                  : "bg-slate-50 text-slate-500 border-slate-200"
              }`}
            >
              <Percent size={14} />
              {showAnnualized
                ? "顯示: 年化報酬 (含息)"
                : "顯示: 累積報酬 (含息)"}
            </button>
          </div>
          <span className="text-sm font-medium text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
            {allItems.length} 標的
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allItems.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center gap-4">
              <div className="bg-slate-50 p-6 rounded-full">
                <Landmark size={48} className="text-slate-300" />
              </div>
              <p className="text-lg font-medium">尚無任何股票資料</p>
              <button
                onClick={() => onAddTransaction()}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2 rounded-full flex items-center gap-2 text-sm font-bold shadow-lg hover:shadow-xl transition-all"
              >
                <Plus size={16} />
                (股)記一筆
              </button>
            </div>
          ) : (
            allItems.map((item) => {
              const isSoldOut = item.totalShares === 0;
              const isDragging = draggingId === item.stock.id;

              // Performance calculation for Annualized view
              const { annualized, monthly } = showAnnualized
                ? getItemPerformance(item)
                : { annualized: null, monthly: null };

              // Latest Dividend Logic
              const latestDiv = currentTransactions
                .filter(
                  (t) =>
                    t.stockId === item.stock.id &&
                    t.type === TransactionType.DIVIDEND,
                )
                .sort(
                  (a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime(),
                )[0];

              const todayStr = new Date().toISOString().split("T")[0];
              // Goal 1: Show only if paymentDate is today or future, or undefined. If past, hide.
              const showDivInfo =
                latestDiv &&
                (!latestDiv.paymentDate || latestDiv.paymentDate >= todayStr);

              // Dividend Expand State
              const isDivExpanded = expandedDivStockIds.has(item.stock.id);

              // Determine card color stripe based on market
              const stripeColor =
                item.stock.market === Market.TW
                  ? "bg-blue-500"
                  : item.stock.market === Market.US
                    ? "bg-green-500"
                    : item.stock.market === Market.BOND
                      ? "bg-cyan-500"
                      : item.stock.market === Market.COMMODITY
                        ? "bg-orange-500"
                        : "bg-purple-500";

              // 重要修正：判斷幣別而非判斷市場
              const isUSD =
                item.stock.currency === "USD" ||
                (item.stock.market === Market.US && !item.stock.currency);
              const currencySymbol = isUSD ? "$" : "NT";

              // Calculate Monthly Investment Progress
              let monthlyProgress = 0;
              let currentMonthInvested = 0;
              if (item.stock.monthlyTarget && item.stock.monthlyTarget > 0) {
                const now = new Date();
                const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

                // Filter BUY transactions for this stock in the current month
                const monthlyBuyTxs = currentTransactions.filter(
                  (t) =>
                    t.stockId === item.stock.id &&
                    t.type === TransactionType.BUY &&
                    t.date.startsWith(currentMonthPrefix),
                );

                // Sum total cost in TWD
                // For US stocks, convert to TWD using transaction exchange rate (or global if missing)
                currentMonthInvested = monthlyBuyTxs.reduce((sum, t) => {
                  const rawCost = t.price * t.quantity + (t.fee || 0);
                  const rate = isUSD ? t.exchangeRate || exchangeRate : 1;
                  return sum + rawCost * rate;
                }, 0);

                currentMonthInvested = Math.round(currentMonthInvested); // Round to integer
                monthlyProgress =
                  (currentMonthInvested / item.stock.monthlyTarget) * 100;
              }

              // Calculate holding accounts
              const accountHoldings: Record<string, number> = {};
              currentTransactions.forEach((t) => {
                if (t.stockId === item.stock.id) {
                  if (!accountHoldings[t.accountId])
                    accountHoldings[t.accountId] = 0;
                  if (t.type === TransactionType.BUY)
                    accountHoldings[t.accountId] += t.quantity;
                  if (t.type === TransactionType.SELL)
                    accountHoldings[t.accountId] -= t.quantity;
                }
              });

              const holdingAccountsInfo = Object.entries(accountHoldings)
                .filter(([id, qty]) => qty > 0.0001)
                .map(([id]) => ({ id, name: getAccountName(id) }));

              return (
                <div
                  key={item.stock.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.stock.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, item.stock.id)}
                  className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all duration-300 relative group card-hover flex flex-col
                    ${isSoldOut ? "border-slate-200 opacity-70 grayscale-[0.5]" : "border-slate-100 hover:border-blue-200 hover:shadow-xl"}
                    ${isDragging ? "opacity-40 scale-95 ring-4 ring-blue-200" : ""}
                  `}
                >
                  {/* Market Stripe */}
                  <div className={`h-1.5 w-full ${stripeColor}`}></div>

                  {/* Drag Handle */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 text-slate-300 hover:text-blue-500 cursor-grab active:cursor-grabbing p-2 z-20 opacity-0 group-hover:opacity-100 transition-all bg-white/80 backdrop-blur rounded-full shadow-sm">
                    <GripHorizontal size={20} />
                  </div>

                  <div
                    className="cursor-pointer flex flex-col h-full"
                    onClick={() => setSelectedStockId(item.stock.id)}
                  >
                    <div className="px-6 py-5 border-b border-slate-50 flex justify-between items-start bg-gradient-to-b from-slate-50/50 to-white">
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="flex items-center gap-2.5">
                          <h4 className="text-xl font-bold text-slate-800 group-hover:text-blue-600 transition-colors tracking-tight font-mono">
                            {item.stock.name}
                          </h4>
                          {isSoldOut && (
                            <span className="text-[10px] px-2 py-0.5 bg-slate-200 text-slate-500 rounded-full font-bold">
                              已清倉
                            </span>
                          )}
                          {market === "ALL" && (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm ${
                                item.stock.market === Market.TW
                                  ? "bg-blue-100 text-blue-600"
                                  : item.stock.market === Market.US
                                    ? "bg-green-100 text-green-600"
                                    : item.stock.market === Market.BOND
                                      ? "bg-cyan-100 text-cyan-600"
                                      : item.stock.market === Market.COMMODITY
                                        ? "bg-orange-100 text-orange-600"
                                        : "bg-purple-100 text-purple-600"
                              }`}
                            >
                              {item.stock.market === Market.TW
                                ? "TW"
                                : item.stock.market === Market.US
                                  ? "US"
                                  : item.stock.market === Market.BOND
                                    ? "BOND"
                                    : item.stock.market === Market.COMMODITY
                                      ? "CMDTY"
                                      : "FUND"}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigateToMarket) {
                                onNavigateToMarket(item.stock.ticker);
                              }
                            }}
                            className="text-xs font-bold text-slate-500 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-2 py-1 rounded-md font-mono border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                            title="前往趨勢分析K線圖"
                          >
                            {item.stock.ticker}
                            {item.stock.market === Market.TW &&
                              (item.stock.ticker.endsWith(".TW") ||
                                item.stock.ticker.endsWith(".TWO")) && (
                                <span
                                  className={`text-[9px] px-1 py-0 rounded leading-none ${item.stock.ticker.endsWith(".TWO") ? "text-teal-600 bg-teal-50 border-teal-100/50" : "text-blue-600 bg-blue-50 border-blue-100/50"} border`}
                                >
                                  {item.stock.ticker.endsWith(".TWO")
                                    ? "上櫃"
                                    : "上市"}
                                </span>
                              )}
                          </button>
                          {holdingAccountsInfo.map((acc, idx) => (
                            <button
                              key={`${item.stock.id}-acc-${idx}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setFilterAccountId([acc.id]);
                                setSelectedStockId(item.stock.id);
                              }}
                              className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md flex items-center gap-1 shadow-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                              title="點擊查看此帳戶明細"
                            >
                              <Wallet
                                size={10}
                                className="text-slate-400 group-hover:text-blue-500"
                              />
                              {acc.name}
                            </button>
                          ))}
                          <div
                            className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-slate-200 focus-within:ring-2 focus-within:ring-blue-200 focus-within:border-blue-400 transition-all cursor-text shadow-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[10px] font-bold text-slate-400 uppercase">
                              {currencySymbol}
                            </span>
                            <input
                              key={`${item.stock.id}-${item.stock.currentPrice}`}
                              type="number"
                              step="0.01"
                              className="w-16 bg-transparent text-xs font-bold font-mono text-slate-700 outline-none p-0 border-none focus:ring-0"
                              placeholder="-"
                              defaultValue={item.stock.currentPrice}
                              onBlur={(e) =>
                                handlePriceUpdate(item.stock, e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handlePriceUpdate(
                                    item.stock,
                                    e.currentTarget.value,
                                  );
                                  e.currentTarget.blur();
                                }
                              }}
                            />
                          </div>

                          {item.stock.market === Market.US &&
                            item.stock.preMarketPrice != null &&
                            (!item.stock.marketState ||
                              item.stock.marketState.includes("PRE") ||
                              (!item.stock.marketState.includes("POST") &&
                                item.stock.marketState !== "CLOSED")) && (
                              <div
                                className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-600 px-2 py-1 rounded border border-amber-100/60 shadow-sm"
                                title="盤前價 (Pre-Market)"
                              >
                                <span className="font-bold opacity-80 backdrop-blur-sm">
                                  盤前
                                </span>
                                <span className="font-mono font-bold">
                                  ${item.stock.preMarketPrice.toFixed(2)}
                                </span>
                              </div>
                            )}
                          {item.stock.market === Market.US &&
                            item.stock.postMarketPrice != null &&
                            (!item.stock.marketState ||
                              item.stock.marketState.includes("POST") ||
                              item.stock.marketState === "CLOSED" ||
                              (!item.stock.marketState.includes("PRE") &&
                                !item.stock.marketState.includes(
                                  "REGULAR",
                                ))) && (
                              <div
                                className="flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded border border-indigo-100/60 shadow-sm"
                                title="盤後價 (Post-Market)"
                              >
                                <span className="font-bold opacity-80 backdrop-blur-sm">
                                  盤後
                                </span>
                                <span className="font-mono font-bold">
                                  ${item.stock.postMarketPrice.toFixed(2)}
                                </span>
                              </div>
                            )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Only pass account ID if exactly one account is selected (and it's not ALL)
                              const targetAccId =
                                filterAccountId.length === 1 &&
                                !filterAccountId.includes("ALL")
                                  ? filterAccountId[0]
                                  : undefined;
                              onAddTransaction(item.stock.id, targetAccId);
                            }}
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-2.5 py-1 rounded-full flex items-center gap-1 text-[10px] font-bold shadow-sm hover:shadow-md transition-all whitespace-nowrap"
                          >
                            <Plus size={10} />
                            <span>(股)記一筆</span>
                          </button>

                          {showDivInfo && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleDivInfo(item.stock.id);
                              }}
                              className={`px-2.5 py-1 rounded-full flex items-center gap-1 text-[10px] font-bold shadow-sm hover:shadow-md transition-all whitespace-nowrap border ${
                                isDivExpanded
                                  ? "bg-amber-100 text-amber-700 border-amber-200"
                                  : "bg-white text-amber-600 border-amber-200 hover:bg-amber-50"
                              }`}
                            >
                              <Coins size={10} />
                              最新除息
                              {isDivExpanded ? (
                                <ChevronUp size={10} />
                              ) : (
                                <ChevronDown size={10} />
                              )}
                            </button>
                          )}

                          {/* Note Button (Relocated Here) */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (item.stock.note) {
                                toggleNoteInfo(item.stock.id);
                              } else {
                                setEditingNoteId(item.stock.id);
                                setTempNote("");
                                setExpandedNoteStockIds((prev) =>
                                  new Set(prev).add(item.stock.id),
                                );
                              }
                            }}
                            className={`px-2.5 py-1 rounded-full flex items-center gap-1 text-[10px] font-bold shadow-sm hover:shadow-md transition-all whitespace-nowrap border ${
                              item.stock.note
                                ? expandedNoteStockIds.has(item.stock.id)
                                  ? "bg-amber-100 text-amber-700 border-amber-200"
                                  : "bg-white text-amber-600 border-amber-200 hover:bg-amber-50"
                                : "bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <FileText size={10} />
                            {item.stock.note ? "註釋" : "新增"}
                          </button>
                        </div>
                      </div>

                      {/* Right Side Info (ROI & NAV) */}
                      <div className="flex flex-col gap-2 items-end shrink-0">
                        {/* ROI Badge */}
                        <div
                          className={`px-2 py-1 rounded-lg border font-mono font-bold text-xs flex flex-col items-end ${item.totalReturnPercent >= 0 ? "bg-rose-50 border-rose-100 text-rose-600" : "bg-emerald-50 border-emerald-100 text-emerald-600"}`}
                        >
                          <span>
                            {item.totalReturnPercent > 0 ? "+" : ""}
                            {item.totalReturnPercent.toFixed(2)}%
                          </span>
                          <span className="text-[9px] font-medium opacity-70">
                            總報酬率
                          </span>
                        </div>

                        {/* NAV & Premium/Discount (only if NAV exists and not a FUND) */}
                        {item.stock.nav != null &&
                          item.stock.nav > 0 &&
                          item.stock.market !== Market.FUND && (
                            <div className="flex flex-col items-end gap-1 mt-1">
                              <div className="text-[10px] bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded font-bold shadow-sm flex items-center justify-between gap-2 min-w-[70px]">
                                <span className="opacity-80">淨值</span>
                                <span className="font-mono">
                                  {Number(item.stock.nav).toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 4,
                                    },
                                  )}
                                </span>
                              </div>
                              {item.stock.currentPrice != null &&
                                item.stock.currentPrice > 0 && (
                                  <div
                                    className={`text-[10px] border px-2 py-0.5 rounded font-bold shadow-sm flex items-center justify-between gap-2 min-w-[70px] ${(item.stock.currentPrice - item.stock.nav) / item.stock.nav > 0 ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"}`}
                                  >
                                    <span className="opacity-80">折溢價</span>
                                    <span className="font-mono">
                                      {(
                                        ((item.stock.currentPrice -
                                          item.stock.nav) /
                                          item.stock.nav) *
                                        100
                                      ).toFixed(2)}
                                      %
                                    </span>
                                  </div>
                                )}
                            </div>
                          )}
                      </div>
                    </div>

                    <div className="px-6 py-5 space-y-4 flex-1 flex flex-col">
                      {/* Dividend Month Display */}
                      {item.stock.dividendMonths &&
                        item.stock.dividendMonths.length > 0 && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded w-fit border border-amber-100">
                            <Calendar size={10} />
                            <span>
                              除息: {item.stock.dividendMonths.join(", ")}月
                            </span>
                          </div>
                        )}

                      {/* Monthly Investment Progress (New Feature) */}
                      {item.stock.monthlyTarget &&
                        item.stock.monthlyTarget > 0 && (
                          <div className="bg-emerald-50/50 rounded-lg p-2 border border-emerald-100">
                            <div className="flex justify-between items-center text-[10px] mb-1 font-bold text-emerald-700">
                              <span className="flex items-center gap-1">
                                <Target size={10} /> 本月目標投入 (TWD)
                              </span>
                              {monthlyProgress >= 100 && (
                                <span className="flex items-center gap-1 text-orange-500 animate-in zoom-in">
                                  <Trophy size={10} fill="currentColor" /> 達成!
                                </span>
                              )}
                            </div>
                            <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${monthlyProgress >= 100 ? "bg-orange-400" : "bg-emerald-500"}`}
                                style={{
                                  width: `${Math.min(monthlyProgress, 100)}%`,
                                }}
                              ></div>
                            </div>
                            <div className="flex justify-between items-center mt-1 text-[9px] font-mono text-emerald-600">
                              <span>
                                NT$ {currentMonthInvested.toLocaleString()}
                              </span>
                              <span>
                                NT$ {item.stock.monthlyTarget.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        )}

                      <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-50 border-dashed">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                            Shares
                          </p>
                          <p className="font-mono font-bold text-slate-700 text-lg">
                            {item.totalShares.toLocaleString(undefined, {
                              maximumFractionDigits: 5,
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 flex justify-end gap-1">
                            Avg Cost
                            {costMethod === "FIFO" && (
                              <span className="bg-indigo-100 text-indigo-600 px-1 rounded text-[8px]">
                                FIFO
                              </span>
                            )}
                          </p>
                          <p className="font-mono font-bold text-slate-700 text-lg">
                            {isSoldOut
                              ? "-"
                              : item.averageCost.toLocaleString(undefined, {
                                  maximumFractionDigits: isUSD ? 4 : 2,
                                  minimumFractionDigits: isUSD ? 3 : 2,
                                })}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-500 font-medium">
                            總成本 ({costMethod})
                          </span>
                          <div className="text-right">
                            <span className="font-bold text-slate-800">
                              {formatCurrency(item.totalCost, item.stock)}
                            </span>
                            {isUSD &&
                              (market === Market.US || market === "ALL") &&
                              item.totalCostTWD !== undefined && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  ≈ NT${" "}
                                  {item.totalCostTWD.toLocaleString(undefined, {
                                    maximumFractionDigits: 0,
                                  })}
                                </div>
                              )}
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-500 font-medium">
                            總市值
                          </span>
                          <div className="text-right">
                            <span className="font-bold text-slate-800">
                              {formatCurrency(item.marketValue, item.stock)}
                            </span>
                            {isUSD &&
                              (market === Market.US || market === "ALL") && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  ≈ NT${" "}
                                  {(
                                    item.marketValue * exchangeRate
                                  ).toLocaleString(undefined, {
                                    maximumFractionDigits: 0,
                                  })}
                                </div>
                              )}
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-blue-600 font-bold">
                            已領股息金額:
                          </span>
                          <div className="text-right">
                            <span className="font-bold text-rose-500">
                              +{formatCurrency(item.totalDividend, item.stock)}
                            </span>
                            {isUSD &&
                              (market === Market.US || market === "ALL") &&
                              item.totalDividend > 0 && (
                                <div className="text-[10px] text-rose-300 font-mono">
                                  ≈ NT${" "}
                                  {(item.totalDividendTWD !== undefined
                                    ? item.totalDividendTWD
                                    : item.totalDividend * exchangeRate
                                  ).toLocaleString(undefined, {
                                    maximumFractionDigits: 0,
                                  })}
                                </div>
                              )}
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-amber-600 font-bold">
                            已實現損益 ({costMethod}):
                          </span>
                          <div className="text-right">
                            <span
                              className={`font-bold ${getPnlColor(item.realizedGain)}`}
                            >
                              {item.realizedGain > 0 ? "+" : ""}
                              {formatCurrency(item.realizedGain, item.stock)}
                            </span>
                            {isUSD &&
                              (market === Market.US || market === "ALL") &&
                              Math.abs(item.realizedGain) > 0 && (
                                <div
                                  className={`text-[10px] font-mono opacity-80 ${getPnlColor(item.realizedGain)}`}
                                >
                                  ≈ NT${" "}
                                  {(item.realizedGainTWD !== undefined
                                    ? item.realizedGainTWD
                                    : item.realizedGain * exchangeRate
                                  ).toLocaleString(undefined, {
                                    maximumFractionDigits: 0,
                                  })}
                                </div>
                              )}
                          </div>
                        </div>

                        {/* Historical Gains (if any) */}
                        {item.historicalRealizedGain ||
                        item.historicalDividend ? (
                          <div className="pt-2 mt-2 border-t border-slate-50 border-dashed space-y-2">
                            {item.historicalDividend ? (
                              <div className="flex justify-between items-center opacity-70">
                                <span className="text-[10px] text-slate-500 font-medium">
                                  歷史結算領息:
                                </span>
                                <div className="text-right">
                                  <span className="font-bold text-rose-500 text-[10px]">
                                    +
                                    {formatCurrency(
                                      item.historicalDividend,
                                      item.stock,
                                    )}
                                  </span>
                                </div>
                              </div>
                            ) : null}
                            {item.historicalRealizedGain ? (
                              <div className="flex justify-between items-center opacity-70">
                                <span className="text-[10px] text-slate-500 font-medium">
                                  歷史結算損益:
                                </span>
                                <div className="text-right">
                                  <span
                                    className={`font-bold text-[10px] ${getPnlColor(item.historicalRealizedGain)}`}
                                  >
                                    {item.historicalRealizedGain > 0 ? "+" : ""}
                                    {formatCurrency(
                                      item.historicalRealizedGain,
                                      item.stock,
                                    )}
                                  </span>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      {/* Dividend Info Details (Collapsible) */}
                      {showDivInfo && isDivExpanded && (
                        <div className="mt-2 bg-amber-50 rounded-lg p-2 border border-amber-100 text-[10px] space-y-1 animate-in slide-in-from-top-1">
                          <div className="grid grid-cols-3 gap-2 text-center text-amber-700">
                            <div>
                              <div className="text-amber-500/70 scale-90 origin-center">
                                除息日
                              </div>
                              <div className="font-mono">
                                {latestDiv.exDividendDate || "-"}
                              </div>
                            </div>
                            <div>
                              <div className="text-amber-500/70 scale-90 origin-center">
                                股息
                              </div>
                              <div className="font-mono font-bold">
                                {latestDiv.price}
                              </div>
                            </div>
                            <div>
                              <div className="text-amber-500/70 scale-90 origin-center">
                                配發日
                              </div>
                              <div className="font-mono">
                                {latestDiv.paymentDate || "-"}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Note Section (Collapsible) */}
                      {expandedNoteStockIds.has(item.stock.id) && (
                        <div
                          className="mt-2 pt-2 border-t border-slate-50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {editingNoteId === item.stock.id ? (
                            <div className="flex flex-col gap-2 animate-in fade-in">
                              <textarea
                                autoFocus
                                value={tempNote}
                                onChange={(e) => setTempNote(e.target.value)}
                                className="w-full text-xs p-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                                rows={2}
                                placeholder="輸入筆記..."
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setEditingNoteId(null);
                                    if (!item.stock.note) {
                                      const newSet = new Set(
                                        expandedNoteStockIds,
                                      );
                                      newSet.delete(item.stock.id);
                                      setExpandedNoteStockIds(newSet);
                                    }
                                  }}
                                  className="text-[10px] px-2 py-1 text-slate-500 bg-slate-100 rounded hover:bg-slate-200"
                                >
                                  取消
                                </button>
                                <button
                                  onClick={() => handleSaveNote(item.stock)}
                                  className="text-[10px] px-2 py-1 text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1"
                                >
                                  <Save size={10} /> 儲存
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                setEditingNoteId(item.stock.id);
                                setTempNote(item.stock.note || "");
                              }}
                              className="group/note cursor-pointer p-2 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-100 transition-all min-h-[30px]"
                            >
                              <p className="text-xs text-slate-600 whitespace-pre-wrap leading-snug">
                                {item.stock.note}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Performance Bar */}
                      <div
                        className={`bg-slate-50/80 rounded-xl p-3 space-y-2 mt-3 border transition-colors ${showAnnualized ? "border-amber-200 bg-amber-50/30" : "border-transparent"}`}
                      >
                        {showAnnualized ? (
                          // Annualized View
                          <>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-500 text-xs font-bold flex items-center gap-1">
                                月均報酬率{" "}
                                <span className="text-[9px] text-slate-400 bg-white px-1 rounded border">
                                  單月
                                </span>
                              </span>
                              <div className="text-right">
                                <span
                                  className={`font-bold block ${getPnlColor(monthly || 0)}`}
                                >
                                  {monthly !== null
                                    ? formatPercent(monthly)
                                    : "N/A"}
                                </span>
                              </div>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-500 text-xs font-bold flex items-center gap-1">
                                年化報酬率{" "}
                                <span className="text-[9px] text-slate-400 bg-white px-1 rounded border">
                                  單年
                                </span>
                              </span>
                              <div className="text-right">
                                <span
                                  className={`font-bold block ${getPnlColor(annualized || 0)}`}
                                >
                                  {annualized !== null
                                    ? formatPercent(annualized)
                                    : "N/A"}
                                </span>
                              </div>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${annualized && annualized >= 0 ? "bg-amber-500" : "bg-emerald-500"}`}
                                style={{
                                  width: `${Math.min(Math.abs(annualized || 0), 100)}%`,
                                }}
                              ></div>
                            </div>
                          </>
                        ) : (
                          // Standard Cumulative View
                          <>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-500 text-xs font-bold">
                                未實現
                              </span>
                              <div className="text-right">
                                <span
                                  className={`font-bold block ${getPnlColor(item.unrealizedGain)}`}
                                >
                                  {item.unrealizedGain > 0 ? "+" : ""}
                                  {formatCurrency(
                                    item.unrealizedGain,
                                    item.stock,
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-500 text-xs font-bold">
                                總報酬
                              </span>
                              <div className="text-right">
                                <span
                                  className={`font-bold block ${getPnlColor(item.totalReturn)}`}
                                >
                                  {item.totalReturn > 0 ? "+" : ""}
                                  {formatCurrency(item.totalReturn, item.stock)}
                                </span>
                              </div>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${item.totalReturn >= 0 ? "bg-rose-500" : "bg-emerald-500"}`}
                                style={{
                                  width: `${Math.min(Math.abs(item.totalReturnPercent), 100)}%`,
                                }}
                              ></div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

const CustomTooltip = ({ active, payload, total, market }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    const percent = total > 0 ? ((data.value / total) * 100).toFixed(1) : 0;
    // FIX: Only US uses USD
    const currency = market === Market.US ? "USD" : "TWD";
    return (
      <div className="bg-white/95 backdrop-blur-md p-4 border border-white/20 shadow-2xl rounded-2xl text-sm z-50">
        <p className="font-bold text-slate-800 mb-2 border-b border-slate-100 pb-1">
          {data.name}
        </p>
        <div className="flex items-center justify-between gap-6">
          <p className="text-blue-600 font-mono font-bold text-lg">
            {new Intl.NumberFormat("zh-TW", {
              style: "currency",
              currency,
              maximumFractionDigits: 0,
            }).format(data.value)}
          </p>
          <span className="text-xs font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded-full">
            {percent}%
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export default React.memo(Dashboard);
