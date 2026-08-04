
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Stock, Transaction, TransactionType, Market, Account, MarketFilter } from '../types';
import { generateId, getSharesBeforeDate, getTradingDaysCount } from '../utils';
import { BatchSplitPopup } from './BatchSplitPopup';
import { AlertTriangle, Calculator, CalendarClock, Coins, X, Check, Delete, Equal, ChevronLeft, TrendingDown, TrendingUp, Split } from 'lucide-react';

interface Props {
  stocks: Stock[];
  accounts: Account[];
  transactions: Transaction[];
  marketFilter: MarketFilter;
  onSave: (transaction: Transaction) => void;
  onSaveMany?: (txs: Transaction[]) => void;
  onCancel: () => void;
  initialData?: Transaction | null;
  defaultStockId?: string | null;
  defaultAccountId?: string | null;
}

const toInputDate = (str: string | undefined): string => {
  if (!str) return '';
  const s = str.replace(/\//g, '-');
  const parts = s.split('-');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return s;
};

// Helper for T+2
const addBusinessDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  let count = 0;
  while (count < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) { // 0 is Sunday, 6 is Saturday
      count++;
    }
  }
  return d.toISOString().split('T')[0];
};

const CalculatorPopup = ({ 
    isOpen, 
    onClose, 
    onApply, 
    initialValue, 
    label 
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    onApply: (val: string) => void, 
    initialValue: string, 
    label: string 
}) => {
    const [expression, setExpression] = useState(initialValue || '0');
    const [result, setResult] = useState<string | null>(null);
    const [isResultFinal, setIsResultFinal] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setExpression(initialValue || '0');
            setResult(null);
            setIsResultFinal(false);
        }
    }, [isOpen, initialValue]);

    const handleBtn = (val: string) => {
        if (isResultFinal) {
            setExpression(val);
            setIsResultFinal(false);
            setResult(null);
        } else {
            setExpression(prev => (prev === '0' && val !== '.') ? val : prev + val);
        }
    };

    const handleOp = (op: string) => {
        setIsResultFinal(false);
        setExpression(prev => prev + op);
    };

    const handleClear = () => {
        setExpression('0');
        setResult(null);
        setIsResultFinal(false);
    };

    const handleDelete = () => {
        if (isResultFinal) {
            handleClear();
        } else {
            setExpression(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
        }
    };

    const calculate = () => {
        try {
            // Safe evaluation for simple math
            // Replace x with * for eval
            const safeExpr = expression.replace(/x/g, '*').replace(/[^-()\d/*+.]/g, '');
            // eslint-disable-next-line no-new-func
            const res = new Function('return ' + safeExpr)();
            const resStr = String(Math.round(res * 10000) / 10000); // Round to 4 decimals
            setResult(resStr);
            setExpression(resStr);
            setIsResultFinal(true);
        } catch (e) {
            setResult('Error');
            setIsResultFinal(true);
        }
    };

    const handleConfirm = () => {
        if (result && result !== 'Error') {
            onApply(result);
        } else {
            // Try calculating if user hits apply without equals
            try {
                const safeExpr = expression.replace(/x/g, '*').replace(/[^-()\d/*+.]/g, '');
                // eslint-disable-next-line no-new-func
                const res = new Function('return ' + safeExpr)();
                if (!isNaN(res)) {
                    onApply(String(Math.round(res * 10000) / 10000));
                } else {
                    onApply(expression);
                }
            } catch (e) {
                onApply(expression);
            }
        }
    };

    if (!isOpen) return null;

    const btnClass = "flex-1 py-3 text-lg font-bold rounded-xl active:scale-95 transition-all shadow-sm flex items-center justify-center";
    const numClass = `${btnClass} bg-white text-slate-700 hover:bg-slate-50 border border-slate-200`;
    const opClass = `${btnClass} bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100`;
    const actionClass = `${btnClass} bg-slate-200 text-slate-600 hover:bg-slate-300`;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[320px] overflow-hidden border border-slate-200">
                <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                    <h3 className="font-bold flex items-center gap-2"><Calculator size={18}/> 計算機 - {label}</h3>
                    <button onClick={onClose}><X size={20}/></button>
                </div>
                <div className="p-4 bg-slate-100 text-right">
                    <div className="text-sm text-slate-400 min-h-[1.25em]">{isResultFinal ? 'Result' : ''}</div>
                    <div className="text-3xl font-mono font-bold text-slate-800 break-all">{expression}</div>
                </div>
                <div className="p-4 grid grid-cols-4 gap-2 bg-slate-50">
                    <button onClick={handleClear} className={actionClass}>AC</button>
                    <button onClick={handleDelete} className={actionClass}><Delete size={20}/></button>
                    <button onClick={() => handleOp('/')} className={opClass}>/</button>
                    <button onClick={() => handleOp('*')} className={opClass}>x</button>

                    <button onClick={() => handleBtn('7')} className={numClass}>7</button>
                    <button onClick={() => handleBtn('8')} className={numClass}>8</button>
                    <button onClick={() => handleBtn('9')} className={numClass}>9</button>
                    <button onClick={() => handleOp('-')} className={opClass}>-</button>

                    <button onClick={() => handleBtn('4')} className={numClass}>4</button>
                    <button onClick={() => handleBtn('5')} className={numClass}>5</button>
                    <button onClick={() => handleBtn('6')} className={numClass}>6</button>
                    <button onClick={() => handleOp('+')} className={opClass}>+</button>

                    <button onClick={() => handleBtn('1')} className={numClass}>1</button>
                    <button onClick={() => handleBtn('2')} className={numClass}>2</button>
                    <button onClick={() => handleBtn('3')} className={numClass}>3</button>
                    <button onClick={calculate} className={`${opClass} row-span-2 bg-indigo-600 text-white hover:bg-indigo-700 border-transparent shadow-md`}><Equal size={24}/></button>

                    <button onClick={() => handleBtn('0')} className={`${numClass} col-span-2`}>0</button>
                    <button onClick={() => handleBtn('.')} className={numClass}>.</button>
                </div>
                <div className="p-4 border-t border-slate-200">
                    <button onClick={handleConfirm} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2">
                        <Check size={20}/> 套用數值
                    </button>
                </div>
            </div>
        </div>
    );
};

const TransactionForm: React.FC<Props> = ({ stocks, accounts, transactions, marketFilter, onSave, onSaveMany, onCancel, initialData, defaultStockId, defaultAccountId }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [settlementDate, setSettlementDate] = useState('');
  const [stockId, setStockId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [dividendAccountId, setDividendAccountId] = useState('');
  const [type, setType] = useState<TransactionType>(TransactionType.BUY);
  
  const [quantity, setQuantity] = useState('');
  const [principal, setPrincipal] = useState(''); 
  const [fee, setFee] = useState(''); 
  const [tax, setTax] = useState(''); // New Tax State
  const [feeRate, setFeeRate] = useState(''); 
  const [totalAmount, setTotalAmount] = useState(''); 
  
  const [inputPrice, setInputPrice] = useState(''); 
  
  const [totalTWD, setTotalTWD] = useState(''); 
  const [exchangeRate, setExchangeRate] = useState('1');

  const [exDividendDate, setExDividendDate] = useState('');
  // Removed explicit paymentDate state as it equals date (entry date)
  const [dividendPerShare, setDividendPerShare] = useState('');
  const [note, setNote] = useState('');

  const [isDCA, setIsDCA] = useState(false);
  const [isDRIP, setIsDRIP] = useState(false);
  const [isTenX, setIsTenX] = useState(false);
  const [tenXSubStrategy, setTenXSubStrategy] = useState<'WEEKLY' | 'MONTHLY' | undefined>(undefined);

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  // Calculator State
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcTarget, setCalcTarget] = useState<'quantity' | 'principal' | 'fee' | 'tax' | 'dividend' | 'totalTWD' | null>(null);
  const [calcTitle, setCalcTitle] = useState('');
  const [calcValue, setCalcValue] = useState('');

  // Batch Split State
  const [showBatchSplit, setShowBatchSplit] = useState(false);

  // Filter accounts: Only show accounts where isSecurities is true (or undefined for legacy)
  const securitiesAccounts = useMemo(() => {
    return accounts.filter(a => a.isSecurities !== false);
  }, [accounts]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
          if (showCalculator) setShowCalculator(false);
          else onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      setOffset({
        x: e.clientX - startPos.current.x,
        y: e.clientY - startPos.current.y
      });
    };
    const handleMouseUp = () => {
      isDragging.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onCancel, showCalculator]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).closest('.calculator-trigger')) return;
    
    isDragging.current = true;
    startPos.current = { 
        x: e.clientX - offset.x, 
        y: e.clientY - offset.y 
    };
  };

  const availableStocks = useMemo(() => {
    let marketStocks = stocks.filter(s => marketFilter === 'ALL' || s.market === marketFilter || (initialData && s.id === initialData.stockId));
    
    let filtered: Stock[] = [];
    if (type === TransactionType.BUY || !accountId) {
      filtered = marketStocks.filter(s => {
          const isStockTenX = s.isTenX || s.strategy === 'TENX' || (s.category && s.category.includes('十倍大盤')) || s.isTenXCandidate;

          if (initialData && s.id === initialData.stockId) return true;
          if (defaultStockId && s.id === defaultStockId) return true;

          if (isStockTenX) {
              return !!isTenX;
          }

          if (isTenX) {
              return false; 
          }

          return !s.hidden;
      });
    } else {
      const holdings = new Map<string, number>();
      const accountTxs = transactions.filter(t => t.accountId === accountId);
      accountTxs.forEach(tx => {
         const current = holdings.get(tx.stockId) || 0;
         if (tx.type === TransactionType.BUY) holdings.set(tx.stockId, current + tx.quantity);
         else if (tx.type === TransactionType.SELL) holdings.set(tx.stockId, current - tx.quantity);
      });
      const heldStockIds = new Set<string>();
      holdings.forEach((qty, id) => { if (qty > 0.000001) heldStockIds.add(id); });
      
      filtered = marketStocks.filter(s => {
          if (!heldStockIds.has(s.id) && !(initialData && s.id === initialData.stockId)) return false;
          
          if (initialData && s.id === initialData.stockId) return true;
          if (defaultStockId && s.id === defaultStockId) return true;

          const isStockTenX = s.isTenX || s.strategy === 'TENX' || (s.category && s.category.includes('十倍大盤')) || s.isTenXCandidate;

          if (isTenX) {
              return !!isStockTenX;
          }

          if (isStockTenX) {
              return false;
          }

          return true;
      });
    }

    return filtered.sort((a, b) => {
        if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
        return a.ticker.localeCompare(b.ticker);
    });
  }, [stocks, transactions, marketFilter, type, accountId, initialData, isTenX, defaultStockId]);

  const selectedStock = stocks.find(s => s.id === stockId);
  const selectedAccount = accounts.find(a => a.id === accountId);
  const isFund = useMemo(() => {
    const isFundStock = selectedStock?.market === Market.FUND || (selectedStock?.category && selectedStock.category.includes('基金'));
    const isFundAccount = selectedAccount?.name?.includes('基富通基金');
    return isFundStock || isFundAccount;
  }, [selectedStock, selectedAccount]);

  // Treatments as USD transaction if Market is US OR Currency is explicitly set to USD
  const isUSStock = selectedStock?.market === Market.US || selectedStock?.currency === 'USD';

  // Initialize form
  useEffect(() => {
    if (!initialData) {
        if (defaultAccountId) {
            setAccountId(defaultAccountId);
        } else if (!accountId && securitiesAccounts.length > 0) {
            setAccountId(securitiesAccounts[0].id);
        }
        
        // Default settlement date for new transactions
        setSettlementDate(addBusinessDays(date, 2));
    }
  }, [securitiesAccounts, initialData, defaultAccountId]);

  useEffect(() => {
    // If we are initializing an edit, do not auto select here. That is handled by initializedTxId logic.
    if (initialData) return;
    
    // Priority 1: Default Stock ID passed from props (e.g. from Dashboard Card)
    if (!initialData && defaultStockId && availableStocks.find(s => s.id === defaultStockId)) {
        setStockId(defaultStockId);
        return;
    }

    // Priority 2: Auto select first available if nothing selected
    if (availableStocks.length > 0) {
      if (!availableStocks.find(s => s.id === stockId)) {
        setStockId(availableStocks[0].id);
      }
    } else {
      setStockId('');
    }
  }, [availableStocks, stockId, initialData, defaultStockId]);

  const initializedTxId = useRef<string | null>(null);

  useEffect(() => {
    if (initialData && initializedTxId.current !== initialData.id) {
      initializedTxId.current = initialData.id;
      setDate(toInputDate(initialData.date));
      setStockId(initialData.stockId);
      setAccountId(initialData.accountId);
      setDividendAccountId(initialData.dividendAccountId || '');
      setType(initialData.type);
      setQuantity(initialData.quantity.toString());
      setSettlementDate(toInputDate(initialData.settlementDate || addBusinessDays(initialData.date, 2)));
      
      const stock = stocks.find(s => s.id === initialData.stockId);
      const isUS = stock?.market === Market.US || stock?.currency === 'USD';
      
      const dbPrice = initialData.price; 
      const dbQty = initialData.quantity;
      const dbFee = initialData.fee || 0;
      const dbTax = initialData.tax || 0;
      const dbPrincipal = dbPrice * dbQty;
      
      if (isUS) {
         setPrincipal(dbPrincipal.toFixed(2));
         setFee(dbFee.toString());
         setTax(dbTax.toString());
         const dbTotal = initialData.type === TransactionType.BUY ? dbPrincipal + dbFee : dbPrincipal - dbFee - dbTax; 
         setTotalAmount(dbTotal.toFixed(2));
         setInputPrice(dbPrice.toFixed(4));
         const rate = initialData.exchangeRate || 1;
         setExchangeRate(rate.toString());
         setTotalTWD(parseFloat((dbTotal * rate).toFixed(3)).toString());

         // Initialize feeRate to avoid resetting fee to 0/calculated during edit
         const account = accounts.find(a => a.id === initialData.accountId);
         const accName = account?.name || '';
         const isFixed = accName.includes('永豐') || (accName.includes('凱基') && !!initialData.isDCA);
         if (isFixed) {
            setFeeRate(dbFee.toString());
         } else {
            if (isFund) {
               setFeeRate('0');
            } else if (accName.includes('凱基')) {
               if (initialData.isDCA) setFeeRate('0.03');
               else setFeeRate('0.1');
            } else {
               setFeeRate('0.1');
            }
         }
      } else {
         const dbTotal = initialData.type === TransactionType.BUY ? dbPrincipal + dbFee : dbPrincipal - dbFee - dbTax;
         setTotalAmount(Math.round(dbTotal).toString());
         setPrincipal(Math.round(dbPrincipal).toString());
         setFee(Math.round(dbFee).toString());
         setTax(Math.round(dbTax).toString());
         setInputPrice(dbPrice.toString());
         setExchangeRate('1');
      }

      if (initialData.type === TransactionType.DIVIDEND) {
        setDividendPerShare(initialData.price.toString());
        setExDividendDate(toInputDate(initialData.exDividendDate));
        setFee(dbFee.toString()); 
      }

      setNote(initialData.note || '');
      setIsDCA(!!initialData.isDCA);
      setIsDRIP(!!initialData.isDRIP);
      setIsTenX(!!initialData.isTenX);
      setTenXSubStrategy(initialData.tenXSubStrategy);
    }
  }, [initialData, stocks]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      userInteracted.current = true;
      const newDate = e.target.value;
      setDate(newDate);
      if (type === TransactionType.BUY || type === TransactionType.SELL) {
          setSettlementDate(addBusinessDays(newDate, 2));
      }
  };

  useEffect(() => {
    if (type === TransactionType.DIVIDEND && stockId && accountId && exDividendDate && !initialData) {
      const accountTxs = transactions.filter(t => t.accountId === accountId);
      const shares = getSharesBeforeDate(stockId, exDividendDate, accountTxs);
      if (shares > 0) setQuantity(shares.toString());
      else setQuantity('0');
    }
  }, [type, stockId, accountId, exDividendDate, transactions, initialData]);

  const currentInventoryShares = useMemo(() => {
    if (!stockId || !accountId) return 0;
    const accountTxs = transactions.filter(t => t.accountId === accountId && t.stockId === stockId);
    let shares = 0;
    accountTxs.forEach(tx => {
      if (tx.type === TransactionType.BUY) shares += tx.quantity;
      else if (tx.type === TransactionType.SELL) shares -= tx.quantity;
    });
    if (initialData && initialData.type === TransactionType.SELL && initialData.stockId === stockId && initialData.accountId === accountId) {
      shares += initialData.quantity;
    }
    return Math.round(shares * 100000) / 100000;
  }, [stockId, accountId, transactions, initialData]);

  const userInteracted = useRef(false);

  useEffect(() => {
    if (initialData || !stockId) return;
    
    // Auto-select account based on stock holdings if user selected a stock
    const holdings = new Map<string, number>();
    transactions.filter(t => t.stockId === stockId).forEach(tx => {
       const current = holdings.get(tx.accountId) || 0;
       if (tx.type === 'BUY') holdings.set(tx.accountId, current + tx.quantity);
       else if (tx.type === 'SELL') holdings.set(tx.accountId, current - tx.quantity);
       else if (tx.type === 'SPLIT') holdings.set(tx.accountId, current + tx.quantity);
    });

    const accountsWithStock = Array.from(holdings.entries())
       .filter(([accId, qty]) => qty > 0.00001)
       .map(([accId]) => accId);

    if (accountsWithStock.length > 0) {
       if (!accountId || !accountsWithStock.includes(accountId)) {
           setAccountId(accountsWithStock[0]);
       }
    }
  }, [stockId]);

  useEffect(() => {
    if (type === TransactionType.DIVIDEND) {
       if (initialData && !userInteracted.current) return;
       const qty = parseFloat(quantity) || 0;
       const dps = parseFloat(dividendPerShare) || 0;
       const totalDiv = qty * dps;
       if (isUSStock) {
         setPrincipal(totalDiv.toFixed(2));
         const tax = totalDiv * 0.30;
         setFee(tax.toFixed(2));
       } else {
         setPrincipal(Math.round(totalDiv).toString());
       }
    }
  }, [quantity, dividendPerShare, type, isUSStock]);

  useEffect(() => {
    if ((type === TransactionType.BUY || type === TransactionType.SELL) && isUSStock) {
       if (initialData && !userInteracted.current) return;
       if (isFund) {
          setFeeRate('0');
          return;
       }
       const accountName = selectedAccount?.name || '';
       if (accountName.includes('永豐')) {
          if (isDCA || isDRIP) setFeeRate('0.01');
          else setFeeRate('0.08');
       } else if (accountName.includes('凱基')) {
          if (isDCA) setFeeRate('0.03');
          else setFeeRate('0.1');
       } else {
          setFeeRate('0.1');
       }
    }
  }, [accountId, type, isUSStock, selectedAccount, isDCA, isDRIP, isFund]);

  // Handle Taiwan stock fee for DCA and specific accounts
  useEffect(() => {
    if (type === TransactionType.BUY && !isUSStock) {
      if (initialData && !userInteracted.current) return;
      if (isFund) {
        setFee('0');
      } else if (isDCA) {
        setFee('1');
      }
    }
  }, [type, isUSStock, isDCA, isFund]);

  useEffect(() => {
    if ((type === TransactionType.BUY || type === TransactionType.SELL) && isUSStock) {
       if (initialData && !userInteracted.current) return;
       const p = parseFloat(principal);
       const r = parseFloat(feeRate);
       if (!isNaN(p) && !isNaN(r)) {
          const accountName = selectedAccount?.name || '';
          let calculated = 0;
          const isYongFeng = accountName.includes('永豐');
          const isKGI = accountName.includes('凱基');
          
          if (isFund) {
             calculated = 0;
          } else if (isYongFeng) {
             if (isDCA || isDRIP) calculated = r;
             else calculated = p * (r / 100);
          } else if (isKGI) {
             if (isDCA) calculated = r;
             else calculated = p * (r / 100);
          } else {
             calculated = p * (r / 100);
          }
          setFee(calculated.toFixed(2));
       }
    }
  }, [principal, feeRate, type, isUSStock, selectedAccount, isDCA, isDRIP, isFund]);

  useEffect(() => {
     if (initialData && !userInteracted.current) return;
     const p = parseFloat(principal) || 0;
     const f = parseFloat(fee) || 0;
     const t = parseFloat(tax) || 0;
     let total = 0;
     if (type === TransactionType.BUY) total = p + f;
     else if (type === TransactionType.SELL) total = p - f - t;
     else if (type === TransactionType.DIVIDEND) total = p - f;
     
     if (isUSStock) setTotalAmount(total.toFixed(2));
     else setTotalAmount(Math.round(total).toString());
  }, [principal, fee, tax, type, isUSStock]);

  useEffect(() => {
     if (isUSStock && (type === TransactionType.BUY || type === TransactionType.SELL)) {
        if (initialData && !userInteracted.current) return;
        const usd = parseFloat(totalAmount) || 0;
        const rate = parseFloat(exchangeRate) || 1;
        if (usd > 0) {
            const calculatedTwd = (usd * rate).toFixed(2);
            // Only update if the change is significant to avoid feedback loops from rounding
            setTotalTWD(prev => {
                const prevVal = parseFloat(prev) || 0;
                const nextVal = parseFloat(calculatedTwd) || 0;
                return Math.abs(prevVal - nextVal) > 0.01 ? calculatedTwd : prev;
            });
        } else if (usd === 0) {
            setTotalTWD('');
        }
     }
  }, [totalAmount, isUSStock, type, exchangeRate]); // Removed initialData from dependencies

  const handlePrincipalChange = (val: string) => {
    userInteracted.current = true;
    setPrincipal(val);
    if (type === TransactionType.DIVIDEND) return;
    const p = parseFloat(val) || 0;
    const q = parseFloat(quantity) || 0;
    if (q > 0) {
      setInputPrice((p / q).toFixed(4));
    }
  };

  const handlePriceChange = (val: string) => {
    userInteracted.current = true;
    setInputPrice(val);
    const p = parseFloat(val) || 0;
    const q = parseFloat(quantity) || 0;
    if (q > 0) {
      const newPrincipal = p * q;
      if (isUSStock) setPrincipal(newPrincipal.toFixed(2));
      else setPrincipal(Math.round(newPrincipal).toString());
    }
  };

  const handleQuantityChange = (val: string) => {
    userInteracted.current = true;
    setQuantity(val);
    const q = parseFloat(val) || 0;
    const p = parseFloat(inputPrice) || 0;
    if (p > 0) {
      const newPrincipal = p * q;
      if (isUSStock) setPrincipal(newPrincipal.toFixed(2));
      else setPrincipal(Math.round(newPrincipal).toString());
    } else {
      // If price is zero but principal exists, update price instead
      const prin = parseFloat(principal) || 0;
      if (prin > 0 && q > 0) {
        setInputPrice((prin / q).toFixed(4));
      }
    }
  };

  const handleTotalTWDChange = (val: string) => {
     userInteracted.current = true;
     setTotalTWD(val);
     const twd = parseFloat(val);
     const usd = parseFloat(totalAmount);
     if (!isNaN(twd) && !isNaN(usd) && usd > 0) {
        setExchangeRate((twd / usd).toFixed(4));
     }
  };

  const getBatchSplitTxs = () => {
    const currentSettlementDate = settlementDate || date;
    const otherTxs = transactions.filter(t => {
        const txSettlementDate = t.settlementDate || t.date;
        return t.accountId === accountId && 
               txSettlementDate === currentSettlementDate && 
               t.id !== initialData?.id && 
               (stocks.find(s => s.id === t.stockId)?.market === 'US' || stocks.find(s => s.id === t.stockId)?.currency === 'USD');
    });
    const currentStock = stocks.find(s => s.id === stockId);
    const isUS = currentStock?.market === 'US' || currentStock?.currency === 'USD';
    let currentUSD = parseFloat(totalAmount) || 0;
    if (type === TransactionType.SELL || type === TransactionType.DIVIDEND) {
        currentUSD = -currentUSD;
    }
    return { otherTxs, currentUSD: isUS ? currentUSD : 0 };
  };

  const { otherTxs: batchOtherTxs, currentUSD: batchCurrentUSD } = getBatchSplitTxs();

  const handleBatchSplitApply = (rate: number, updatedOtherTxs: Transaction[]) => {
      setExchangeRate(rate.toFixed(4));
      const newTWD = (Math.abs(batchCurrentUSD) * rate).toFixed(0);
      setTotalTWD(newTWD);
      
      if (updatedOtherTxs.length > 0 && onSaveMany) {
          onSaveMany(updatedOtherTxs);
      }
      setShowBatchSplit(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (accounts.length === 0) { alert("請先前往帳戶管理建立帳戶！"); return; }
    if (securitiesAccounts.length === 0) { alert("請先前往帳戶管理建立「證券帳戶」以進行交易！"); return; }
    if (!stockId) { alert("請先前往股票管理新增股票標的！"); return; }

    const qty = parseFloat(quantity) || 0;
    const finalFee = parseFloat(fee) || 0;
    const finalTax = parseFloat(tax) || 0;
    const finalPrice = parseFloat(inputPrice) || 0;
    const finalExchangeRate = parseFloat(exchangeRate) || 1;
    
    let savePrice = finalPrice;
    if (type === TransactionType.DIVIDEND) savePrice = parseFloat(dividendPerShare) || 0;

    let finalNote = note;
    if (isTenX) {
        if (tenXSubStrategy === 'WEEKLY' && !finalNote.includes('【十倍大盤-週策略】')) {
            finalNote = finalNote.replace('【十倍大盤策略】', '');
            finalNote = `【十倍大盤-週策略】${finalNote}`;
        } else if (tenXSubStrategy === 'MONTHLY' && !finalNote.includes('【十倍大盤-月策略】')) {
            finalNote = finalNote.replace('【十倍大盤策略】', '');
            finalNote = `【十倍大盤-月策略】${finalNote}`;
        } else if (!finalNote.includes('【十倍大盤策略】') && !finalNote.includes('【十倍大盤-週策略】') && !finalNote.includes('【十倍大盤-月策略】')) {
            finalNote = `【十倍大盤策略】${finalNote}`;
        }
    }

    onSave({
      id: initialData?.id || generateId(),
      date, stockId, accountId, type,
      price: savePrice, 
      quantity: qty,
      fee: finalFee,
      tax: finalTax,
      exchangeRate: finalExchangeRate,
      note: finalNote,
      exDividendDate: type === TransactionType.DIVIDEND ? exDividendDate : undefined,
      paymentDate: type === TransactionType.DIVIDEND ? date : undefined, // Payment Date = Entry Date
      settlementDate: (type === TransactionType.BUY || type === TransactionType.SELL) ? settlementDate : undefined,
      isDCA: type === TransactionType.BUY ? isDCA : undefined,
      dcaOriginalDate: initialData?.dcaOriginalDate || (type === TransactionType.BUY && isDCA ? initialData?.date : undefined),
      isDRIP: type === TransactionType.BUY ? isDRIP : undefined,
      isTenX: isTenX,
      dividendAccountId: type === TransactionType.DIVIDEND && dividendAccountId !== '' ? dividendAccountId : undefined,
      tenXSubStrategy: (isTenX && type === TransactionType.BUY) ? tenXSubStrategy : undefined,
    });
  };

  // Calculator Functions
  const openCalculator = (target: typeof calcTarget, title: string, currentValue: string) => {
    setCalcTarget(target);
    setCalcTitle(title);
    setCalcValue(currentValue);
    setShowCalculator(true);
  };

  const handleCalculatorApply = (val: string) => {
    userInteracted.current = true;
    if (calcTarget === 'quantity') handleQuantityChange(val);
    else if (calcTarget === 'principal') handlePrincipalChange(val);
    else if (calcTarget === 'fee') setFee(val);
    else if (calcTarget === 'tax') setTax(val);
    else if (calcTarget === 'dividend') setDividendPerShare(val);
    else if (calcTarget === 'totalTWD') handleTotalTWDChange(val);
    
    setShowCalculator(false);
    setCalcTarget(null);
  };

  const hasNoAccounts = accounts.length === 0;

  const isFixedFeeMode = useMemo(() => {
      if (!isUSStock || (type !== TransactionType.BUY && type !== TransactionType.SELL)) return false;
      const accountName = selectedAccount?.name || '';
      if (accountName.includes('永豐')) return true;
      if (accountName.includes('凱基') && isDCA) return true;
      return false;
  }, [isUSStock, type, selectedAccount, isDCA, isDRIP]);

  const feeLabel = isFixedFeeMode ? '固定手續費 (USD)' : '手續費率 (%)';

  // Check if stock selection should be locked (pre-filled from card and not editing)
  const isStockLocked = !!defaultStockId && !initialData;
  const isAccountLocked = !!defaultAccountId && !initialData;

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm transition-all duration-300">
      <div 
         className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-300 flex flex-col max-h-[90vh] border border-white/20"
         style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        {/* Modal Header */}
        <div 
          className="px-6 py-5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex justify-between items-center cursor-move select-none"
          onMouseDown={handleMouseDown}
        >
          <div>
             <h3 className="font-bold text-slate-800 text-lg">{initialData ? '編輯交易' : '新增交易'}</h3>
             <p className="text-xs text-slate-400 mt-0.5">請輸入詳細交易資訊</p>
          </div>
          <button onClick={onCancel} className="p-2 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
             <X size={18} />
          </button>
        </div>

        {hasNoAccounts ? (
           <div className="p-10 text-center flex flex-col items-center gap-4">
              <div className="bg-rose-50 p-6 rounded-full text-rose-500 mb-2 ring-8 ring-rose-50/50"><AlertTriangle size={48} /></div>
              <p className="text-slate-800 font-bold text-xl">目前沒有任何帳戶</p>
              <p className="text-slate-500">請先前往「帳戶管理」建立您的第一個投資帳戶</p>
              <button onClick={onCancel} className="mt-4 px-8 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-colors">關閉</button>
           </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto no-scrollbar">
            
            {/* Row 1: Dates & Account Logic */}
            {(type === TransactionType.BUY || type === TransactionType.SELL) ? (
                <>
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">交易日期</label>
                        <input type="date" value={date} onChange={handleDateChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all font-medium text-slate-700" required />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">交割日期</label>
                        <input type="date" value={settlementDate} onChange={e => setSettlementDate(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all font-medium text-slate-700" required />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">帳戶 (僅證券戶)</label>
                        <select 
                            value={accountId} 
                            onChange={e => { userInteracted.current = true; setAccountId(e.target.value); }} 
                            className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 font-medium text-slate-700 ${isAccountLocked ? 'bg-slate-100 cursor-not-allowed opacity-80' : 'bg-slate-50 focus:bg-white cursor-pointer'}`}
                            required
                            disabled={isAccountLocked}
                        >
                          {securitiesAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                        </select>
                    </div>
                </>
            ) : (
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                      {type === TransactionType.SPLIT ? '生效日期' : '入帳日期'}
                    </label>
                    <input type="date" value={date} onChange={handleDateChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all font-medium text-slate-700" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">帳戶 (僅證券戶)</label>
                    <select 
                        value={accountId} 
                        onChange={e => { userInteracted.current = true; setAccountId(e.target.value); }} 
                        className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 font-medium text-slate-700 ${isAccountLocked ? 'bg-slate-100 cursor-not-allowed opacity-80' : 'bg-slate-50 focus:bg-white cursor-pointer'}`}
                        required
                        disabled={isAccountLocked}
                    >
                      {securitiesAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                    </select>
                  </div>
                </div>
            )}

            {/* Row 2: Type & Stock */}
            <div className="grid grid-cols-2 gap-5">
               <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">交易類別</label>
                <select value={type} onChange={e => { userInteracted.current = true; setType(e.target.value as TransactionType); }} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all font-medium text-slate-700 cursor-pointer">
                  <option value={TransactionType.BUY}>買進</option>
                  <option value={TransactionType.SELL}>賣出</option>
                  <option value={TransactionType.DIVIDEND}>領息</option>
                  <option value={TransactionType.SPLIT}>股票分割</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                   股票標的 
                   {(type === TransactionType.SELL || type === TransactionType.DIVIDEND || type === TransactionType.SPLIT) && (
                     <span className="text-[10px] text-blue-500 ml-1 normal-case">(僅庫存)</span>
                   )}
                </label>
                {availableStocks.length === 0 ? (
                  <div className="text-xs text-rose-500 px-4 py-3 border border-rose-200 bg-rose-50 rounded-xl font-medium flex items-center gap-2">
                     <AlertTriangle size={14}/> 無可交易標的
                  </div>
                ) : (
                  <select 
                    value={stockId} 
                    onChange={e => { userInteracted.current = true; setStockId(e.target.value); }} 
                    className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 font-medium text-slate-700 ${isStockLocked ? 'bg-slate-100 cursor-not-allowed opacity-80' : 'bg-slate-50 focus:bg-white cursor-pointer'}`}
                    required
                    disabled={isStockLocked}
                  >
                    {availableStocks.map(s => <option key={s.id} value={s.id}>{s.ticker} - {s.name}</option>)}
                  </select>
                )}
                {selectedStock && selectedStock.currentPrice !== undefined && (
                  <div className={`mt-2 text-xs px-3 py-2 border rounded-lg flex items-center justify-between font-bold animate-in fade-in slide-in-from-top-1 ${isTenX ? 'text-amber-700 bg-amber-50/80 border-amber-200/60' : 'text-slate-700 bg-slate-50/80 border-slate-200/60'}`}>
                     <span className="flex items-center gap-1.5"><TrendingUp size={14}/> 最新收盤價</span>
                     <span className="font-mono text-sm">${selectedStock.currentPrice.toFixed(2)} {selectedStock.currency || (selectedStock.market === Market.US ? 'USD' : 'TWD')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Split Specific Fields */}
            {type === TransactionType.SPLIT ? (
              <div className="space-y-5 bg-purple-50/60 p-5 rounded-2xl border border-purple-100">
                <div className="flex items-start gap-2 text-purple-800 text-xs bg-purple-100/50 p-3 rounded-xl mb-2 font-medium">
                   <Split size={16} className="shrink-0 mt-0.5 text-purple-600" />
                   <span>請輸入分割比例。例如 1股 分割為 24股，請輸入 24。系統將自動調整庫存與成本。</span>
                </div>
                
                <div className="grid grid-cols-2 gap-5">
                   <div className="space-y-1.5">
                     <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">分割比例</label>
                     <input 
                         type="number" step="0.0001" 
                         value={quantity} onChange={e => { userInteracted.current = true; setQuantity(e.target.value); }} 
                         className="w-full px-4 py-2.5 bg-white border border-purple-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-400 transition-all font-mono font-medium text-slate-700" 
                         placeholder="例如: 24"
                         required
                     />
                   </div>
                </div>
              </div>
            ) : type === TransactionType.DIVIDEND ? (
              <div className="space-y-5 bg-amber-50/60 p-5 rounded-2xl border border-amber-100">
                <div className="flex items-start gap-2 text-amber-800 text-xs bg-amber-100/50 p-3 rounded-xl mb-2 font-medium">
                   <CalendarClock size={16} className="shrink-0 mt-0.5 text-amber-600" />
                   <span>選擇除息日後，系統將自動帶入該帳戶的持有股數。(配發日自動設為入帳日期)</span>
                </div>
                
                 {/* Only Ex-Dividend Date, Payment Date is hidden and equals Entry Date */}
                 <div className="space-y-1.5">
                   <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">除息日</label>
                   <input type="date" value={exDividendDate} onChange={e => setExDividendDate(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-400 transition-all text-slate-700" required />
                 </div>

                <div className="grid grid-cols-2 gap-5">
                   <div className="space-y-1.5">
                     <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">每股股息 ({isUSStock ? 'USD' : 'TWD'})</label>
                     <div className="relative">
                        <input 
                            type="number" step="0.00001" 
                            value={dividendPerShare} onChange={e => { userInteracted.current = true; setDividendPerShare(e.target.value); }} 
                            className="w-full px-4 py-2.5 pr-10 bg-white border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-400 transition-all font-mono font-medium text-slate-700" 
                            placeholder="0.00"
                        />
                        <button type="button" onClick={() => openCalculator('dividend', '每股股息', dividendPerShare)} className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400 hover:text-amber-600 calculator-trigger">
                            <Calculator size={16} />
                        </button>
                     </div>
                   </div>
                   <div className="space-y-1.5">
                     <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">持有股數</label>
                     <div className="relative">
                        <input 
                            type="number" step="0.00001" 
                            value={quantity} onChange={e => handleQuantityChange(e.target.value)} 
                            className="w-full px-4 py-2.5 pr-10 bg-slate-100 border border-slate-200 rounded-xl outline-none text-slate-500 font-mono" 
                            placeholder="-"
                        />
                        <button type="button" onClick={() => openCalculator('quantity', '持有股數', quantity)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 calculator-trigger">
                            <Calculator size={16} />
                        </button>
                     </div>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                   <div className="space-y-1.5">
                       <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">入帳銀行 (選填)</label>
                       <select 
                            value={dividendAccountId} 
                            onChange={e => { userInteracted.current = true; setDividendAccountId(e.target.value); }} 
                            className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-400 transition-all font-medium text-slate-700 cursor-pointer"
                        >
                            <option value="">預設 (依證券戶)</option>
                            {accounts.filter(a => a.isCash).map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                       </select>
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                       <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">領取總額 ({isUSStock ? 'USD' : 'TWD'})</label>
                       <div className="relative">
                          <Coins size={16} className="absolute left-3.5 top-3 text-amber-500" />
                          <input 
                              type="number" step="0.01" 
                              value={principal} onChange={e => handlePrincipalChange(e.target.value)} 
                              className="w-full pl-10 pr-10 py-2.5 bg-white border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-400 transition-all font-bold font-mono text-slate-800" 
                              placeholder="0.00" required 
                           />
                           <button type="button" onClick={() => openCalculator('principal', '領取總額', principal)} className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400 hover:text-amber-600 calculator-trigger">
                                <Calculator size={16} />
                           </button>
                       </div>
                    </div>
                    <div className="space-y-1.5">
                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                          {isUSStock ? '30% 預扣稅' : '手續費/稅金'}
                       </label>
                       <div className="relative">
                           <input 
                              type="number" step="0.01" 
                              value={fee} onChange={e => { userInteracted.current = true; setFee(e.target.value); }} 
                              className="w-full px-4 py-2.5 pr-10 bg-white border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-400 transition-all font-mono text-slate-600" 
                              placeholder="0.00"
                           />
                           <button type="button" onClick={() => openCalculator('fee', isUSStock ? '預扣稅' : '手續費', fee)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-500 calculator-trigger">
                                <Calculator size={16} />
                           </button>
                       </div>
                    </div>
                 </div>

                 <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-emerald-600 uppercase tracking-wide">實領淨額 ({isUSStock ? 'USD' : 'TWD'})</label>
                    <input 
                       type="number" step="0.01" 
                       value={totalAmount} readOnly
                       className="w-full px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 font-bold text-lg font-mono text-right shadow-inner" 
                    />
                 </div>
              </div>
            ) : (
              <>
                 <div className="space-y-1.5">
                    <div className="flex justify-between items-end">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">成交股數</label>
                        {type === TransactionType.SELL && (
                            <span className="text-xs text-blue-500 font-medium">目前庫存: {currentInventoryShares} 股</span>
                        )}
                    </div>
                    <div className="relative">
                        <input 
                           type="number" step="0.00001" 
                           value={quantity} onChange={e => handleQuantityChange(e.target.value)} 
                           className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all font-mono font-bold text-slate-800 text-lg" 
                           placeholder="Ex: 1000" required 
                        />
                        <button type="button" onClick={() => openCalculator('quantity', '成交股數', quantity)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 calculator-trigger">
                            <Calculator size={18} />
                        </button>
                    </div>
                 </div>

                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                       <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">成交價金 ({isUSStock ? 'USD' : 'TWD'})</label>
                       <div className="relative">
                           <input 
                              type="number" step="0.01" 
                              value={principal} onChange={e => handlePrincipalChange(e.target.value)} 
                              className="w-full px-4 py-2.5 pr-10 bg-white border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-bold text-slate-800 font-mono" 
                              placeholder="0.00" required 
                           />
                           <button type="button" onClick={() => openCalculator('principal', '成交價金', principal)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 calculator-trigger">
                                <Calculator size={18} />
                           </button>
                       </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">成交單價 ({isUSStock ? 'USD' : 'TWD'})</label>
                        <div className="relative">
                          <input 
                            type="number" step="0.0001" 
                            value={inputPrice} onChange={e => handlePriceChange(e.target.value)} 
                            className="w-full px-4 py-2.5 pr-10 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 transition-all font-mono font-bold text-slate-800" 
                            placeholder="0.00" required 
                          />
                           <button type="button" onClick={() => openCalculator('tax', '成交單價', inputPrice)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 calculator-trigger">
                                <Calculator size={16} />
                           </button>
                        </div>
                    </div>
                  </div>

                 <div className="grid grid-cols-2 gap-5">
                    {isUSStock && (type === TransactionType.BUY || type === TransactionType.SELL) ? (
                       <div className="col-span-2 grid grid-cols-2 gap-5 p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="space-y-1.5">
                             <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">{feeLabel}</label>
                             <input 
                                type="number" step="0.001" 
                                value={feeRate} onChange={e => { userInteracted.current = true; setFeeRate(e.target.value); }} 
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-400 transition-all text-slate-600 font-mono text-sm" 
                                placeholder={isFixedFeeMode ? "固定金額" : "%"}
                             />
                          </div>
                          <div className="space-y-1.5">
                             <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">手續費</label>
                             <div className="relative">
                                 <input 
                                    type="number" step="0.01" 
                                    value={fee} onChange={e => { userInteracted.current = true; setFee(e.target.value); }} 
                                    className="w-full px-3 py-2 pr-8 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-400 transition-all text-slate-600 font-mono text-sm" 
                                    placeholder="0.00"
                                 />
                                 <button type="button" onClick={() => openCalculator('fee', '手續費', fee)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 calculator-trigger">
                                    <Calculator size={14} />
                                 </button>
                             </div>
                          </div>
                       </div>
                    ) : (
                       <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">手續費 ({isUSStock ? 'USD' : 'TWD'})</label>
                          <div className="relative">
                              <input 
                                 type="number" step="0.01" 
                                 value={fee} onChange={e => { userInteracted.current = true; setFee(e.target.value); }} 
                                 className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all text-slate-600 font-mono" 
                                 placeholder="0.00"
                              />
                              <button type="button" onClick={() => openCalculator('fee', '手續費', fee)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 calculator-trigger">
                                    <Calculator size={18} />
                              </button>
                          </div>
                       </div>
                    )}

                    {type === TransactionType.SELL && (
                       <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">稅金 ({isUSStock ? 'USD' : 'TWD'})</label>
                          <div className="relative">
                              <input 
                                 type="number" step="0.01" 
                                 value={tax} onChange={e => { userInteracted.current = true; setTax(e.target.value); }} 
                                 className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all text-slate-600 font-mono" 
                                 placeholder="0.00"
                              />
                              <button type="button" onClick={() => openCalculator('tax', '稅金', tax)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 calculator-trigger">
                                    <Calculator size={18} />
                              </button>
                          </div>
                       </div>
                    )}

                    <div className={(type === TransactionType.SELL && !isUSStock) || (isUSStock && type === TransactionType.BUY) ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
                       <label className="block text-xs font-bold text-blue-600 uppercase tracking-wide">總金額 ({isUSStock ? 'USD' : 'TWD'})</label>
                       <input 
                          type="number" step="0.01" 
                          value={totalAmount} readOnly
                          className="w-full px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-blue-800 font-bold font-mono text-right" 
                       />
                    </div>
                 </div>
              </>
            )}

            {isUSStock && (
               <div className="grid grid-cols-2 gap-5 pt-4 border-t border-slate-100">
                  <div className="space-y-1.5">
                     <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">台幣總金額 (反算匯率)</label>
                        {(type === TransactionType.BUY || type === TransactionType.SELL || type === TransactionType.DIVIDEND) && (
                            <button type="button" onClick={() => setShowBatchSplit(true)} className="text-xs text-blue-600 font-bold hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-md hover:bg-blue-100 transition-colors">
                                <Split size={14} /> 批量分攤
                            </button>
                        )}
                     </div>
                     <div className="relative">
                         <input 
                            type="number" step="0.001" 
                            value={totalTWD} onChange={e => handleTotalTWDChange(e.target.value)} 
                            className="w-full px-4 py-2.5 pr-10 bg-white border border-slate-300 rounded-xl outline-none focus:border-blue-500 transition-all font-bold text-slate-800 font-mono" 
                            placeholder="Ex: 32000"
                         />
                         <button type="button" onClick={() => openCalculator('totalTWD', '台幣總金額', totalTWD)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 calculator-trigger">
                            <Calculator size={18} />
                         </button>
                     </div>
                  </div>
                   <div className="space-y-1.5">
                     <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">對應匯率</label>
                     <input
                        type="number" step="0.0001"
                        value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 rounded-xl text-slate-700 font-mono text-center"
                     />
                  </div>
               </div>
            )}
            
            <div className="flex flex-wrap gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
               {type === TransactionType.BUY && (
                 <>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 font-bold cursor-pointer select-none hover:bg-white px-2 py-1 rounded transition-colors">
                     <input 
                       type="checkbox" 
                       checked={isDCA} 
                       onChange={e => setIsDCA(e.target.checked)} 
                       className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300 accent-blue-600" 
                     />
                     定期定額 (DCA)
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 font-bold cursor-pointer select-none hover:bg-white px-2 py-1 rounded transition-colors">
                     <input 
                       type="checkbox" 
                       checked={isDRIP} 
                       onChange={e => setIsDRIP(e.target.checked)} 
                       className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300 accent-blue-600" 
                     />
                     股利再投入 (DRIP)
                  </label>
                 </>
               )}
               <label className="flex items-center gap-2.5 text-xs text-amber-700 font-bold cursor-pointer select-none hover:bg-white px-2 py-1 rounded transition-colors">
                  <input 
                    type="checkbox" 
                    checked={isTenX} 
                    onChange={e => setIsTenX(e.target.checked)} 
                    className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 border-slate-300 accent-amber-600" 
                  />
                  十倍大盤策略
               </label>
            </div>

            {isTenX && type === TransactionType.BUY && (
               <div className="flex gap-4 p-3 bg-amber-50/50 rounded-xl border border-amber-100 animate-in fade-in slide-in-from-top-2">
                 <label className="flex items-center gap-2 text-sm text-amber-800 cursor-pointer">
                   <input type="radio" name="tenXSub" checked={tenXSubStrategy === 'WEEKLY'} onChange={() => setTenXSubStrategy('WEEKLY')} className="accent-amber-600 w-4 h-4"/>
                   <span className="font-medium">週策略</span>
                 </label>
                 <label className="flex items-center gap-2 text-sm text-amber-800 cursor-pointer">
                   <input type="radio" name="tenXSub" checked={tenXSubStrategy === 'MONTHLY'} onChange={() => setTenXSubStrategy('MONTHLY')} className="accent-amber-600 w-4 h-4"/>
                   <span className="font-medium">月策略</span>
                 </label>
               </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase">備註</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none h-20 resize-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all text-sm" placeholder="輸入備註事項..." />
            </div>

            <div className="pt-6 flex justify-end gap-3 sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-50 mt-2 pb-2">
              <button type="button" onClick={onCancel} className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors text-sm">取消</button>
              <button type="submit" className="px-8 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all active:scale-95 text-sm flex items-center gap-2">
                 <Check size={18} />
                 儲存交易
              </button>
            </div>
          </form>
        )}
      </div>
      
      {/* Calculator Modal */}
      <CalculatorPopup 
        isOpen={showCalculator} 
        onClose={() => setShowCalculator(false)} 
        onApply={handleCalculatorApply} 
        initialValue={calcValue} 
        label={calcTitle}
      />
      <BatchSplitPopup
        isOpen={showBatchSplit}
        onClose={() => setShowBatchSplit(false)}
        onApply={handleBatchSplitApply}
        otherTxs={batchOtherTxs}
        currentUSD={batchCurrentUSD}
        stocks={stocks}
        type={type}
      />
    </div>
  );
};

export default React.memo(TransactionForm);
