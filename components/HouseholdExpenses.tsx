import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { CashTransaction, Account, RecurringCashRule, BudgetItem } from '../types';
import { generateId } from '../utils';
import { Plus, CreditCard, Edit2, Trash2, ArrowRightLeft, ShoppingBag, Wallet, Tag, PieChart as PieIcon, ChevronDown, DollarSign, PiggyBank, ListFilter, X, Link, Calendar, Clock, ArrowRight, ChevronUp, Layers, Target, Filter, Check, Landmark, Lock, RefreshCcw, Table2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  accounts: Account[];
  cashTransactions: CashTransaction[];
  onAddCashTx: (tx: CashTransaction) => void;
  onUpdateCashTx: (tx: CashTransaction) => void;
  onDeleteCashTx: (id: string) => void;
  recurringRules?: RecurringCashRule[];
  onUpdateRecurringRules?: (rules: RecurringCashRule[]) => void;
  budgetItems?: BudgetItem[]; // Receive Budget Items for Linking
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#64748b', '#8b5cf6'];
const CATEGORY_STORAGE_KEY = 'smartvest_recurring_categories_list_household';
const METHOD_STORAGE_KEY = 'smartvest_cash_methods';

// --- MultiSelect Component ---
const MultiSelect = ({ 
  label, 
  options, 
  value, 
  onChange,
  optionLabels
}: { 
  label: string, 
  options: string[], 
  value: string[], 
  onChange: (val: string[]) => void,
  optionLabels?: Record<string, string>
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (opt: string) => {
    if (opt === 'ALL') {
      onChange(['ALL']);
    } else {
      let newValue = [...value];
      // If currently 'ALL' is selected, clear it to start specific selection
      if (newValue.includes('ALL')) {
        newValue = [];
      }
      
      if (newValue.includes(opt)) {
        newValue = newValue.filter(v => v !== opt);
      } else {
        newValue.push(opt);
      }
      
      // If no items selected, revert to ALL
      if (newValue.length === 0) {
        onChange(['ALL']);
      } else {
        onChange(newValue);
      }
    }
  };

  const isAllSelected = value.includes('ALL');
  
  const displayValue = isAllSelected 
    ? `所有${label}` 
    : value.length === 0
      ? `所有${label}`
      : value.length === 1 
        ? (optionLabels?.[value[0]] || value[0])
        : `已選 ${value.length} 項`;

  return (
    <div className="relative" ref={ref}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg focus:outline-none min-w-[120px] hover:bg-slate-50 transition-colors shadow-sm"
      >
        <span className="truncate max-w-[100px]">{displayValue}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 max-h-[300px] overflow-y-auto animate-in fade-in zoom-in-95">
          <div 
            onClick={() => toggleOption('ALL')}
            className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 cursor-pointer"
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isAllSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
              {isAllSelected && <Check size={10} className="text-white" />}
            </div>
            <span className={`text-sm font-bold ${isAllSelected ? 'text-blue-600' : 'text-slate-700'}`}>全選 (顯示全部)</span>
          </div>
          <div className="h-px bg-slate-100 my-1"></div>
          {options.map(opt => {
            const isSelected = value.includes(opt);
            const optLabel = optionLabels?.[opt] || opt || '(無)';
            return (
              <div 
                key={opt}
                onClick={() => toggleOption(opt)}
                className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 cursor-pointer group"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 group-hover:border-blue-300'}`}>
                  {isSelected && <Check size={10} className="text-white" />}
                </div>
                <span className={`text-sm font-medium truncate ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>{optLabel}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- RecurringRuleModal ---
const RecurringRuleModal = ({ 
    isOpen, onClose, rule, accountId, onSave, accounts, budgetItems = []
}: { 
    isOpen: boolean, onClose: () => void, rule?: RecurringCashRule, accountId: string, onSave: (rule: RecurringCashRule) => void, accounts: Account[], budgetItems?: BudgetItem[]
}) => {
    const [day, setDay] = useState(rule?.dayOfMonth || 15);
    const [amount, setAmount] = useState<string | number>(rule?.amount || '');
    const [category, setCategory] = useState(rule?.category || '其他');
    const [note, setNote] = useState(rule?.note || '');
    const [enabled, setEnabled] = useState(rule?.enabled ?? true);
    const [startDate, setStartDate] = useState(rule?.startDate || new Date().toISOString().split('T')[0]);
    // Allow DEPOSIT type for household income rules
    const [type, setType] = useState<'WITHDRAWAL' | 'TRANSFER' | 'DEPOSIT'>(rule?.type || 'WITHDRAWAL');
    const [toAccountId, setToAccountId] = useState(rule?.toAccountId || '');
    
    const [selectedAccountId, setSelectedAccountId] = useState(rule?.accountId || accountId);
    
    // Credit Card / Payment Method Support
    const [isCreditCard, setIsCreditCard] = useState(!!rule?.isCreditCardPayment);
    const [availableMethods, setAvailableMethods] = useState<string[]>([]);

    // Budget Link
    const [budgetId, setBudgetId] = useState(rule?.budgetId || '');

    const [suggestedCategories, setSuggestedCategories] = useState<string[]>(() => {
        const saved = localStorage.getItem(CATEGORY_STORAGE_KEY);
        return saved ? JSON.parse(saved) : ['餐飲', '交通', '購物', '娛樂', '居住', '水電費', '保險', '租金', '薪資', '獎金', '其他'];
    });

    const cashAccounts = useMemo(() => accounts.filter(a => a.isCash && !a.excludeFromTotals), [accounts]);
    
    const availableBudgetItems = useMemo(() => {
        if (!budgetItems) return [];
        // If type is DEPOSIT, show INCOME items. If WITHDRAWAL, show EXPENSE items.
        if (type === 'TRANSFER') return [];
        const targetType = type === 'DEPOSIT' ? 'INCOME' : 'EXPENSE';
        return budgetItems.filter(b => b.type === targetType);
    }, [budgetItems, type]);

    useEffect(() => {
        if (isOpen) {
            setDay(rule?.dayOfMonth || 15);
            setAmount(rule?.amount || '');
            setCategory(rule?.category || '其他');
            setNote(rule?.note || '');
            setEnabled(rule?.enabled ?? true);
            setStartDate(rule?.startDate || new Date().toISOString().split('T')[0]);
            setType(rule?.type || 'WITHDRAWAL');
            setToAccountId(rule?.toAccountId || '');
            setSelectedAccountId(rule?.accountId || accountId || (cashAccounts.length > 0 ? cashAccounts[0].id : ''));
            setIsCreditCard(!!rule?.isCreditCardPayment);
            setBudgetId(rule?.budgetId || '');
        }
    }, [isOpen, rule, accountId, cashAccounts]);

    useEffect(() => {
        try {
            const savedMethods = localStorage.getItem(METHOD_STORAGE_KEY);
            if (savedMethods) {
                setAvailableMethods(JSON.parse(savedMethods));
            } else {
                setAvailableMethods(['現金', '銀行轉帳', '信用卡', '行動支付']);
            }
        } catch (e) {}
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAccountId) { alert(isCreditCard ? '請輸入支付方式' : '請選擇帳戶'); return; }
        if (type === 'TRANSFER' && !toAccountId) { alert('請選擇轉入帳戶'); return; }
        if (type === 'TRANSFER' && selectedAccountId === toAccountId) { alert('轉出與轉入帳戶不能相同'); return; }

        const trimmedCat = category.trim();
        if (trimmedCat && !suggestedCategories.includes(trimmedCat)) {
            const newCats = [...suggestedCategories, trimmedCat];
            setSuggestedCategories(newCats);
            localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(newCats));
        }
        
        // Save method if using credit card input
        if (isCreditCard && selectedAccountId && !availableMethods.includes(selectedAccountId)) {
            const newMethods = [...availableMethods, selectedAccountId];
            setAvailableMethods(newMethods);
            localStorage.setItem(METHOD_STORAGE_KEY, JSON.stringify(newMethods));
        }

        onSave({
            id: rule?.id || generateId(),
            accountId: selectedAccountId,
            dayOfMonth: day,
            amount: parseFloat(amount.toString()) || 0,
            category: trimmedCat,
            note,
            enabled,
            startDate,
            type,
            toAccountId: type === 'TRANSFER' ? toAccountId : undefined,
            isHousehold: true,
            isCreditCardPayment: isCreditCard,
            budgetId: type !== 'TRANSFER' && budgetId ? budgetId : undefined
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
                <div className="bg-indigo-50 border-b border-indigo-100 p-4 flex justify-between items-center">
                    <h3 className="font-bold text-indigo-800 flex items-center gap-2">
                        <Clock size={18} /> {rule ? '編輯家用排程' : '設定每月家用排程'}
                    </h3>
                    <button type="button" onClick={onClose}><X size={20} className="text-indigo-400 hover:text-indigo-600"/></button>
                </div>
                <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button 
                            type="button" 
                            onClick={() => { setType('WITHDRAWAL'); setBudgetId(''); }}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${type === 'WITHDRAWAL' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            固定扣款 (支出)
                        </button>
                        <button 
                            type="button" 
                            onClick={() => { setType('DEPOSIT'); setBudgetId(''); }}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${type === 'DEPOSIT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            固定入帳 (收入)
                        </button>
                        <button 
                            type="button" 
                            onClick={() => { setType('TRANSFER'); setBudgetId(''); }}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${type === 'TRANSFER' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            固定轉帳 (儲蓄)
                        </button>
                    </div>
                    
                    {type === 'WITHDRAWAL' && (
                        <div className="flex items-center gap-2 pt-1 pb-2">
                            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-600">
                                <input 
                                    type="checkbox" 
                                    checked={isCreditCard} 
                                    onChange={e => {
                                        setIsCreditCard(e.target.checked);
                                        // Reset selected account when switching modes to avoid invalid UUID/Name
                                        setSelectedAccountId('');
                                    }} 
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" 
                                />
                                使用信用卡/非記帳帳戶支付
                            </label>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">{type === 'DEPOSIT' ? '入帳帳戶' : isCreditCard ? '支付方式' : '扣款帳戶'}</label>
                        {isCreditCard ? (
                            <div className="relative">
                                <input 
                                    type="text" 
                                    list="payment-methods"
                                    value={selectedAccountId} 
                                    onChange={e => setSelectedAccountId(e.target.value)} 
                                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 bg-white font-medium text-slate-700"
                                    placeholder="例如：信用卡、LinePay"
                                    required
                                />
                                <Wallet className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                <datalist id="payment-methods">
                                    {availableMethods.map(m => <option key={m} value={m} />)}
                                </datalist>
                            </div>
                        ) : (
                            <select 
                                value={selectedAccountId} 
                                onChange={e => setSelectedAccountId(e.target.value)} 
                                className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 bg-white font-medium text-slate-700"
                                required
                            >
                               <option value="">-- 請選擇帳戶 --</option>
                               {cashAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                            </select>
                        )}
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">每月執行日 (1-31)</label>
                        <input type="number" min="1" max="31" value={day} onChange={e => setDay(parseInt(e.target.value))} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-lg text-center" required />
                    </div>
                    {type === 'TRANSFER' && (
                        <div className="space-y-1 animate-in slide-in-from-top-1">
                            <label className="text-xs font-bold text-blue-600 uppercase flex items-center gap-1"><ArrowRight size={12}/> 轉入帳戶</label>
                            <select value={toAccountId} onChange={e => setToAccountId(e.target.value)} className="w-full px-4 py-2 border border-blue-200 rounded-xl outline-none focus:border-blue-500 bg-blue-50 font-bold text-slate-700" required>
                                <option value="">-- 請選擇轉入帳戶 --</option>
                                {cashAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">{type === 'TRANSFER' ? '轉帳金額' : type === 'DEPOSIT' ? '入帳金額' : '扣款金額'}</label>
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={`w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-lg ${type === 'DEPOSIT' ? 'text-emerald-600' : 'text-slate-800'}`} placeholder="0" required />
                    </div>

                    {type !== 'TRANSFER' && (
                        <div className="space-y-1 animate-in slide-in-from-top-1">
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                <Table2 size={12} /> 連結預算項目 (選填)
                            </label>
                            <select 
                                value={budgetId} 
                                onChange={e => setBudgetId(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium text-slate-700 bg-white"
                            >
                                <option value="">(無連結)</option>
                                {availableBudgetItems.map(item => (
                                    <option key={item.id} value={item.id}>{item.name} (預估: ${item.amount.toLocaleString()})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">類別</label>
                        <input list="house-recurring-cats" value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium text-slate-700" placeholder="請選擇或輸入類別" required />
                        <datalist id="house-recurring-cats">{suggestedCategories.map(c => <option key={c} value={c} />)}</datalist>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">備註</label>
                        <input value={note} onChange={e => setNote(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500" placeholder="例如: 薪資、房租" />
                    </div>
                    <div className="flex items-center gap-3 pt-2 border-t border-slate-50">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="w-5 h-5 text-indigo-600 rounded border-slate-300" />
                            <span className="text-sm font-bold text-slate-700">啟用此規則</span>
                        </label>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg transition-colors">取消</button>
                    <button type="submit" className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md active:scale-95 transition-all">儲存設定</button>
                </div>
            </form>
        </div>
    );
};

// Independent Ledger Modal
const CashTransactionModal = ({ 
    isOpen, onClose, onSave, initialData, defaultType = 'EXPENSE', accounts, budgetItems
  }: { 
    isOpen: boolean, onClose: () => void, onSave: (data: any) => void, initialData?: CashTransaction | null, defaultType?: 'EXPENSE' | 'INCOME', accounts: Account[], budgetItems?: BudgetItem[]
  }) => {
    
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [subCategory, setSubCategory] = useState('');
    const [paymentMethod, setPaymentMethod] = useState(''); 
    const [linkedAccountId, setLinkedAccountId] = useState('');
    const [note, setNote] = useState('');
    const [transactionType, setTransactionType] = useState<'EXPENSE' | 'INCOME'>(defaultType);
    const [budgetId, setBudgetId] = useState(''); // New State for Linked Budget
  
    // Default Data Sets
    const DEFAULT_EXPENSE_CATEGORIES = ['餐飲', '交通', '購物', '娛樂', '居住', '醫療', '保險', '稅務', '教育', '其他'];
    const DEFAULT_INCOME_CATEGORIES = ['薪資', '獎金', '股息', '投資', '兼職', '禮金', '其他'];
    const DEFAULT_EXPENSE_METHODS = ['現金', '銀行轉帳', '聯邦銀行信用卡(Amy)', '永豐大戶信用卡', '中國信託uniopen聯名信用卡', '中國信託LINE PAY信用卡', '富邦信用卡(Amy)', '星展銀行信用卡'];
    const DEFAULT_INCOME_METHODS = ['現金', '銀行轉帳', '領支票'];

    const cashAccounts = useMemo(() => accounts.filter(a => a.isCash && !a.excludeFromTotals), [accounts]);
    const [currentCategories, setCurrentCategories] = useState<string[]>([]);
    const [currentMethods, setCurrentMethods] = useState<string[]>([]);
    const [currentSubCategoryMap, setCurrentSubCategoryMap] = useState<Record<string, string[]>>({});

    const storageKeys = useMemo(() => {
        const isIncome = transactionType === 'INCOME';
        const suffix = isIncome ? '_INCOME' : ''; 
        return {
            CATEGORY: `smartvest_cash_categories${suffix}`,
            SUBCATEGORY: `smartvest_cash_subcategories_map${suffix}`,
            METHOD: `smartvest_cash_methods${suffix}`
        };
    }, [transactionType]);

    // Filter budget items based on current transaction type
    const availableBudgetItems = useMemo(() => {
        if (!budgetItems) return [];
        return budgetItems.filter(b => b.type === (transactionType === 'INCOME' ? 'INCOME' : 'EXPENSE'));
    }, [budgetItems, transactionType]);

    const loadDataLists = useCallback(() => {
        const isIncome = transactionType === 'INCOME';
        try {
            const savedCat = localStorage.getItem(storageKeys.CATEGORY);
            setCurrentCategories(savedCat ? JSON.parse(savedCat) : (isIncome ? DEFAULT_INCOME_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES));
        } catch (e) { setCurrentCategories(isIncome ? DEFAULT_INCOME_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES); }
        try {
            const savedMethod = localStorage.getItem(storageKeys.METHOD);
            setCurrentMethods(savedMethod ? JSON.parse(savedMethod) : (isIncome ? DEFAULT_INCOME_METHODS : DEFAULT_EXPENSE_METHODS));
        } catch (e) { setCurrentMethods(isIncome ? DEFAULT_INCOME_METHODS : DEFAULT_EXPENSE_METHODS); }
        try {
            const savedSub = localStorage.getItem(storageKeys.SUBCATEGORY);
            setCurrentSubCategoryMap(savedSub ? JSON.parse(savedSub) : {});
        } catch (e) { setCurrentSubCategoryMap({}); }
    }, [storageKeys, transactionType]);

    useEffect(() => {
       if (isOpen) {
          if (initialData) {
             setDate(initialData.date); 
             setAmount(initialData.amount.toString()); 
             setCategory(initialData.category || ''); 
             setSubCategory(initialData.subCategory || '');
             setNote(initialData.note || ''); 
             const isUuid = /^[a-z0-9]{7}$/.test(initialData.accountId);
             if (isUuid) { setLinkedAccountId(initialData.accountId); setPaymentMethod('現金'); } 
             else { setPaymentMethod(initialData.accountId); setLinkedAccountId(''); }
             setTransactionType(initialData.type === 'DEPOSIT' ? 'INCOME' : 'EXPENSE');
             setBudgetId(initialData.budgetId || '');
          } else {
             setDate(new Date().toISOString().split('T')[0]); setAmount(''); setCategory(''); setSubCategory(''); setNote(''); setPaymentMethod(''); setLinkedAccountId(''); setTransactionType(defaultType); setBudgetId('');
          }
       }
    }, [isOpen, initialData, defaultType]);

    useEffect(() => { loadDataLists(); }, [loadDataLists]);

    useEffect(() => { if (!paymentMethod && currentMethods.length > 0 && !initialData) { setPaymentMethod(currentMethods[0]); } }, [currentMethods, paymentMethod, initialData]);
  
    const currentSubCategories = useMemo(() => category ? (currentSubCategoryMap[category] || []) : [], [category, currentSubCategoryMap]);

    const saveToLocalStorage = (key: string, currentList: string[], newValue: string, setter: (l: string[]) => void) => {
        const trimmed = newValue.trim();
        if (trimmed && !currentList.includes(trimmed)) {
            const newList = [...currentList, trimmed]; setter(newList);
            localStorage.setItem(key, JSON.stringify(newList));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
       e.preventDefault();
       if (!paymentMethod) { alert('請輸入支付方式'); return; } 
       const isLinkTrigger = paymentMethod === '現金' || paymentMethod === '銀行轉帳' || paymentMethod === '領支票' || paymentMethod === '網路銀行';
       if (isLinkTrigger && !linkedAccountId) { alert('請選擇要連結的現金帳戶'); return; }
       saveToLocalStorage(storageKeys.METHOD, currentMethods, paymentMethod, setCurrentMethods);
       if (!amount || parseFloat(amount) <= 0) { alert('請輸入有效金額'); return; }
       if (category) {
           saveToLocalStorage(storageKeys.CATEGORY, currentCategories, category, setCurrentCategories);
           if (subCategory) {
               const trimmedMain = category.trim(); const trimmedSub = subCategory.trim();
               const currentMap = { ...currentSubCategoryMap }; const existingSubs = currentMap[trimmedMain] || [];
               if (!existingSubs.includes(trimmedSub)) { currentMap[trimmedMain] = [...existingSubs, trimmedSub]; setCurrentSubCategoryMap(currentMap); localStorage.setItem(storageKeys.SUBCATEGORY, JSON.stringify(currentMap)); }
           }
       }
       onSave({ id: initialData?.id, type: transactionType === 'INCOME' ? 'DEPOSIT' : 'WITHDRAWAL', date, amount, category, subCategory, accountId: (isLinkTrigger && linkedAccountId) ? linkedAccountId : paymentMethod, note, budgetId: budgetId || undefined });
    };
  
    if (!isOpen) return null;
    const isIncome = transactionType === 'INCOME';
    const themeColor = isIncome ? 'emerald' : 'rose';
    const CategoryIcon = isIncome ? DollarSign : Tag;
    const isLinkTrigger = paymentMethod === '現金' || paymentMethod === '銀行轉帳' || paymentMethod === '領支票' || paymentMethod === '網路銀行';
    const isEditing = !!initialData;
    
    return (
       <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
             <div className={`bg-${themeColor}-50 border-b border-${themeColor}-100 p-3 text-center shrink-0`}>
                <h3 className={`text-lg font-bold text-${themeColor}-600 flex items-center justify-center gap-2`}>{isIncome ? <PiggyBank size={20}/> : <CreditCard size={20}/>}{isEditing ? (isIncome ? '編輯收入' : '編輯支出') : (isIncome ? '記收入' : '記支出')}</h3>
             </div>
             <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">日期</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-${themeColor}-500 font-medium`} required /></div>
                
                {/* Linked Budget Item */}
                <div className="space-y-1 animate-in slide-in-from-top-1 bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-1"><Table2 size={10}/> 連結預算項目 (選填)</label>
                    <select 
                        value={budgetId} 
                        onChange={e => setBudgetId(e.target.value)} 
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 bg-white text-sm font-bold text-slate-700"
                    >
                        <option value="">(無連結)</option>
                        {availableBudgetItems.map(item => (
                            <option key={item.id} value={item.id}>{item.name} (預估: ${item.amount.toLocaleString()})</option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">支付方式</label>
                    <div className="relative">
                        <input type="text" list="method-suggestions" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={`w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-${themeColor}-500 bg-white font-medium`} placeholder="例如：現金、信用卡、轉帳..." disabled={!!initialData?.sourceTransactionId} />
                        <Wallet className="absolute left-3.5 top-3 text-slate-400" size={18} />
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto border border-slate-50 bg-slate-50/50 p-2 rounded-lg">
                        {currentMethods.map(m => (
                            <div key={m} onClick={() => setPaymentMethod(m)} className="group flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded-md text-xs font-medium text-slate-600 shadow-sm hover:border-purple-200 transition-colors cursor-pointer">{m}</div>
                        ))}
                    </div>
                </div>
                {isLinkTrigger && (
                    <div className="space-y-1 animate-in slide-in-from-top-1 bg-blue-50 p-3 rounded-xl border border-blue-100">
                        <label className="text-[10px] font-black text-blue-600 uppercase flex items-center gap-1 mb-1"><Link size={10}/> 選擇連結的現金帳戶</label>
                        <select value={linkedAccountId} onChange={e => setLinkedAccountId(e.target.value)} className="w-full px-3 py-2 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-400 bg-white font-bold text-sm text-slate-700" required>
                            <option value="">-- 請選擇帳戶 --</option>
                            {cashAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                        </select>
                    </div>
                )}
                <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">金額</label><input type="number" step="1" value={amount} onChange={e => setAmount(e.target.value)} className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-${themeColor}-500 font-bold text-lg text-${themeColor}-600`} placeholder="0" required /></div>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">主類別</label>
                    <div className="relative">
                        <input type="text" list="category-suggestions" value={category} onChange={e => setCategory(e.target.value)} className={`w-full pl-8 pr-2 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-${themeColor}-500 font-medium text-sm`} placeholder="主類別" />
                        <CategoryIcon className="absolute left-2.5 top-3 text-slate-400" size={16} />
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto border border-slate-50 bg-slate-50/50 p-2 rounded-lg">
                        {currentCategories.map(cat => (
                            <div key={cat} onClick={() => setCategory(cat)} className={`group flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded-md text-xs font-medium text-slate-600 shadow-sm hover:border-rose-200 transition-colors cursor-pointer`}>{cat}</div>
                        ))}
                    </div>
                </div>
                
                {/* Re-added Sub Category Input */}
                <div className="space-y-2 animate-in slide-in-from-top-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">子類別 (選填)</label>
                    <div className="relative">
                        <input 
                            type="text" 
                            value={subCategory} 
                            onChange={e => setSubCategory(e.target.value)} 
                            className={`w-full pl-8 pr-2 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-${themeColor}-500 font-medium text-sm`} 
                            placeholder="子類別" 
                        />
                        <Tag className="absolute left-2.5 top-3 text-slate-300" size={16} />
                    </div>
                    {currentSubCategories.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto border border-slate-50 bg-slate-50/50 p-2 rounded-lg">
                            {currentSubCategories.map(sub => (
                                <div key={sub} onClick={() => setSubCategory(sub)} className="group flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded-md text-xs font-medium text-slate-500 shadow-sm hover:border-slate-300 transition-colors cursor-pointer">{sub}</div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">備註</label><input type="text" value={note} onChange={e => setNote(e.target.value)} className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-${themeColor}-500 font-medium`} placeholder="..." /></div>
             </div>
             <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 shrink-0"><button type="button" onClick={onClose} className="px-5 py-2.5 text-slate-500 hover:bg-slate-200 rounded-xl font-bold transition-colors">取消</button><button type="submit" className={`px-6 py-2.5 bg-${themeColor}-600 text-white rounded-xl font-bold hover:bg-${themeColor}-700 shadow-md active:scale-95 transition-all`}>{initialData ? '更新' : '儲存'}</button></div>
          </form>
       </div>
    );
};

// --- Account Detail Popup ---
const AccountDetailPopup = ({ 
    accountName, 
    onClose, 
    transactions 
}: { 
    accountName: string, 
    onClose: () => void, 
    transactions: CashTransaction[] 
}) => {
    // ... (AccountDetailPopup unchanged) ...
    const stats = useMemo(() => {
        let income = 0;
        let expense = 0;
        let transferNet = 0;

        transactions.forEach(tx => {
            const cat = tx.category ? tx.category.trim() : '';
            const isTransfer = cat === '轉帳' || cat === 'Transfer' || !!tx.fromAccountId || !!tx.toAccountId;
            
            if (tx.type === 'DEPOSIT' || tx.type === 'INTEREST' || (tx.type as any) === 'INCOME') {
                if (isTransfer) transferNet += tx.amount;
                else income += tx.amount;
            } else {
                if (isTransfer) transferNet -= tx.amount;
                else expense += tx.amount;
            }
        });
        return { income, expense, transferNet, total: income - expense + transferNet };
    }, [transactions]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 border border-slate-200">
                <div className="bg-gradient-to-r from-slate-50 to-white p-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Wallet size={18} className="text-blue-500"/>
                        {accountName} 收支總計
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 text-slate-400"><X size={18}/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                        <span className="text-sm font-bold text-emerald-700">總收入</span>
                        <span className="text-lg font-mono font-bold text-emerald-600">+{stats.income.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-xl bg-rose-50 border border-rose-100">
                        <span className="text-sm font-bold text-rose-700">總支出</span>
                        <span className="text-lg font-mono font-bold text-rose-600">-{stats.expense.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-xl bg-blue-50 border border-blue-100">
                        <span className="text-sm font-bold text-blue-700">轉帳淨額</span>
                        <span className={`text-lg font-mono font-bold ${stats.transferNet === 0 ? 'text-slate-400' : stats.transferNet > 0 ? 'text-blue-600' : 'text-slate-700'}`}>
                            {stats.transferNet > 0 ? '+' : ''}{stats.transferNet.toLocaleString()}
                        </span>
                    </div>
                    <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-500">區間淨流量</span>
                        <span className={`text-xl font-black font-mono ${stats.total >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                            {stats.total > 0 ? '+' : ''}{stats.total.toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const HouseholdExpenses: React.FC<Props> = ({ 
    accounts, cashTransactions, onAddCashTx, onUpdateCashTx, onDeleteCashTx, recurringRules = [], onUpdateRecurringRules, budgetItems = []
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTx, setEditingTx] = useState<CashTransaction | null>(null);
    const [modalDefaultType, setModalDefaultType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
    
    // Filter States
    const [filterType, setFilterType] = useState<'MONTH' | 'YEAR' | 'CUSTOM'>('MONTH');
    const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]); 
    const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().slice(0, 8) + '01');
    const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);
    
    // Recurring State
    const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<RecurringCashRule | undefined>(undefined);
    const [ruleAccountId, setRuleAccountId] = useState('');
    const [isRecurringExpanded, setIsRecurringExpanded] = useState(false);

    // Analysis State
    const [chartTab, setChartTab] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
    const [analysisMode, setAnalysisMode] = useState<'CATEGORY' | 'SUBCATEGORY' | 'TICKER' | 'ACCOUNT' | 'METHOD'>('CATEGORY');
    
    // Multi-Select Filter States
    const [selectedChartCategories, setSelectedChartCategories] = useState<string[]>([]);
    const [selectedChartSubCategories, setSelectedChartSubCategories] = useState<string[]>([]);

    // Account Detail State
    const [accountDetailId, setAccountDetailId] = useState<string | null>(null);

    // Stats Mode State (Account vs Method)
    const [statsMode, setStatsMode] = useState<'ACCOUNT' | 'METHOD'>('ACCOUNT');

    // List View Filter State
    const [tableFilterCategories, setTableFilterCategories] = useState<string[]>(['ALL']);
    const [tableFilterAccounts, setTableFilterAccounts] = useState<string[]>(['ALL']);
    const [tableFilterType, setTableFilterType] = useState<string[]>(['ALL']); // ALL, INCOME, EXPENSE, TRANSFER

    const handleSave = (data: any) => {
        if (data.id) {
            onUpdateCashTx({ id: data.id, accountId: data.accountId, date: data.date, type: data.type, amount: parseFloat(data.amount), currency: 'TWD', category: data.category, subCategory: data.subCategory, note: data.note, budgetId: data.budgetId }); 
        } else {
            onAddCashTx({ id: generateId(), date: data.date, accountId: data.accountId, type: data.type, amount: parseFloat(data.amount), currency: 'TWD', category: data.category, subCategory: data.subCategory, note: data.note, budgetId: data.budgetId });
        }
        setIsModalOpen(false); setEditingTx(null);
    };

    // Calculate Today's Date (Local Time) to hide future transactions
    const todayStr = useMemo(() => {
        const now = new Date();
        const y = now.getFullYear();
        const m = (now.getMonth() + 1).toString().padStart(2, '0');
        const d = now.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
    }, []);

    const filteredTxs = useMemo(() => {
        return cashTransactions.filter(tx => {
            const txDate = tx.date;
            // 1. Hide Future Transactions from List & Stats
            if (txDate > todayStr) return false;
            
            // Exclude simulated accounts entirely from Household Expenses
            const accountName = accounts.find(a => a.id === tx.accountId)?.name || tx.accountId;
            if (accountName.includes('模擬帳戶')) return false;

            if (filterType === 'MONTH') return txDate.startsWith(currentDate.slice(0, 7));
            if (filterType === 'YEAR') return txDate.startsWith(currentDate.slice(0, 4));
            return txDate >= customStartDate && txDate <= customEndDate;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [cashTransactions, filterType, currentDate, customStartDate, customEndDate, todayStr, accounts]);

    const chartRelevantTxs = useMemo(() => {
        const isExpense = chartTab === 'EXPENSE';
        return filteredTxs.filter(tx => {
             // Exclude transfers from charts
             if (tx.category === '轉帳') return false;
             return isExpense ? tx.type === 'WITHDRAWAL' : (tx.type === 'DEPOSIT' || tx.type === 'INTEREST' || (tx.type as any) === 'INCOME');
        });
    }, [filteredTxs, chartTab]);

    const chartCategoryOptions = useMemo(() => Array.from(new Set(chartRelevantTxs.map(t => t.category || '未分類'))).sort(), [chartRelevantTxs]);
    const chartSubCategoryOptions = useMemo(() => Array.from(new Set(chartRelevantTxs.map(t => t.subCategory || t.category || '未分類'))).sort(), [chartRelevantTxs]);

    // Update available categories/subcategories when filteredTxs OR chartTab changes and Default Select ALL
    useEffect(() => {
        // Always reset to ALL when the underlying data source (date range) or tab changes
        setSelectedChartCategories(chartCategoryOptions);
        setSelectedChartSubCategories(chartSubCategoryOptions);
    }, [chartCategoryOptions, chartSubCategoryOptions]);

    const stats = useMemo(() => {
        let totalExpense = 0;
        let totalIncome = 0;
        let totalTransferIn = 0;
        let totalTransferOut = 0;

        filteredTxs.forEach(tx => {
            const isTransfer = tx.category === '轉帳';
            
            if (tx.type === 'WITHDRAWAL') {
                if (isTransfer) totalTransferOut += tx.amount;
                else totalExpense += tx.amount;
            } else if (tx.type === 'DEPOSIT' || tx.type === 'INTEREST' || (tx.type as any) === 'INCOME') {
                if (isTransfer) totalTransferIn += tx.amount;
                else totalIncome += tx.amount;
            }
        });
        
        return { 
            totalExpense, 
            totalIncome, 
            netTransfer: totalTransferIn - totalTransferOut,
            // Pure Net Income = Income - Expense (excluding transfers)
            net: totalIncome - totalExpense 
        };
    }, [filteredTxs]);

    const chartData = useMemo(() => {
        const map = new Map<string, number>();
        const isExpense = chartTab === 'EXPENSE';
        
        filteredTxs.forEach(tx => {
            // Exclude transfers from chart analysis
            if (tx.category === '轉帳') return;

            const match = isExpense ? tx.type === 'WITHDRAWAL' : (tx.type === 'DEPOSIT' || tx.type === 'INTEREST');
            if (!match) return;

            // Apply Filters
            if (analysisMode === 'CATEGORY' && !selectedChartCategories.includes(tx.category || '未分類')) return;
            if (analysisMode === 'SUBCATEGORY' && !selectedChartSubCategories.includes(tx.subCategory || tx.category || '未分類')) return;

            let key = '';
            if (analysisMode === 'CATEGORY') {
                key = tx.category || '未分類';
            } else if (analysisMode === 'SUBCATEGORY') {
                key = tx.subCategory || tx.category || '無子類別';
            } else if (analysisMode === 'TICKER') {
                // Parse ticker name from synced note: e.g., "買進 台積電 (自動)"
                const note = tx.note || '';
                // Standard sync pattern regex
                const tickerMatch = note.match(/(買進|賣出|領息|股息)\s+(.+?)\s*(\(自動\)|-|$)/);
                if (tickerMatch && tickerMatch[2]) {
                    key = tickerMatch[2].trim();
                } else if (tx.category?.includes('投資')) {
                    key = '其他投資項目';
                } else {
                    return; // Skip non-investment flows in ticker mode
                }
            } else if (analysisMode === 'ACCOUNT') {
                key = accounts.find(a => a.id === tx.accountId)?.name || tx.accountId;
            } else if (analysisMode === 'METHOD') {
                const isRealAccount = accounts.some(a => a.id === tx.accountId);
                if (isRealAccount) key = '現金/帳戶';
                else key = tx.accountId; 
            }
            
            if (key) {
                map.set(key, (map.get(key) || 0) + tx.amount);
            }
        });
        return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [filteredTxs, analysisMode, chartTab, accounts, selectedChartCategories, selectedChartSubCategories]);

    const filteredTotal = useMemo(() => chartData.reduce((sum, item) => sum + item.value, 0), [chartData]);

    const householdRules = useMemo(() => recurringRules.filter(r => r.isHousehold), [recurringRules]);

    // Calculate Options for Table Filters
    const tableCategoryOptions = useMemo(() => {
        return Array.from(new Set(filteredTxs.map(t => t.category || '未分類'))).sort();
    }, [filteredTxs]);

    const tableAccountOptions = useMemo(() => {
        return Array.from(new Set(filteredTxs.map(t => {
            return accounts.find(a => a.id === t.accountId)?.name || t.accountId;
        }))).sort();
    }, [filteredTxs, accounts]);

    // Reset Table Filters when Date Range Changes
    useEffect(() => {
        setTableFilterCategories(['ALL']);
        setTableFilterAccounts(['ALL']);
        setTableFilterType(['ALL']);
    }, [filterType, currentDate, customStartDate, customEndDate]);

    // Calculate Display Transactions based on List View Filters
    const tableDisplayTxs = useMemo(() => {
        return filteredTxs.filter(tx => {
            if (!tableFilterType.includes('ALL')) {
                const isTransfer = tx.category === '轉帳';
                const isIncome = tx.type === 'DEPOSIT' || tx.type === 'INTEREST' || (tx.type as any) === 'INCOME';
                const isExpense = tx.type === 'WITHDRAWAL';
                
                let typeStr = '';
                if (isTransfer) typeStr = 'TRANSFER';
                else if (isIncome) typeStr = 'INCOME';
                else if (isExpense) typeStr = 'EXPENSE';

                if (!tableFilterType.includes(typeStr)) return false;
            }

            if (!tableFilterCategories.includes('ALL')) {
                const cat = tx.category || '未分類';
                if (!tableFilterCategories.includes(cat)) return false;
            }
            if (!tableFilterAccounts.includes('ALL')) {
                const accName = accounts.find(a => a.id === tx.accountId)?.name || tx.accountId;
                if (!tableFilterAccounts.includes(accName)) return false;
            }
            return true;
        });
    }, [filteredTxs, tableFilterCategories, tableFilterAccounts, tableFilterType, accounts]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                    {(['MONTH', 'YEAR', 'CUSTOM'] as const).map(type => (
                        <button key={type} onClick={() => setFilterType(type)} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${filterType === type ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            {type === 'MONTH' ? '月檢視' : type === 'YEAR' ? '年檢視' : '自訂區間'}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                    {filterType === 'MONTH' && <input type="month" value={currentDate.slice(0, 7)} onChange={(e) => setCurrentDate(e.target.value + '-01')} className="bg-white border border-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg outline-none" />}
                    {filterType === 'YEAR' && (
                        <div className="relative">
                            <select value={currentDate.slice(0, 4)} onChange={(e) => setCurrentDate(`${e.target.value}-01-01`)} className="bg-white border border-slate-200 text-slate-700 font-bold px-3 py-1.5 pr-8 rounded-lg outline-none appearance-none cursor-pointer">
                                {Array.from({length: 5}, (_, i) => new Date().getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y} 年</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                        </div>
                    )}
                </div>
            </div>

            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-2 bg-gradient-to-r from-slate-800 to-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl flex flex-col justify-between min-h-[180px]">
                     <div className="absolute top-0 right-0 p-32 bg-rose-500 rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                     <div className="relative z-10 flex flex-wrap gap-8 items-start">
                        <div>
                            <p className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-2 flex items-center gap-1"><ArrowRightLeft size={12}/> 總支出</p>
                            <h2 className="text-3xl font-bold font-mono tracking-tight text-rose-400">NT$ {stats.totalExpense.toLocaleString()}</h2>
                        </div>
                        <div>
                            <p className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-2 flex items-center gap-1"><DollarSign size={12}/> 總收入</p>
                            <h2 className="text-3xl font-bold font-mono tracking-tight text-emerald-400">NT$ {stats.totalIncome.toLocaleString()}</h2>
                        </div>
                        <div>
                            <p className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-2 flex items-center gap-1"><Landmark size={12}/> 收支結餘</p>
                            <h2 className={`text-3xl font-bold font-mono tracking-tight ${stats.net >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                                {stats.net > 0 ? '+' : ''}{stats.net.toLocaleString()}
                            </h2>
                        </div>
                     </div>
                </div>
                <button onClick={() => { setEditingTx(null); setModalDefaultType('INCOME'); setIsModalOpen(true); }} className="h-full min-h-[180px] bg-white border-2 border-dashed border-emerald-200 rounded-3xl text-slate-500 font-bold shadow-sm hover:shadow-xl hover:border-emerald-400 hover:text-emerald-600 transition-all flex flex-col items-center justify-center gap-4 group">
                    <div className="p-4 bg-slate-100 text-slate-400 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-all transform group-hover:scale-110 shadow-inner"><PiggyBank size={32} /></div><span className="text-xl">記收入</span>
                </button>
                <button onClick={() => { setEditingTx(null); setModalDefaultType('EXPENSE'); setIsModalOpen(true); }} className="h-full min-h-[180px] bg-white border-2 border-dashed border-rose-200 rounded-3xl text-slate-500 font-bold shadow-sm hover:shadow-xl hover:border-rose-400 hover:text-rose-600 transition-all flex flex-col items-center justify-center gap-4 group">
                    <div className="p-4 bg-slate-100 text-slate-400 rounded-2xl group-hover:bg-rose-600 group-hover:text-white transition-all transform group-hover:scale-110 shadow-inner"><CreditCard size={32} /></div><span className="text-xl">記支出</span>
                </button>
            </div>

            {/* Analysis Section */}
            {filteredTxs.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative">
                        <div className="flex flex-col gap-4 mb-6">
                            <div className="flex justify-between items-start">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2"><PieIcon size={18} className={chartTab === 'EXPENSE' ? "text-rose-500" : "text-emerald-500"}/> 收支結構分析</h3>
                                {/* Filter Section */}
                                <div className="flex items-center gap-2">
                                    <MultiSelect 
                                        label="類別"
                                        options={chartCategoryOptions}
                                        value={selectedChartCategories}
                                        onChange={setSelectedChartCategories}
                                    />
                                    <MultiSelect 
                                        label="子類別"
                                        options={chartSubCategoryOptions}
                                        value={selectedChartSubCategories}
                                        onChange={setSelectedChartSubCategories}
                                    />
                                </div>
                            </div>
                            
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                    <button onClick={() => setChartTab('EXPENSE')} className={`px-4 py-1 text-xs font-bold rounded-md transition-all ${chartTab === 'EXPENSE' ? 'bg-white text-rose-600 shadow' : 'text-slate-500'}`}>支出</button>
                                    <button onClick={() => setChartTab('INCOME')} className={`px-4 py-1 text-xs font-bold rounded-md transition-all ${chartTab === 'INCOME' ? 'bg-white text-emerald-600 shadow' : 'text-slate-500'}`}>收入</button>
                                </div>

                                <div className="flex bg-slate-100 p-1 rounded-lg overflow-x-auto no-scrollbar">
                                    {(['CATEGORY', 'SUBCATEGORY', 'TICKER', 'ACCOUNT', 'METHOD'] as const).map(mode => (
                                        <button 
                                            key={mode}
                                            onClick={() => setAnalysisMode(mode)} 
                                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all whitespace-nowrap flex items-center gap-1 ${analysisMode === mode ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            {mode === 'TICKER' && <Target size={12}/>}
                                            {mode === 'CATEGORY' ? '類別' : mode === 'SUBCATEGORY' ? '子類別' : mode === 'TICKER' ? '標的' : mode === 'ACCOUNT' ? '帳戶' : '方式'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        {chartData.length > 0 ? (
                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                <div className="h-[220px] w-full sm:w-1/2 relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={2} dataKey="value">
                                                {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip formatter={(val: number) => `NT$ ${val.toLocaleString()}`} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase">合計</span>
                                        <span className={`font-mono font-bold ${chartTab === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            ${filteredTotal.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                                <div className="w-full sm:w-1/2 h-[220px] overflow-y-auto pl-4 custom-scrollbar">
                                    {chartData.map((entry, index) => {
                                        const total = filteredTotal;
                                        return (
                                            <div key={index} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                                                <div className="flex items-center gap-2 flex-1 mr-2 min-w-0">
                                                    <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor: COLORS[index % COLORS.length]}}></div>
                                                    <span className="text-slate-600 font-bold truncate" title={entry.name}>{entry.name}</span>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <span className="block font-bold text-slate-700">NT$ {entry.value.toLocaleString()}</span>
                                                    <span className="block text-[10px] text-slate-400">{(total > 0 ? (entry.value/total*100) : 0).toFixed(1)}%</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="h-[220px] flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                                <ListFilter size={32} className="opacity-20"/>
                                <span>{analysisMode === 'TICKER' ? '此區間無投資連動資料' : '無符合篩選數據'}</span>
                            </div>
                        )}
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2"><Wallet size={18} className="text-indigo-500"/> 收支統計</h3>
                            {/* Mode Toggle */}
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button 
                                    onClick={() => setStatsMode('ACCOUNT')} 
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${statsMode === 'ACCOUNT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    帳戶
                                </button>
                                <button 
                                    onClick={() => setStatsMode('METHOD')} 
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${statsMode === 'METHOD' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    方式
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto max-h-[250px] custom-scrollbar">
                            <table className="w-full text-sm">
                                <thead className="text-xs text-slate-400 bg-slate-50 uppercase sticky top-0"><tr><th className="py-2 pl-3 text-left">{statsMode === 'ACCOUNT' ? '帳戶名稱' : '支付方式'}</th><th className="py-2 pr-3 text-right">區間淨額</th></tr></thead>
                                <tbody className="divide-y divide-slate-50">
                                    {(() => {
                                        const grouped = filteredTxs.reduce((map, tx) => {
                                            const accId = tx.accountId;
                                            // Check if system account
                                            const isSys = accounts.some(a => a.id === accId);
                                            
                                            if (statsMode === 'ACCOUNT' && !isSys) return map;
                                            if (statsMode === 'METHOD' && isSys) return map;

                                            const name = isSys ? accounts.find(a => a.id === accId)?.name || accId : accId;
                                            
                                            const curr = map.get(accId) || { name, net: 0, id: accId };
                                            curr.net += (tx.type === 'WITHDRAWAL' ? -tx.amount : tx.amount);
                                            map.set(accId, curr);
                                            return map;
                                        }, new Map<string, {name: string, net: number, id: string}>());

                                        const rows = Array.from(grouped.values()).sort((a, b) => b.net - a.net);

                                        if (rows.length === 0) {
                                            return <tr><td colSpan={2} className="py-8 text-center text-slate-400 text-xs">無相關資料</td></tr>;
                                        }

                                        return rows.map((stats) => {
                                            const account = accounts.find(a => a.id === stats.id);
                                            return (
                                                <tr 
                                                    key={stats.id} 
                                                    className="hover:bg-slate-50 cursor-pointer group transition-colors"
                                                    onClick={() => setAccountDetailId(stats.id)}
                                                >
                                                    <td className="py-3 pl-3 font-bold text-slate-700 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                                                        <Landmark size={14} className="text-slate-400 group-hover:text-blue-500"/>
                                                        {stats.name}
                                                        {statsMode === 'ACCOUNT' && account && (
                                                            <div className="flex gap-1 ml-1 scale-90 origin-left">
                                                                {account.isCash && (
                                                                    <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 font-bold">現</span>
                                                                )}
                                                                {(account.isSecurities !== false) && (
                                                                    <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 font-bold">證</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className={`py-3 pr-3 text-right font-mono font-bold ${stats.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        {stats.net >= 0 ? '+' : ''}{stats.net.toLocaleString()}
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Recurring Rules Section */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-300">
                <div onClick={() => setIsRecurringExpanded(!isRecurringExpanded)} className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white cursor-pointer hover:bg-slate-50 transition-colors select-none">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg"><Calendar size={18}/></div>
                        <h3 className="font-bold text-slate-800 text-sm">家用自動記帳排程</h3>
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{householdRules.length}</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={(e) => { e.stopPropagation(); setEditingRule(undefined); setRuleAccountId(accounts.find(a => a.isCash)?.id || ''); setIsRecurringModalOpen(true); }} className="px-3 py-1 bg-white border border-indigo-200 text-indigo-600 rounded-lg text-[10px] font-bold shadow-sm hover:bg-indigo-50 transition-all flex items-center gap-1"><Plus size={12}/> 新增排程</button>
                        <div className="text-slate-400">{isRecurringExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
                    </div>
                </div>
                {isRecurringExpanded && (
                    <div className="overflow-x-auto animate-in slide-in-from-top-2">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 text-slate-400 uppercase font-bold border-b border-slate-100"><tr><th className="py-3 px-4">狀態</th><th className="py-3 px-4">日期</th><th className="py-3 px-4">來源</th><th className="py-3 px-4">類型</th><th className="py-3 px-4">項目</th><th className="py-3 px-4 text-right">金額</th><th className="py-3 px-4">備註</th><th className="py-3 px-4 text-right">操作</th></tr></thead>
                            <tbody className="divide-y divide-slate-50">
                                {householdRules.length === 0 ? <tr><td colSpan={7} className="py-8 text-center text-slate-400 italic">目前尚無家用排程</td></tr> : 
                                householdRules.map(rule => (
                                    <tr key={rule.id} className={`hover:bg-slate-50 ${!rule.enabled ? 'opacity-50' : ''}`}>
                                        <td className="py-3 px-4"><span className={`px-2 py-1 rounded-full text-[10px] font-bold ${rule.enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>{rule.enabled ? '啟用中' : '已停用'}</span></td>
                                        <td className="py-3 px-4 font-bold text-slate-700">每月 {rule.dayOfMonth} 號</td>
                                        <td className="py-3 px-4 text-slate-500">{accounts.find(a => a.id === rule.accountId)?.name || rule.accountId}</td>
                                        <td className="py-3 px-4">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${rule.type === 'TRANSFER' ? 'text-blue-600 bg-blue-50 border-blue-100' : rule.type === 'DEPOSIT' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100'}`}>
                                                {rule.type === 'TRANSFER' ? '轉帳' : rule.type === 'DEPOSIT' ? '入帳' : '支出'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 font-bold text-slate-600">
                                            {rule.type === 'TRANSFER' ? accounts.find(a => a.id === rule.toAccountId)?.name : rule.category}
                                            {rule.budgetId && <span className="inline-block ml-1 text-[9px] bg-indigo-50 text-indigo-600 px-1 rounded border border-indigo-100">預算</span>}
                                        </td>
                                        <td className={`py-3 px-4 text-right font-mono font-bold ${rule.type === 'TRANSFER' ? 'text-blue-600' : rule.type === 'DEPOSIT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {rule.type === 'DEPOSIT' ? '+' : ''}NT$ {rule.amount.toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-slate-400 truncate max-w-[150px]" title={rule.note}>{rule.note}</td>
                                        <td className="py-3 px-4 text-right"><div className="flex justify-end gap-1"><button onClick={() => { setEditingRule(rule); setRuleAccountId(rule.accountId); setIsRecurringModalOpen(true); }} className="p-1 text-blue-500 hover:bg-blue-100 rounded transition-colors"><Edit2 size={14}/></button><button onClick={() => onUpdateRecurringRules?.(recurringRules.filter(r => r.id !== rule.id))} className="p-1 text-rose-500 hover:bg-rose-100 rounded transition-colors"><Trash2 size={14}/></button></div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50/50 gap-4">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><ShoppingBag size={18} className="text-slate-400"/> 收支明細列表</h3>
                        <span className="text-xs text-slate-400 font-bold bg-slate-200 px-2 py-1 rounded-md">{tableDisplayTxs.length} 筆</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <MultiSelect 
                            label="類型" 
                            options={['INCOME', 'EXPENSE', 'TRANSFER']} 
                            value={tableFilterType} 
                            onChange={setTableFilterType} 
                            optionLabels={{'INCOME': '收入', 'EXPENSE': '支出', 'TRANSFER': '轉帳'}}
                        />
                        <MultiSelect 
                            label="類別" 
                            options={tableCategoryOptions} 
                            value={tableFilterCategories} 
                            onChange={setTableFilterCategories} 
                        />
                        <MultiSelect 
                            label="支付/帳戶" 
                            options={tableAccountOptions} 
                            value={tableFilterAccounts} 
                            onChange={setTableFilterAccounts} 
                        />
                    </div>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar relative">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100 sticky top-0 z-10"><tr><th className="px-6 py-3 font-bold">日期</th><th className="px-6 py-3 font-bold">類別</th><th className="px-6 py-3 font-bold">子類別</th><th className="px-6 py-3 font-bold">支付/帳戶</th><th className="px-6 py-3 font-bold text-right">金額</th><th className="px-6 py-3 font-bold pl-8">備註</th><th className="px-6 py-3 font-bold text-right">操作</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                            {tableDisplayTxs.length === 0 ? <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">無符合篩選條件的紀錄</td></tr> : 
                            tableDisplayTxs.map(tx => {
                                // 30-Day Lock Logic
                                const txDateObj = new Date(tx.date);
                                const limitDate = new Date();
                                limitDate.setDate(limitDate.getDate() - 30);
                                limitDate.setHours(0, 0, 0, 0); 
                                txDateObj.setHours(0, 0, 0, 0);
                                const isLocked = txDateObj < limitDate;
                                
                                const isTransfer = tx.category === '轉帳';

                                return (
                                <tr key={tx.id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-6 py-4 font-mono text-slate-600 font-medium">{tx.date}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-md text-xs font-bold border ${
                                            isTransfer ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                            tx.type === 'DEPOSIT' || tx.type === 'INTEREST' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                            'bg-rose-50 text-rose-600 border-rose-100'
                                        }`}>
                                            {isTransfer && <RefreshCcw size={10} className="inline mr-1" />}
                                            {tx.category || '支出'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4"><span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">{tx.subCategory || tx.category}</span></td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5 text-blue-600 font-bold">
                                            <Wallet size={14} className="shrink-0" />
                                            <span className="whitespace-nowrap">{accounts.find(a => a.id === tx.accountId)?.name || tx.accountId}</span>
                                        </div>
                                    </td>
                                    <td className={`px-6 py-4 text-right font-mono font-bold text-lg ${
                                        isTransfer ? 'text-blue-600' :
                                        tx.type === 'DEPOSIT' || tx.type === 'INTEREST' ? 'text-emerald-600' : 
                                        'text-rose-600'
                                    }`}>
                                        {tx.type === 'WITHDRAWAL' ? '-' : '+'}{tx.amount.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 pl-8 text-slate-500 max-w-xs truncate">
                                        {tx.sourceTransactionId && (
                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mr-2 ${
                                                tx.note?.includes('(資產連動)') || tx.sourceTransactionId.startsWith('auto_rec')
                                                    ? 'bg-amber-100 text-amber-600' 
                                                    : 'bg-blue-100 text-blue-600'
                                            }`}>
                                                {tx.note?.includes('(資產連動)') || tx.sourceTransactionId.startsWith('auto_rec') ? '資產連動' : '投資連動'}
                                            </span>
                                        )}
                                        {tx.budgetId && (
                                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mr-2 bg-indigo-100 text-indigo-600 border border-indigo-200">
                                                預算連動
                                            </span>
                                        )}
                                        {tx.note}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {isLocked ? (
                                            <div className="flex justify-end gap-2 text-slate-300" title="超過30天無法修改/刪除">
                                                <Lock size={16} />
                                            </div>
                                        ) : (
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => { setEditingTx(tx); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={16}/></button>
                                                <button onClick={() => onDeleteCashTx(tx.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={16}/></button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
            </div>

            <CashTransactionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} initialData={editingTx} defaultType={modalDefaultType} accounts={accounts} budgetItems={budgetItems} />
            <RecurringRuleModal 
                isOpen={isRecurringModalOpen} 
                onClose={() => setIsRecurringModalOpen(false)} 
                rule={editingRule} 
                accountId={ruleAccountId} 
                onSave={(rule) => {
                    const newRules = recurringRules.filter(r => r.id !== rule.id); newRules.push(rule); onUpdateRecurringRules?.(newRules);
                }} 
                accounts={accounts} 
                budgetItems={budgetItems}
            />
            
            {accountDetailId && (
                <AccountDetailPopup 
                    accountName={accounts.find(a => a.id === accountDetailId)?.name || accountDetailId}
                    onClose={() => setAccountDetailId(null)}
                    transactions={filteredTxs.filter(tx => tx.accountId === accountDetailId)}
                />
            )}
        </div>
    );
};

export default React.memo(HouseholdExpenses);