
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { GeneralAssetItem, GeneralAssetType, AmortizationMethod, Stock, Account, Transaction, CashTransaction, RecurringCashRule, LoanType, BudgetItem } from '../types';
import { generateId } from '../utils';
import { 
  TrendingUp, Plus, Trash2, Edit2, Check,
  PieChart as PieChartIcon, 
  Home, Banknote, Shield, Percent, X, Clock,
  ChevronDown, ChevronUp, ChevronRight, Wallet, Lock, Ban, Settings, Calendar, Hourglass, ArrowRightLeft, ArrowRight, Tag, AlertCircle, ShoppingBag, Table2, Coins
} from 'lucide-react';
import { 
  PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip
} from 'recharts';

interface Props {
  assets: GeneralAssetItem[];
  onUpdateAssets: React.Dispatch<React.SetStateAction<GeneralAssetItem[]>>;
  stockValueTWD: number;
  stocks?: Stock[];
  accounts?: Account[];
  onUpdateAccount?: (account: Account) => void;
  stockTransactions?: Transaction[];
  cashTransactions?: CashTransaction[];
  householdTransactions?: CashTransaction[];
  onAddCashTx?: (tx: CashTransaction) => void;
  onUpdateCashTx?: (tx: CashTransaction) => void;
  onDeleteCashTx?: (id: string) => void;
  onUpdateHouseholdTx?: (tx: CashTransaction) => void;
  onDeleteHouseholdTx?: (id: string) => void;
  globalExchangeRate?: number;
  autoSyncStartDate?: string;
  onUpdateAutoSyncDate?: (date: string) => void;
  recurringRules?: RecurringCashRule[];
  onUpdateRecurringRules?: (rules: RecurringCashRule[]) => void;
  budgetItems?: BudgetItem[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];
const CATEGORY_STORAGE_KEY = 'smartvest_recurring_categories_list';
const CATEGORY_STORAGE_KEY_EXPENSE = 'smartvest_general_categories_expense';
const CATEGORY_STORAGE_KEY_INCOME = 'smartvest_general_categories_income';

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
    
    // New: Transfer & Deposit Support
    const [type, setType] = useState<'WITHDRAWAL' | 'TRANSFER' | 'DEPOSIT'>(rule?.type || 'WITHDRAWAL');
    const [toAccountId, setToAccountId] = useState(rule?.toAccountId || '');
    
    // Budget Linking
    const [budgetId, setBudgetId] = useState(rule?.budgetId || '');

    const [isCreditCard, setIsCreditCard] = useState(!!rule?.isCreditCardPayment);
    const [selectedAccountId, setSelectedAccountId] = useState(rule?.accountId || accountId);
    
    const METHOD_STORAGE_KEY = 'smartvest_payment_methods';
    const [availableMethods, setAvailableMethods] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(METHOD_STORAGE_KEY);
            return saved ? JSON.parse(saved) : ['現金', '銀行轉帳', '信用卡', '行動支付'];
        } catch {
            return ['現金', '銀行轉帳', '信用卡', '行動支付'];
        }
    });

    const [suggestedCategories, setSuggestedCategories] = useState<string[]>(() => {
        const saved = localStorage.getItem(CATEGORY_STORAGE_KEY);
        return saved ? JSON.parse(saved) : ['捐款', '孝親費', '保險', '租金', '訂閱', '網路費', '水電費', '房貸扣款', '儲蓄轉帳', '薪資', '股息', '其他'];
    });

    const cashAccounts = useMemo(() => accounts.filter(a => a.isCash || a.isSecurities), [accounts]);

    const availableBudgetItems = useMemo(() => {
        if (!budgetItems) return [];
        // If type is DEPOSIT, show INCOME items. If WITHDRAWAL, show EXPENSE items.
        // Transfer usually doesn't link to budget directly in this context, but allow EXPENSE just in case? No, usually not.
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
            setBudgetId(rule?.budgetId || '');
            setIsCreditCard(!!rule?.isCreditCardPayment);
            setSelectedAccountId(rule?.accountId || accountId);
        }
    }, [isOpen, rule, accountId]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!selectedAccountId) { 
            alert(isCreditCard ? '請輸入支付方式' : '請選擇來源帳戶'); 
            return; 
        }
        if (type === 'TRANSFER' && !toAccountId) {
            alert('請選擇轉入帳戶');
            return;
        }
        if (type === 'TRANSFER' && selectedAccountId === toAccountId) { 
            alert('轉出與轉入帳戶不能相同'); 
            return; 
        }

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
            isCreditCardPayment: isCreditCard,
            amount: parseFloat(amount.toString()) || 0,
            category: trimmedCat,
            note,
            enabled,
            startDate,
            type,
            toAccountId: type === 'TRANSFER' ? toAccountId : undefined,
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
                        <Clock size={18} /> {rule ? '編輯固定排程' : '設定每月固定排程'}
                    </h3>
                    <button type="button" onClick={onClose}><X size={20} className="text-indigo-400 hover:text-indigo-600"/></button>
                </div>
                <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button 
                            type="button" 
                            onClick={() => { setType('WITHDRAWAL'); setBudgetId(''); }}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${type === 'WITHDRAWAL' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            扣款 (支出)
                        </button>
                        <button 
                            type="button" 
                            onClick={() => { setType('DEPOSIT'); setBudgetId(''); }}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${type === 'DEPOSIT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            入帳 (收入)
                        </button>
                        <button 
                            type="button" 
                            onClick={() => { setType('TRANSFER'); setBudgetId(''); }}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${type === 'TRANSFER' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            轉帳 (儲蓄)
                        </button>
                    </div>

                    {type === 'WITHDRAWAL' && (
                        <div className="flex items-center gap-2 py-1">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input 
                                    type="checkbox" 
                                    checked={isCreditCard} 
                                    onChange={e => {
                                        setIsCreditCard(e.target.checked);
                                        setSelectedAccountId('');
                                    }} 
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" 
                                />
                                <span className="text-sm font-bold text-slate-700">使用信用卡/非記帳帳戶支付</span>
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
                               {cashAccounts.filter(acc => type !== 'TRANSFER' || acc.id !== toAccountId).map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                            </select>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">每月執行日 (1-31)</label>
                        <input type="number" min="1" max="31" value={day} onChange={e => setDay(parseInt(e.target.value))} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-lg text-center" required />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">登記日 (開始生效日)</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium text-slate-700" required />
                    </div>
                    
                    {type === 'TRANSFER' && (
                        <div className="space-y-1 animate-in slide-in-from-top-1">
                            <label className="text-xs font-bold text-blue-600 uppercase flex items-center gap-1">
                                <ArrowRight size={12}/> 轉入帳戶
                            </label>
                            <select 
                                value={toAccountId} 
                                onChange={e => setToAccountId(e.target.value)}
                                className="w-full px-4 py-2 border border-blue-200 rounded-xl outline-none focus:border-blue-500 bg-blue-50 font-bold text-slate-700"
                                required={type === 'TRANSFER'}
                            >
                                <option value="">-- 請選擇轉入帳戶 --</option>
                                {cashAccounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
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
                        <label className="text-xs font-bold text-slate-500 uppercase">類別 (可自行輸入)</label>
                        <input 
                            list="recurring-cats" 
                            value={category} 
                            onChange={e => setCategory(e.target.value)} 
                            className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium text-slate-700"
                            placeholder="請選擇或輸入類別"
                            required
                        />
                        <datalist id="recurring-cats">
                            {suggestedCategories.map(c => <option key={c} value={c} />)}
                        </datalist>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">備註</label>
                        <input value={note} onChange={e => setNote(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500" placeholder="例如: 房貸、零存整付" />
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

// --- CashTransactionModal ---
const CashTransactionModal = ({ 
    isOpen, onClose, accounts, onSave, initialData, defaultAccountId, isHousehold = false, budgetItems = []
}: { 
    isOpen: boolean, onClose: () => void, accounts: Account[], onSave: (data: any) => void, initialData?: CashTransaction | null, defaultAccountId?: string | null, isHousehold?: boolean, budgetItems?: BudgetItem[]
}) => {
    const [tab, setTab] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>('EXPENSE');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [accountId, setAccountId] = useState('');
    const [fromAccountId, setFromAccountId] = useState('');
    const [toAccountId, setToAccountId] = useState('');
    const [note, setNote] = useState('');
    const [isCreditCardPayment, setIsCreditCardPayment] = useState(false);
    const [budgetId, setBudgetId] = useState('');

    // Persistent Categories State
    const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
    const [incomeCategories, setIncomeCategories] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            let expKey = CATEGORY_STORAGE_KEY_EXPENSE;
            let incKey = CATEGORY_STORAGE_KEY_INCOME;
            let defExp = ['餐飲', '交通', '購物', '娛樂', '居住', '醫療', '保險', '稅務', '投資支出', '手續費', '其他'];
            let defInc = ['薪資', '獎金', '股息', '投資收入', '利息', '其他'];

            if (isHousehold) {
                expKey = 'smartvest_cash_categories';
                incKey = 'smartvest_cash_categories_INCOME';
                defExp = ['餐飲', '交通', '購物', '娛樂', '居住', '醫療', '保險', '稅務', '教育', '其他'];
                defInc = ['薪資', '獎金', '股息', '投資', '兼職', '禮金', '其他'];
            }

            // Load Categories from LocalStorage
            try {
                const savedExp = localStorage.getItem(expKey);
                setExpenseCategories(savedExp ? JSON.parse(savedExp) : defExp);
                
                const savedInc = localStorage.getItem(incKey);
                setIncomeCategories(savedInc ? JSON.parse(savedInc) : defInc);
            } catch (e) {
                setExpenseCategories(defExp);
                setIncomeCategories(defInc);
            }

            if (initialData) {
                setDate(initialData.date);
                setAmount(initialData.amount.toString());
                setCategory(initialData.category || '');
                setNote(initialData.note || '');
                setAccountId(initialData.accountId);
                setIsCreditCardPayment(!!initialData.isCreditCardPayment);
                setBudgetId(initialData.budgetId || '');
                if (initialData.type === 'DEPOSIT') setTab('INCOME');
                else if (initialData.type === 'WITHDRAWAL') setTab('EXPENSE');
            } else {
                setDate(new Date().toISOString().split('T')[0]);
                setAmount('');
                setCategory('');
                setNote('');
                setIsCreditCardPayment(false);
                setBudgetId('');
                setTab('EXPENSE');
                if (defaultAccountId) {
                    setAccountId(defaultAccountId);
                    setFromAccountId(defaultAccountId);
                    const other = accounts.find(a => a.id !== defaultAccountId);
                    setToAccountId(other ? other.id : accounts[0]?.id || '');
                } else if (accounts.length > 0) {
                    setAccountId(accounts[0].id);
                    setFromAccountId(accounts[0].id);
                    setToAccountId(accounts.length > 1 ? accounts[1].id : accounts[0].id);
                }
            }
        }
    }, [isOpen, initialData, accounts, defaultAccountId, isHousehold]);

    const availableBudgetItems = useMemo(() => {
        if (!budgetItems) return [];
        if (tab === 'TRANSFER') return [];
        const targetType = tab === 'INCOME' ? 'INCOME' : 'EXPENSE';
        return budgetItems.filter(b => b.type === targetType);
    }, [budgetItems, tab]);

    const handleDeleteCategory = (catToDelete: string) => {
        if (!confirm(`確定要刪除類別「${catToDelete}」嗎？`)) return;
        
        let expKey = CATEGORY_STORAGE_KEY_EXPENSE;
        let incKey = CATEGORY_STORAGE_KEY_INCOME;
        if (isHousehold) {
            expKey = 'smartvest_cash_categories';
            incKey = 'smartvest_cash_categories_INCOME';
        }

        if (tab === 'EXPENSE') {
            const newCats = expenseCategories.filter(c => c !== catToDelete);
            setExpenseCategories(newCats);
            localStorage.setItem(expKey, JSON.stringify(newCats));
        } else if (tab === 'INCOME') {
            const newCats = incomeCategories.filter(c => c !== catToDelete);
            setIncomeCategories(newCats);
            localStorage.setItem(incKey, JSON.stringify(newCats));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (tab === 'TRANSFER' && !initialData) {
            if (!fromAccountId || !toAccountId) { alert('請選擇轉出及轉入帳戶'); return; }
            if (fromAccountId === toAccountId) { alert('轉出與轉入帳戶不能相同'); return; }
        } else {
            if (!accountId) { alert('請選擇帳戶'); return; }
        }
        if (!amount || parseFloat(amount) <= 0) { alert('請輸入有效金額'); return; }
        
        // Save Category Logic
        if (tab !== 'TRANSFER' && category) {
            const trimmed = category.trim();
            if (trimmed) {
                let expKey = CATEGORY_STORAGE_KEY_EXPENSE;
                let incKey = CATEGORY_STORAGE_KEY_INCOME;
                if (isHousehold) {
                    expKey = 'smartvest_cash_categories';
                    incKey = 'smartvest_cash_categories_INCOME';
                }

                if (tab === 'EXPENSE' && !expenseCategories.includes(trimmed)) {
                    const newCats = [...expenseCategories, trimmed];
                    setExpenseCategories(newCats);
                    localStorage.setItem(expKey, JSON.stringify(newCats));
                } else if (tab === 'INCOME' && !incomeCategories.includes(trimmed)) {
                    const newCats = [...incomeCategories, trimmed];
                    setIncomeCategories(newCats);
                    localStorage.setItem(incKey, JSON.stringify(newCats));
                }
            }
        }

        const fromAccount = accounts.find(a => a.id === fromAccountId);
        const toAccount = accounts.find(a => a.id === toAccountId);
        
        onSave({ 
            id: initialData?.id, 
            type: tab, 
            date, 
            amount, 
            category, 
            accountId, 
            fromAccountId, 
            toAccountId, 
            fromAccountName: fromAccount?.name, 
            toAccountName: toAccount?.name, 
            note, 
            isCreditCardPayment,
            budgetId: (tab !== 'TRANSFER' && budgetId) ? budgetId : undefined
        });
    };

    if (!isOpen) return null;
    const isEditing = !!initialData;
    
    // Determine current category list based on tab
    const currentCategoryList = tab === 'INCOME' ? incomeCategories : expenseCategories;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
                <div className={`bg-${isHousehold ? 'indigo' : 'slate'}-50 border-b border-${isHousehold ? 'indigo' : 'slate'}-100 p-2 flex justify-center gap-2 shrink-0`}>
                    {!isEditing ? (
                        <>
                            <button type="button" onClick={() => { setTab('EXPENSE'); setBudgetId(''); }} className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${tab === 'EXPENSE' ? 'bg-white shadow text-rose-600' : 'text-slate-500 hover:bg-slate-100'}`}>支出</button>
                            <button type="button" onClick={() => { setTab('INCOME'); setBudgetId(''); }} className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${tab === 'INCOME' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:bg-slate-100'}`}>收入</button>
                            <button type="button" onClick={() => { setTab('TRANSFER'); setBudgetId(''); }} className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${tab === 'TRANSFER' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}>轉帳</button>
                        </>
                    ) : (
                        <div className="flex-1 py-2 text-center text-slate-700 font-bold">{tab === 'INCOME' ? '編輯收入' : '編輯支出'} {isHousehold && '(家用)'}</div>
                    )}
                </div>
                <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">日期</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium" required /></div>
                    
                    {tab !== 'TRANSFER' && (
                        <div className="space-y-1 animate-in slide-in-from-top-1 bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                            <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                                <Table2 size={10}/> 連結預算項目 (選填)
                            </label>
                            <select 
                                value={budgetId} 
                                onChange={e => setBudgetId(e.target.value)} 
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 bg-white text-sm font-bold text-slate-700"
                            >
                                <option value="">(無連結)</option>
                                {availableBudgetItems.map(item => (
                                    <option key={item.id} value={item.id}>{item.name} (預估: ${item.amount.toLocaleString()})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {tab === 'TRANSFER' && !isEditing ? (
                        <div className="flex items-center gap-2">
                            <div className="space-y-1 flex-1"><label className="text-xs font-bold text-slate-500 uppercase">從帳戶 (轉出)</label><select value={fromAccountId} onChange={e => setFromAccountId(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white font-medium">{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                            <div className="space-y-1 flex-1"><label className="text-xs font-bold text-slate-500 uppercase">到帳戶 (轉入)</label><select value={toAccountId} onChange={e => setToAccountId(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white font-medium">{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">帳戶</label>
                            <select value={accountId} onChange={e => setAccountId(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white font-medium disabled:bg-slate-100 disabled:text-slate-500" disabled={isEditing}>
                                {/* Fallback option if accountId is not in accounts list (e.g. string payment method from household) */}
                                {!accounts.some(a => a.id === accountId) && accountId && (
                                    <option value={accountId}>{accountId} (非系統帳戶)</option>
                                )}
                                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">金額</label><input type="number" step="1" value={amount} onChange={e => setAmount(e.target.value)} className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-lg ${tab === 'EXPENSE' ? 'text-rose-600' : tab === 'INCOME' ? 'text-emerald-600' : 'text-blue-600'}`} placeholder="0" required /></div>
                    
                    {tab !== 'TRANSFER' && (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">類別</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={category} 
                                    onChange={e => setCategory(e.target.value)} 
                                    className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium" 
                                    placeholder="選擇或輸入類別" 
                                />
                                <Tag className="absolute left-3 top-3 text-slate-400" size={16} />
                            </div>
                            
                            {/* Tiles for Quick Selection */}
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto border border-slate-50 bg-slate-50/50 p-2 rounded-lg">
                                {currentCategoryList.map(cat => (
                                    <div
                                        key={cat}
                                        onClick={() => setCategory(cat)}
                                        className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                                            category === cat 
                                                ? 'bg-blue-100 text-blue-700 border-blue-200 shadow-sm' 
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-blue-200 hover:text-blue-600'
                                        }`}
                                    >
                                        <span>{cat}</span>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }}
                                            className={`p-0.5 rounded-full transition-colors ${
                                                category === cat 
                                                    ? 'text-blue-400 hover:bg-blue-200 hover:text-blue-800' 
                                                    : 'text-slate-300 hover:bg-slate-100 hover:text-rose-500'
                                            }`}
                                        >
                                            <X size={10} strokeWidth={3} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {tab === 'EXPENSE' && !isHousehold && (
                        <div className="flex items-center gap-2 py-1">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input 
                                    type="checkbox" 
                                    checked={isCreditCardPayment} 
                                    onChange={e => setIsCreditCardPayment(e.target.checked)} 
                                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" 
                                />
                                <span className="text-sm font-bold text-slate-700">付信用卡費 (不同步至家用記帳)</span>
                            </label>
                        </div>
                    )}

                    <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">備註</label><input type="text" value={note} onChange={e => setNote(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium" placeholder="..." /></div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 shrink-0"><button type="button" onClick={onClose} className="px-6 py-2.5 text-slate-500 hover:bg-slate-200 rounded-xl font-bold transition-colors">取消</button><button type="submit" className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg active:scale-95 transition-all">{isEditing ? '更新' : '儲存'}</button></div>
            </form>
        </div>
    );
};

// --- AssetSection ---
const AssetSection = ({ 
  title, icon: Icon, category, type, items, colorClass, 
  editingId, setEditingId, onUpdateItem, onDeleteItem, onAddItem,
  hideAddButton = false, headerAction = null,
  renderExpandedContent, viewMode = 'list', renderCardStats,
  renderCardAction 
}: any) => {
  const [isSectionExpanded, setIsSectionExpanded] = useState(true);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const sectionTotal = items.reduce((sum: number, item: GeneralAssetItem) => sum + (item.isExcluded ? 0 : item.value), 0);
  
  const hasProjected = items.some((item: GeneralAssetItem) => item.projectedWithoutDiv !== undefined && item.projectedWithoutDiv !== item.value);
  const hasPendingDiv = items.some((item: GeneralAssetItem) => item.pendingDiv !== undefined && item.pendingDiv > 0);
  const sectionProjectedTotal = items.reduce((sum: number, item: GeneralAssetItem) => sum + (item.isExcluded ? 0 : (item.projectedWithoutDiv !== undefined ? item.projectedWithoutDiv : item.value)), 0);
  const sectionPendingDivTotal = items.reduce((sum: number, item: GeneralAssetItem) => sum + (item.isExcluded ? 0 : (item.pendingDiv !== undefined ? item.pendingDiv : 0)), 0);

  const formatCurrency = (val: number | undefined) => {
    if (val === undefined) return '-';
    return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(val);
  };

  const toggleItemExpansion = (id: string) => {
    if (expandedItemId === id) setExpandedItemId(null);
    else setExpandedItemId(id);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300 h-full flex flex-col">
      <div 
        onClick={(e) => {
           if ((e.target as HTMLElement).closest('.header-action')) return;
           setIsSectionExpanded(!isSectionExpanded);
        }}
        className={`px-4 py-3 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-gradient-to-r ${type === 'ASSET' ? 'from-emerald-50/30' : 'from-rose-50/30'} to-white cursor-pointer select-none hover:bg-slate-50 transition-colors`}
      >
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${colorClass} bg-opacity-10`}>
            <Icon size={18} className={colorClass.replace('bg-', 'text-')} />
          </div>
          <h4 className="font-bold text-slate-800 text-base max-sm:text-sm whitespace-nowrap">{title}</h4>
        </div>
        <div className="flex flex-wrap items-center gap-3 self-end xl:self-auto header-action">
           {headerAction && (
             <div className="flex items-center">
                {headerAction}
             </div>
           )}
           <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
             <div className="flex flex-col items-end gap-1">
                <span className={`font-bold font-mono text-base ${type === 'ASSET' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatCurrency(sectionTotal)}
                </span>
                {(hasProjected || hasPendingDiv) && (
                    <div className="flex flex-col items-end gap-1">
                        {hasProjected && (
                            <span className="flex items-center gap-1 text-xs font-bold font-mono text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title="扣除未來預約後的預估餘額">
                                <Hourglass size={10} />
                                {formatCurrency(sectionProjectedTotal)}
                            </span>
                        )}
                        {hasPendingDiv && (
                            <span className="flex items-center gap-1 text-xs font-bold font-mono text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200" title="未來配息">
                                <Coins size={10} />
                                +{formatCurrency(sectionPendingDivTotal)}
                            </span>
                        )}
                    </div>
                )}
             </div>
             <div 
               className="text-slate-400 cursor-pointer"
               onClick={(e) => {
                  e.stopPropagation();
                  setIsSectionExpanded(!isSectionExpanded);
               }}
             >
               {isSectionExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
             </div>
           </div>
        </div>
      </div>
      
      {isSectionExpanded && (
        <div className="p-3 animate-in slide-in-from-top-2 duration-200 bg-white flex-1">
          {viewMode === 'card' ? (
             <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {items.map((item: GeneralAssetItem) => {
                   const isExpanded = expandedItemId === item.id;
                   const canExpand = item.isLinked && renderExpandedContent;
                   return (
                      <div key={item.id} className={`rounded-xl border transition-all duration-200 flex flex-col ${isExpanded ? 'border-blue-200 shadow-md ring-2 ring-blue-50' : 'border-slate-200 hover:border-blue-300 hover:shadow-sm'}`}>
                         <div className="p-4 flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <div className={`p-2 rounded-lg ${item.category === 'CASH' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                     {item.category === 'CASH' ? <Wallet size={18} /> : <Banknote size={18}/>}
                                  </div>
                                  <div className="min-w-0">
                                     <div className="flex items-center gap-1.5">
                                        <span className={`font-bold text-sm truncate ${item.isExcluded ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{item.name}</span>
                                        {item.isLinked && <Lock size={10} className="text-blue-500" />}
                                     </div>
                                     {item.isExcluded && <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">不計入</span>}
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  {renderCardAction && renderCardAction(item)}
                                  {!item.isLinked && (
                                     <>
                                        <button onClick={() => setEditingId(item.id)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 size={14}/></button>
                                        <button onClick={() => onDeleteItem(item.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"><Trash2 size={14}/></button>
                                     </>
                                  )}
                               </div>
                            </div>

                            {editingId === item.id ? (
                               <div className="space-y-2">
                                  <input 
                                     autoFocus 
                                     type="number"
                                     className="w-full px-2 py-1 border border-blue-300 rounded text-lg font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                     value={item.value || ''}
                                     onChange={e => onUpdateItem(item.id, { value: parseFloat(e.target.value) || 0 })}
                                  />
                                  <div className="flex gap-2">
                                     <input 
                                        className="flex-1 px-2 py-1 border border-blue-200 rounded text-xs"
                                        value={item.note || ''}
                                        onChange={e => onUpdateItem(item.id, { note: e.target.value })}
                                        placeholder="備註"
                                     />
                                     <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold">OK</button>
                                  </div>
                               </div>
                            ) : (
                               <div>
                                  <div className="flex items-baseline gap-2 flex-wrap">
                                     <div className={`text-2xl font-black font-mono tracking-tight ${item.value < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                                        {formatCurrency(item.value)}
                                     </div>
                                     {(item.projectedWithoutDiv !== undefined && item.projectedWithoutDiv !== item.value) && (
        <div className="flex items-center gap-1 text-sm font-bold font-mono text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100" title="扣除配息後的未來餘額">
           <Hourglass size={12} />
           {formatCurrency(item.projectedWithoutDiv)}
        </div>
     )}
     {(item.pendingDiv !== undefined && item.pendingDiv > 0) && (
        <div className="flex items-center gap-1 text-sm font-bold font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100" title="未來配息">
           <Coins size={12} />
           +{formatCurrency(item.pendingDiv)}
        </div>
     )}
                                  </div>
                                  {renderCardStats && renderCardStats(item)}
                                  {item.note && <div className="text-xs text-slate-400 mt-1 truncate">{item.note}</div>}
                               </div>
                            )}
                         </div>
                         
                         {canExpand && (
                            <div className={`border-t border-slate-100 bg-slate-50/50 ${isExpanded ? 'bg-white' : ''}`}>
                               <button 
                                  onClick={() => toggleItemExpansion(item.id)}
                                  className="w-full py-2 text-xs font-bold text-slate-500 hover:text-blue-600 flex items-center justify-center gap-1 transition-colors"
                               >
                                  {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                  {isExpanded ? '收起明細' : '查看明細'}
                               </button>
                               {isExpanded && (
                                  <div className="p-3 border-t border-slate-100 animate-in slide-in-from-top-2">
                                     {renderExpandedContent && renderExpandedContent(item)}
                                  </div>
                               )}
                            </div>
                         )}
                      </div>
                   );
                })}
                {!hideAddButton && (
                   <button 
                     onClick={() => onAddItem(category, type)}
                     className="min-h-[140px] rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/50 transition-all flex flex-col items-center justify-center gap-2 font-bold text-sm group"
                   >
                     <div className="p-3 bg-slate-100 rounded-full group-hover:bg-blue-100 transition-colors">
                        <Plus size={24} />
                     </div>
                     新增資產項目
                   </button>
                )}
             </div>
          ) : (
             <>
                {items.map((item: GeneralAssetItem) => {
                   const isExpanded = expandedItemId === item.id;
                   const canExpand = item.isLinked && renderExpandedContent;

                   return (
                     <div key={item.id} className="border-b border-slate-50 last:border-0">
                       <div 
                          className={`group flex items-center justify-between p-2 rounded-lg transition-colors ${canExpand ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                          onClick={() => canExpand && toggleItemExpansion(item.id)}
                       >
                          {editingId === item.id ? (
                            <div className="flex-1 flex flex-wrap gap-2 items-center animate-in fade-in" onClick={e => e.stopPropagation()}>
                               <input 
                                 autoFocus={!item.isLinked}
                                 readOnly={!!item.isLinked}
                                 className={`flex-1 min-w-[80px] px-2 py-1 border border-blue-300 rounded text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-100 ${item.isLinked ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                                 value={item.name}
                                 onChange={e => onUpdateItem(item.id, { name: e.target.value })}
                                 placeholder="項目名稱"
                               />
                               <input 
                                 type="number"
                                 autoFocus={!!item.isLinked}
                                 className="w-24 px-2 py-1 border border-blue-300 rounded text-sm font-mono text-right font-bold focus:outline-none focus:ring-2 focus:ring-blue-100"
                                 value={item.value || ''}
                                 onChange={e => onUpdateItem(item.id, { value: parseFloat(e.target.value) || 0 })}
                                 placeholder="金額"
                               />
                               <input 
                                 readOnly={!!item.isLinked}
                                 className={`flex-1 min-w-[60px] px-2 py-1 border border-blue-200 rounded text-xs text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-100 ${item.isLinked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
                                 value={item.note || ''}
                                 onChange={e => onUpdateItem(item.id, { note: e.target.value })}
                                 placeholder="備註"
                               />
                               <button onClick={() => setEditingId(null)} className="p-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200">
                                  <Check size={14} />
                               </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1 flex items-center gap-2 overflow-hidden">
                                {canExpand && (
                                   <div className={`transition-transform duration-200 text-slate-400 ${isExpanded ? 'rotate-90' : ''}`}>
                                      <ChevronRight size={14} />
                                   </div>
                                )}
                                <span className={`font-bold text-sm truncate ${item.isExcluded ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.name}</span>
                                {item.isLinked && (
                                   <span className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 font-bold border border-blue-100 flex items-center gap-1">
                                      <Lock size={8} />
                                   </span>
                                )}
                                {item.isExcluded && (
                                   <span className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-bold border border-slate-200 flex items-center gap-1">
                                      <Ban size={8} />
                                   </span>
                                )}
                                {item.note && <span className="shrink-0 text-[10px] text-slate-400 bg-slate-100 px-1 rounded truncate max-w-[80px]">{item.note}</span>}
                              </div>
                              <div className="flex items-center gap-3 ml-2">
                                 <span className={`font-mono font-bold text-sm ${item.isExcluded ? 'text-slate-300' : item.value < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                                    {formatCurrency(item.value)}
                                 </span>
                                 {!item.isLinked && (
                                   <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity items-center">
                                      <button onClick={(e) => { e.stopPropagation(); setEditingId(item.id); }} className="p-1 text-slate-400 hover:text-blue-600 rounded"><Edit2 size={12} /></button>
                                      <button 
                                        type="button" 
                                        onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id); }} 
                                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                        title="刪除"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                   </div>
                                 )}
                              </div>
                            </>
                          )}
                       </div>
                       {isExpanded && canExpand && (
                          <div className="bg-slate-50/50 p-2 rounded-b-lg border-t border-slate-100 animate-in slide-in-from-top-1">
                             {renderExpandedContent && renderExpandedContent(item)}
                          </div>
                       )}
                     </div>
                   );
                })}
                {!hideAddButton && (
                  <button 
                    onClick={() => onAddItem(category, type)}
                    className="w-full mt-2 py-1.5 border border-dashed border-slate-200 text-slate-400 rounded-lg hover:bg-slate-50 hover:text-slate-600 hover:border-slate-300 transition-all text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <Plus size={12} /> 新增項目
                  </button>
                )}
             </>
          )}
        </div>
      )}
    </div>
  );
};

// ... (LoanTable and LoanEditModal remain unchanged) ...
// --- LoanTable ---
const LoanTable = ({ items, category, onEdit, onDelete, onAdd }: { items: GeneralAssetItem[], category: string, onEdit: (item?: GeneralAssetItem, cat?: string) => void, onDelete: (id: string) => void, onAdd: (cat: string) => void }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const totalOriginal = items.reduce((sum, i) => sum + (i.originalAmount || 0), 0);
  const totalRemaining = items.reduce((sum, i) => sum + i.value, 0);
  const totalMonthlyPrincipal = items.reduce((sum, i) => sum + (i.monthlyPrincipal || 0), 0);
  const totalMonthlyInterest = items.reduce((sum, i) => sum + (i.monthlyInterest || 0), 0);
  const totalMonthlyPayment = totalMonthlyPrincipal + totalMonthlyInterest;
  
  const isPledge = category === 'PLEDGE' || category === 'LOAN';
  const borderColor = isPledge ? 'border-amber-200' : 'border-emerald-200';
  const rowColor = isPledge ? 'hover:bg-amber-50' : 'hover:bg-emerald-50';
  
  const formatCurrency = (val: number | undefined) => { 
      if (val === undefined) return '-'; 
      return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(val); 
  };
  const formatPercent = (val: number | undefined) => { 
      if (val === undefined) return '-'; 
      return `${val.toFixed(2)}%`; 
  };
  
  const calculateRemainingInterest = (item: GeneralAssetItem) => { 
      if (!item.maturityDate || !item.value || !item.interestRate) return 0; 
      const now = new Date(); 
      const maturity = new Date(item.maturityDate); 
      now.setHours(0,0,0,0); maturity.setHours(0,0,0,0); 
      if (isNaN(maturity.getTime()) || maturity <= now) return 0; 
      const diffTime = maturity.getTime() - now.getTime(); 
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      const dailyInterest = (item.value * (item.interestRate / 100)) / 365; 
      return Math.round(dailyInterest * diffDays); 
  };
  
  const totalRemainingInterest = items.reduce((sum, item) => sum + calculateRemainingInterest(item), 0);
  
  return ( 
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300"> 
        <div onClick={() => setIsExpanded(!isExpanded)} className={`px-4 py-3 border-b ${borderColor} flex justify-between items-center ${isPledge ? 'bg-amber-50' : 'bg-emerald-50'} cursor-pointer select-none`} > 
            <h4 className={`font-bold text-base ${isPledge ? 'text-amber-800' : 'text-emerald-800'} flex items-center gap-2`}> {isPledge ? <Percent size={18}/> : <Home size={18}/>} {isPledge ? '股票質押 & 信貸' : '房屋貸款 (Mortgage)'} <span className="opacity-50 ml-1"> {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />} </span> </h4> 
            <button onClick={(e) => { e.stopPropagation(); onAdd(category); }} className={`text-[10px] px-3 py-1.5 rounded border font-bold flex items-center gap-1 transition-all ${isPledge ? 'bg-white border-amber-300 text-amber-600 hover:bg-amber-100' : 'bg-white border-emerald-300 text-emerald-600 hover:bg-emerald-100'}`} > <Plus size={14}/> 新增 </button> 
        </div> 
        {isExpanded && ( 
            <div className="overflow-x-auto animate-in slide-in-from-top-2 duration-200"> 
                <table className="w-full text-xs text-left whitespace-nowrap"> 
                    <thead className={`${isPledge ? 'bg-amber-200/50' : 'bg-emerald-200/50'} text-slate-700 font-bold border-b ${borderColor}`}> 
                        <tr><th className="px-2 py-3">項目</th><th className="px-2 py-3 text-right">原始</th><th className="px-2 py-3 text-right">剩餘</th><th className="px-2 py-3 text-center">方式</th><th className="px-2 py-3 text-right">月本</th><th className="px-2 py-3 text-right">月利</th><th className="px-2 py-3 text-right">月繳</th><th className="px-2 py-3 text-center">利率</th>{isPledge && <th className="px-2 py-3 text-center">維持</th>}{isPledge && <th className="px-2 py-3 text-center">張數</th>}{isPledge && <th className="px-2 py-3 text-right">市值</th>}<th className="px-2 py-3 text-center">到期</th>{isPledge && <th className="px-2 py-3 text-right">到期利息</th>}<th className="px-2 py-3">銀行</th><th className="px-2 py-3 text-center"></th></tr> 
                    </thead> 
                    <tbody className="divide-y divide-slate-100"> 
                        {items.map(item => { 
                            const monthlyTotal = (item.monthlyPrincipal || 0) + (item.monthlyInterest || 0); 
                            const remainingInterest = calculateRemainingInterest(item); 
                            const isStockPledge = item.loanType === 'STOCK_PLEDGE'; 
                            const debtBasis = item.value + (isStockPledge ? remainingInterest : 0); 
                            const maintenanceRatio = isPledge && debtBasis > 0 ? ((item.collateralValue || 0) / debtBasis) * 100 : 0; 
                            const isCredit = item.loanType === 'CREDIT'; 
                            const isPrincipalOnly = item.amortizationMethod === 'PRINCIPAL' || !item.amortizationMethod; 
                            let methodText = '-'; 
                            if (isStockPledge) methodText = '質押'; 
                            else if (isCredit || !isPledge) methodText = isPrincipalOnly ? '還本' : '本息'; 
                            
                            return ( 
                                <tr key={item.id} className={`transition-colors ${rowColor} group`}><td className="px-2 py-3 font-bold text-slate-700 max-w-[120px] truncate" title={item.name}>{item.name}</td><td className="px-2 py-3 text-right text-slate-500">{formatCurrency(item.originalAmount)}</td><td className="px-2 py-3 text-right font-bold text-slate-800">{formatCurrency(item.value)}</td><td className="px-2 py-3 text-center text-slate-500 text-[10px]">{methodText}</td><td className="px-2 py-3 text-right text-slate-600">{formatCurrency(item.monthlyPrincipal)}</td><td className="px-2 py-3 text-right text-slate-600">{formatCurrency(item.monthlyInterest)}</td><td className="px-2 py-3 text-right font-bold text-rose-600">{formatCurrency(monthlyTotal)}</td><td className="px-2 py-3 text-center text-blue-600 font-mono">{formatPercent(item.interestRate)}</td>{isPledge && (<><td className="px-2 py-3 text-center font-bold">{isStockPledge ? (<span className={`${maintenanceRatio < 140 ? 'text-rose-600' : maintenanceRatio < 170 ? 'text-amber-600' : 'text-emerald-600'}`}>{item.value > 0 ? formatPercent(maintenanceRatio) : '-'}</span>) : '-'}</td><td className="px-2 py-3 text-center font-mono text-slate-600">{isStockPledge && item.pledgeLots ? item.pledgeLots : '-'}</td><td className="px-2 py-3 text-right text-slate-600">{isStockPledge ? formatCurrency(item.collateralValue) : '-'}</td></>)}<td className="px-2 py-3 text-center text-slate-500 text-[10px]">{item.maturityDate ? item.maturityDate.slice(0,7) : '-'}</td>{isPledge && (<td className="px-2 py-3 text-right text-slate-500 font-mono text-[10px]">{remainingInterest > 0 ? formatCurrency(remainingInterest) : '-'}</td>)}<td className="px-2 py-3 text-slate-600 text-[10px] max-w-[80px] truncate">{item.bank || '-'}</td><td className="px-2 py-3 text-center"><div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button type="button" onClick={() => onEdit(item)} className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"><Edit2 size={14}/></button><button type="button" onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors" title="刪除"><Trash2 size={14}/></button></div></td></tr> 
                            ); 
                        })} 
                        <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800 text-[10px]"><td className="px-2 py-3">合計</td><td className="px-2 py-3 text-right">{formatCurrency(totalOriginal)}</td><td className="px-2 py-3 text-right text-rose-600">{formatCurrency(totalRemaining)}</td><td className="px-2 py-3 text-center text-slate-400">-</td><td className="px-2 py-3 text-right">{formatCurrency(totalMonthlyPrincipal)}</td><td className="px-2 py-3 text-right">{formatCurrency(totalMonthlyInterest)}</td><td className="px-2 py-3 text-right text-rose-600">{formatCurrency(totalMonthlyPayment)}</td><td className="px-2 py-3 text-center text-slate-400">-</td>{isPledge && <td className="px-2 py-3 text-center text-slate-400">-</td>}{isPledge && <td className="px-2 py-3 text-center text-slate-400">-</td>}{isPledge && <td className="px-2 py-3 text-center text-slate-400">-</td>}<td className="px-2 py-3 text-center text-slate-400">-</td>{isPledge && <td className="px-2 py-3 text-right text-slate-500">{formatCurrency(totalRemainingInterest)}</td>}<td className="px-2 py-3"></td><td className="px-2 py-3"></td></tr> 
                    </tbody> 
                </table> 
            </div> 
        )} 
    </div> 
  ); 
};

// --- LoanEditModal ---
const LoanEditModal = ({ isOpen, onClose, initialData, category, onSave, stocks }: { isOpen: boolean, onClose: () => void, initialData: GeneralAssetItem | null, category: string, onSave: (item: GeneralAssetItem) => void, stocks: Stock[] }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [originalAmount, setOriginalAmount] = useState(initialData?.originalAmount?.toString() || '');
    const [remainingAmount, setRemainingAmount] = useState(initialData?.value?.toString() || '');
    const [interestRate, setInterestRate] = useState(initialData?.interestRate?.toString() || '');
    const [method, setMethod] = useState<AmortizationMethod>(initialData?.amortizationMethod || 'PRINCIPAL');
    const [pledgeStockId, setPledgeStockId] = useState(initialData?.targetStockId || '');
    const [pledgeLots, setPledgeLots] = useState(initialData?.pledgeLots?.toString() || '');
    const [loanType, setLoanType] = useState(initialData?.loanType || (category === 'PLEDGE' ? 'STOCK_PLEDGE' : 'CREDIT'));
    const [loanDate, setLoanDate] = useState(initialData?.loanDate || '');
    const [maturityDate, setMaturityDate] = useState(initialData?.maturityDate || '');
    const [bank, setBank] = useState(initialData?.bank || '');
    const [monthlyPrincipal, setMonthlyPrincipal] = useState(initialData?.monthlyPrincipal?.toString() || '');
    const [monthlyInterest, setMonthlyInterest] = useState(initialData?.monthlyInterest?.toString() || '');
    const [totalPayment, setTotalPayment] = useState('0');
    
    const isPledge = category === 'PLEDGE';
    const isFirstRun = useRef(true);
    const isNameInit = useRef(true);

    useEffect(() => {
        if (initialData) {
            const p = initialData.monthlyPrincipal || 0;
            const i = initialData.monthlyInterest || 0;
            setTotalPayment((p + i).toString());
        }
    }, [initialData]);

    useEffect(() => {
        const principal = parseFloat(remainingAmount) || 0;
        const rate = parseFloat(interestRate) || 0;
        const mInterest = Math.round(principal * (rate / 100) / 12);
        setMonthlyInterest(mInterest.toString());
    }, [remainingAmount, interestRate]);

    useEffect(() => {
        const mInterest = parseFloat(monthlyInterest) || 0;
        if (method === 'PRINCIPAL') {
            const mPrincipal = parseFloat(monthlyPrincipal) || 0;
            setTotalPayment((mPrincipal + mInterest).toString());
        } else {
            const mTotal = parseFloat(totalPayment) || 0;
            const mPrincipal = Math.max(0, mTotal - mInterest);
            setMonthlyPrincipal(mPrincipal.toString());
        }
    }, [monthlyInterest, method]);

    useEffect(() => {
        if (loanType === 'STOCK_PLEDGE') {
            setMonthlyPrincipal('0');
            const mInterest = parseFloat(monthlyInterest) || 0;
            setTotalPayment(mInterest.toString());
        }
    }, [loanType, monthlyInterest]);

    useEffect(() => {
        if (loanType === 'STOCK_PLEDGE' && pledgeStockId) {
            const stock = stocks.find(s => s.id === pledgeStockId);
            if (stock) {
                const isMounting = isNameInit.current;
                const wasPledge = initialData?.loanType === 'STOCK_PLEDGE';
                const shouldPreserve = initialData && isMounting && wasPledge;
                if (!initialData || !shouldPreserve) {
                    setName(`質押${stock.ticker}`);
                }
            }
        }
        isNameInit.current = false;
    }, [pledgeStockId, loanType, stocks, initialData]);

    const handlePrincipalChange = (val: string) => {
        setMonthlyPrincipal(val);
        const mPrincipal = parseFloat(val) || 0;
        const mInterest = parseFloat(monthlyInterest) || 0;
        setTotalPayment((mPrincipal + mInterest).toString());
    };

    const handleTotalChange = (val: string) => {
        setTotalPayment(val);
        const mTotal = parseFloat(val) || 0;
        const mInterest = parseFloat(monthlyInterest) || 0;
        setMonthlyPrincipal(Math.max(0, mTotal - mInterest).toString());
    };

    useEffect(() => {
        if (isFirstRun.current) { isFirstRun.current = false; return; }
        if (!loanDate) return;
        let monthsToAdd = 0;
        if (bank.includes('證金')) { monthsToAdd = 18; }
        else if (bank.includes('證券')) { monthsToAdd = 6; }
        if (monthsToAdd > 0) {
            const startDate = new Date(loanDate);
            if (!isNaN(startDate.getTime())) {
                const targetDate = new Date(startDate);
                targetDate.setMonth(startDate.getMonth() + monthsToAdd);
                const y = targetDate.getFullYear();
                const m = (targetDate.getMonth() + 1).toString().padStart(2, '0');
                const d = targetDate.getDate().toString().padStart(2, '0');
                setMaturityDate(`${y}-${m}-${d}`);
            }
        }
    }, [bank, loanDate]);

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        let collateralValue = 0;
        if (loanType === 'STOCK_PLEDGE' && pledgeStockId) {
            const stock = stocks.find(s => s.id === pledgeStockId);
            const lots = parseFloat(pledgeLots);
            if (stock && stock.currentPrice && !isNaN(lots)) {
                collateralValue = stock.currentPrice * lots * 1000;
            }
        }
        const item: GeneralAssetItem = {
            id: initialData?.id || generateId(),
            name,
            type: 'LIABILITY',
            category,
            value: parseFloat(remainingAmount) || 0,
            originalAmount: parseFloat(originalAmount) || 0,
            interestRate: parseFloat(interestRate) || 0,
            amortizationMethod: method,
            monthlyPrincipal: parseFloat(monthlyPrincipal) || 0,
            monthlyInterest: parseFloat(monthlyInterest) || 0,
            loanDate,
            maturityDate,
            bank,
            loanType: isPledge ? loanType as any : undefined,
            targetStockId: pledgeStockId,
            pledgeLots: parseFloat(pledgeLots) || 0,
            collateralValue
        };
        onSave(item);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh] animate-in fade-in zoom-in-95">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800">{initialData ? '編輯貸款' : '新增貸款'}</h3>
                    <button type="button" onClick={onClose}><X size={20} className="text-slate-400"/></button>
                </div>
                <div className="p-6 space-y-4">
                    {isPledge && (
                        <div className="flex gap-4 mb-4">
                            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={loanType === 'STOCK_PLEDGE'} onChange={() => setLoanType('STOCK_PLEDGE')} className="text-blue-600"/><span className="font-bold text-sm">股票質押</span></label>
                            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={loanType === 'CREDIT'} onChange={() => setLoanType('CREDIT')} className="text-blue-600"/><span className="font-bold text-sm">一般信貸</span></label>
                        </div>
                    )}
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">項目名稱</label><input value={name} onChange={e => setName(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500" required placeholder="Ex: 房屋貸款 A"/></div>
                    <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">原始金額</label><input type="number" value={originalAmount} onChange={e => setOriginalAmount(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500"/></div><div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">目前餘額</label><input type="number" value={remainingAmount} onChange={e => setRemainingAmount(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-bold text-rose-600"/></div></div>
                    {loanType === 'STOCK_PLEDGE' && (
                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 space-y-3">
                            <div className="space-y-1"><label className="text-xs font-bold text-amber-700 uppercase">質押標的 (僅台股)</label><select value={pledgeStockId} onChange={e => setPledgeStockId(e.target.value)} className="w-full p-2.5 border border-amber-200 rounded-lg outline-none bg-white"><option value="">選擇股票</option>{stocks.filter(s => s.market === 'TW').map(s => (<option key={s.id} value={s.id}>{s.ticker} {s.name}</option>))}</select></div>
                            <div className="space-y-1"><label className="text-xs font-bold text-amber-700 uppercase">質押張數 (1張=1000股)</label><input type="number" value={pledgeLots} onChange={e => setPledgeLots(e.target.value)} className="w-full p-2.5 border border-amber-200 rounded-lg outline-none bg-white"/></div>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">年利率 (%)</label><input type="number" step="0.01" value={interestRate} onChange={e => setInterestRate(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500"/></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">還款方式</label><select value={method} onChange={e => setMethod(e.target.value as any)} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none bg-white"><option value="PRINCIPAL">本金攤還 (或還本)</option><option value="PRINCIPAL_INTEREST">本息攤還</option></select></div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">每月還本</label><input type="number" value={monthlyPrincipal} onChange={e => handlePrincipalChange(e.target.value)} disabled={method === 'PRINCIPAL_INTEREST' || loanType === 'STOCK_PLEDGE'} className={`w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500 ${method === 'PRINCIPAL_INTEREST' || loanType === 'STOCK_PLEDGE' ? 'bg-slate-100 text-slate-500' : 'bg-white'}`}/></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">每月利息 (自動)</label><input type="number" value={monthlyInterest} readOnly className="w-full p-2.5 border border-slate-200 rounded-lg outline-none bg-slate-100 text-slate-600 font-bold"/></div>
                        <div className="col-span-2 space-y-1"><label className="text-xs font-bold text-blue-600 uppercase">每月繳款總額 (本+利)</label><input type="number" value={totalPayment} onChange={e => handleTotalChange(e.target.value)} disabled={method === 'PRINCIPAL'} className={`w-full p-2.5 border border-blue-200 rounded-lg outline-none focus:border-blue-500 font-bold text-lg text-blue-700 ${method === 'PRINCIPAL' ? 'bg-blue-50' : 'bg-white'}`}/></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">貸款日</label><input type="date" value={loanDate} onChange={e => setLoanDate(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500"/></div><div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">到期日</label><input type="date" value={maturityDate} onChange={e => setMaturityDate(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500"/></div></div>
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">承貸銀行/機構</label><input value={bank} onChange={e => setBank(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500"/></div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                    <button type="button" onClick={onClose} className="px-6 py-2 text-slate-500 hover:bg-slate-200 rounded-xl font-bold transition-colors">取消</button>
                    <button type="submit" className="px-8 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg active:scale-95 transition-all">儲存</button>
                </div>
            </form>
        </div>
    );
};

// --- GeneralAssetOverview Main Component ---
const GeneralAssetOverview: React.FC<Props> = ({ 
  assets, onUpdateAssets, stockValueTWD, 
  stocks = [], accounts = [], onUpdateAccount, 
  stockTransactions = [], cashTransactions = [], 
  householdTransactions = [],
  onAddCashTx, onUpdateCashTx, onDeleteCashTx,
  onUpdateHouseholdTx, onDeleteHouseholdTx,
  globalExchangeRate = 32.5,
  autoSyncStartDate, onUpdateAutoSyncDate,
  recurringRules = [], onUpdateRecurringRules,
  budgetItems = []
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [loanModalData, setLoanModalData] = useState<{item: GeneralAssetItem | null, category: string}>({ item: null, category: 'MORTGAGE' });
  const [isCashModalOpen, setIsCashModalOpen] = useState(false); 
  const [editingCashTx, setEditingCashTx] = useState<CashTransaction | null>(null);
  const [preselectedAccountId, setPreselectedAccountId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // New: Editing flag for Household vs Investment
  const [editingTxIsHousehold, setEditingTxIsHousehold] = useState(false);

  // Recurring Rule State
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringCashRule | undefined>(undefined);
  const [recurringRuleAccountId, setRecurringRuleAccountId] = useState<string>('');
  
  // NEW: State for controlling the visibility of the Recurring Rules table
  const [isRecurringExpanded, setIsRecurringExpanded] = useState(true);
  const [isPendingExpanded, setIsPendingExpanded] = useState(true);
  const [showVirtualAccounts, setShowVirtualAccounts] = useState(false);

  // --- Cash Filter State ---
  const [cashFilterType, setCashFilterType] = useState<'MONTH' | 'YEAR' | 'CUSTOM'>('MONTH');
  const [cashFilterDate, setCashFilterDate] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [cashFilterYear, setCashFilterYear] = useState(new Date().getFullYear().toString());
  const [cashCustomStart, setCashCustomStart] = useState(new Date().toISOString().slice(0, 8) + '01');
  const [cashCustomEnd, setCashCustomEnd] = useState(new Date().toISOString().split('T')[0]);

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Sync System Assets
  useEffect(() => {
     let newAssets = [...assets];
     let changed = false;
     
     const stockItem = newAssets.find(a => a.category === 'STOCK_PORTFOLIO');
     if (!stockItem) {
        newAssets.push({ id: 'SYSTEM_STOCK_PORTFOLIO', name: '股票投資組合', type: 'ASSET', category: 'STOCK_PORTFOLIO', value: stockValueTWD, isLinked: true, note: '系統自動計算' });
        changed = true;
     } else if (stockItem.value !== stockValueTWD) {
        newAssets = newAssets.map(a => a.id === 'SYSTEM_STOCK_PORTFOLIO' ? { ...a, value: stockValueTWD } : a);
        changed = true;
     }

     if (changed) { onUpdateAssets(newAssets); }
  }, [stockValueTWD, accounts]); 

  // ... (handleUpdateItem, handleDeleteItem, handleAddItem, handleEditLoan remain same) ...
  const handleUpdateItem = (id: string, updates: Partial<GeneralAssetItem>) => {
    if (id.startsWith('linked_')) {
        if (updates.value !== undefined) {
             const originalItem = linkedCashAccounts.find(a => a.id === id);
             if (originalItem) {
                 const diff = updates.value - originalItem.value;
                 if (diff !== 0 && onAddCashTx) {
                     const realAccountId = id.replace('linked_', '');
                     const tx: CashTransaction = { id: generateId(), accountId: realAccountId, date: new Date().toISOString().split('T')[0], type: diff > 0 ? 'DEPOSIT' : 'WITHDRAWAL', amount: Math.abs(diff), currency: 'TWD', category: '餘額調整', note: '手動修正餘額' };
                     onAddCashTx(tx);
                 }
             }
        }
        return;
    }
    onUpdateAssets(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleDeleteItem = (id: string) => {
    if (id.startsWith('linked_')) {
       if (onUpdateAccount && accounts) {
          const realAccountId = id.replace('linked_', '');
          const account = accounts.find(a => a.id === realAccountId);
          if (account) onUpdateAccount({ ...account, isCash: false });
       }
       return;
    }
    onUpdateAssets(prev => prev.filter(item => item.id !== id));
  };

  const handleAddItem = (category: string, type: GeneralAssetType) => {
     if (type === 'LIABILITY') {
        setLoanModalData({ item: null, category });
        setIsLoanModalOpen(true);
        return;
     }
     const newItem: GeneralAssetItem = { id: generateId(), name: '新資產', type, category, value: 0 };
     onUpdateAssets(prev => [...prev, newItem]);
     setEditingId(newItem.id);
  };

  const handleEditLoan = (item?: GeneralAssetItem, cat: string = 'MORTGAGE') => {
      setLoanModalData({ item: item || null, category: cat });
      setIsLoanModalOpen(true);
  };

  const handleSaveCashTransaction = (data: any) => {
    if (data.id) {
        // Edit Mode
        const baseTx = editingCashTx || {};
        const updatedTx: CashTransaction = { 
            ...baseTx,
            id: data.id, 
            accountId: data.accountId, 
            date: data.date, 
            type: data.type === 'EXPENSE' ? 'WITHDRAWAL' : 'DEPOSIT', 
            amount: parseFloat(data.amount), 
            currency: 'TWD', 
            category: data.category, 
            note: data.note,
            isCreditCardPayment: data.isCreditCardPayment,
            budgetId: data.budgetId
        } as CashTransaction;

        if (editingTxIsHousehold && onUpdateHouseholdTx) {
            onUpdateHouseholdTx(updatedTx);
        } else if (onUpdateCashTx) {
            onUpdateCashTx(updatedTx);
        }
        setIsCashModalOpen(false); setEditingCashTx(null); setEditingTxIsHousehold(false);
        return;
    }

    // Add Mode (Defaults to Investment Cash unless logic changes, but General Asset Overview mainly deals with Assets)
    if (data.type === 'TRANSFER') {
       // Generate a unique ID to link these two transactions for deletion later
       const transferLinkId = `manual_transfer_${generateId()}`;
       const txOut: CashTransaction = { id: generateId(), date: data.date, accountId: data.fromAccountId, type: 'WITHDRAWAL', amount: parseFloat(data.amount), currency: 'TWD', note: `轉帳至 ${data.toAccountName}`, category: '轉帳', sourceTransactionId: transferLinkId };
       const txIn: CashTransaction = { id: generateId(), date: data.date, accountId: data.toAccountId, type: 'DEPOSIT', amount: parseFloat(data.amount), currency: 'TWD', note: `來自 ${data.fromAccountName} 的轉帳`, category: '轉帳', sourceTransactionId: transferLinkId };
       onAddCashTx?.(txOut); onAddCashTx?.(txIn);
    } else {
       const tx: CashTransaction = { id: generateId(), date: data.date, accountId: data.accountId, type: data.type === 'EXPENSE' ? 'WITHDRAWAL' : 'DEPOSIT', amount: parseFloat(data.amount), currency: 'TWD', category: data.category, note: data.note, isCreditCardPayment: data.isCreditCardPayment, budgetId: data.budgetId };
       onAddCashTx?.(tx);
    }
    setIsCashModalOpen(false);
  };

  const handleSmartDeleteCashTx = (id: string) => {
      // Check if it is a household transaction (and not in cashTransactions list)
      const isHouse = householdTransactions?.some(h => h.id === id) && !cashTransactions?.some(c => c.id === id);

      if (isHouse && onDeleteHouseholdTx) {
          onDeleteHouseholdTx(id);
          // Sync deletion logic for household handles self-contained transfers if implemented in App.tsx
          return;
      }

      if (!onDeleteCashTx) return;
      
      const tx = cashTransactions?.find(t => t.id === id);
      
      // Always delete the selected one
      onDeleteCashTx(id);

      if (tx && tx.sourceTransactionId) {
          // Case 1: Manual Transfer (New style with manual_transfer_ ID)
          if (tx.sourceTransactionId.startsWith('manual_transfer_')) {
              const partner = cashTransactions?.find(t => t.sourceTransactionId === tx.sourceTransactionId && t.id !== id);
              if (partner) onDeleteCashTx(partner.id);
          }
          // Case 2: Auto Recurring Transfer (auto_rec_... and auto_rec_..._IN)
          else if (tx.sourceTransactionId.startsWith('auto_rec')) {
              const baseId = tx.sourceTransactionId.endsWith('_IN') 
                  ? tx.sourceTransactionId.slice(0, -3) 
                  : tx.sourceTransactionId;
              
              const partnerId = tx.sourceTransactionId.endsWith('_IN') ? baseId : `${baseId}_IN`;
              const partner = cashTransactions?.find(t => t.sourceTransactionId === partnerId);
              
              if (partner) onDeleteCashTx(partner.id);
          }
      }
  };

  const handleOpenCashEdit = (tx: CashTransaction) => { 
      const isHouse = householdTransactions?.some(h => h.id === tx.id) && !cashTransactions?.some(c => c.id === tx.id);
      setEditingTxIsHousehold(!!isHouse);
      setEditingCashTx(tx); 
      setIsCashModalOpen(true); 
  };

  // --- Calculate Date Range for Filter ---
  const dateRange = useMemo(() => {
      let start = '', end = '';
      if (cashFilterType === 'MONTH') {
          start = `${cashFilterDate}-01`;
          const [y, m] = cashFilterDate.split('-').map(Number);
          const lastDay = new Date(y, m, 0).getDate();
          end = `${cashFilterDate}-${lastDay.toString().padStart(2, '0')}`;
      } else if (cashFilterType === 'YEAR') {
          start = `${cashFilterYear}-01-01`;
          end = `${cashFilterYear}-12-31`;
      } else {
          start = cashCustomStart;
          end = cashCustomEnd;
      }
      return { start, end };
  }, [cashFilterType, cashFilterDate, cashFilterYear, cashCustomStart, cashCustomEnd]);

  // --- Combined Transactions for Real-time Sync ---
  const allTransactions = useMemo(() => {
      const cashTxs = cashTransactions || [];
      const houseTxs = householdTransactions || [];
      
      const cashIds = new Set(cashTxs.map(t => t.id));
      // Safely filter undefined sourceTransactionId
      const cashSourceIds = new Set(cashTxs.map(t => t.sourceTransactionId).filter((id): id is string => !!id));

      // Filter Household transactions to exclude those that are duplicates/synced from Investment Cash
      // This prevents double counting in the General Asset Overview
      const uniqueHouseTxs = houseTxs.filter(htx => {
          // 1. If this household tx is a sync copy OF an investment cash tx (sourceID points to a cashTx ID)
          if (htx.sourceTransactionId && cashIds.has(htx.sourceTransactionId)) return false;
          
          // 2. If this household tx shares the same origin as an investment cash tx (e.g. both generated from a Stock Tx)
          if (htx.sourceTransactionId && cashSourceIds.has(htx.sourceTransactionId)) return false;
          
          return true;
      });

      return [...cashTxs, ...uniqueHouseTxs];
  }, [cashTransactions, householdTransactions]);

  // --- Filter Transactions for Stats (Income/Expense in Period) ---
  const filteredPeriodTxs = useMemo(() => {
      return allTransactions.filter(tx => 
        tx.date >= dateRange.start && 
        tx.date <= dateRange.end &&
        tx.date <= todayStr
      );
  }, [allTransactions, dateRange, todayStr]);

  const periodAccountStats = useMemo(() => {
      const stats = new Map<string, { income: number, expense: number, transferNet: number }>();
      
      filteredPeriodTxs.forEach(tx => {
          if (!stats.has(tx.accountId)) stats.set(tx.accountId, { income: 0, expense: 0, transferNet: 0 });
          const curr = stats.get(tx.accountId)!;
          
          const isTransfer = tx.category === '轉帳' || !!tx.fromAccountId || !!tx.toAccountId;

          if (tx.type === 'DEPOSIT' || tx.type === 'INTEREST' || (tx.type as any) === 'INCOME') {
              if (isTransfer) curr.transferNet += tx.amount;
              else curr.income += tx.amount;
          } else {
              if (isTransfer) curr.transferNet -= tx.amount;
              else curr.expense += tx.amount;
          }
      });
      return stats;
  }, [filteredPeriodTxs]);

  // --- Calculate Balance at End of Period (Snapshot) ---
  const effectiveBalances = useMemo(() => {
     const balances = new Map<string, number>();
     allTransactions.forEach(tx => {
        // Only sum if accountId looks like a UUID (valid real account)
        const isRealAccount = /^[a-z0-9]{7}$/.test(tx.accountId);
        if (!isRealAccount) return;

        const cutoffDate = dateRange.end < todayStr ? dateRange.end : todayStr;
        if (tx.date > cutoffDate) return; 

        const curr = balances.get(tx.accountId) || 0;
        if (tx.type === 'DEPOSIT' || tx.type === 'INTEREST' || (tx.type as any) === 'INCOME') { 
            balances.set(tx.accountId, curr + tx.amount); 
        } else { 
            balances.set(tx.accountId, curr - tx.amount); 
        }
     });
     return balances;
  }, [allTransactions, dateRange.end, todayStr]);

  // --- New Logic: Calculate Projected Balances based on ALL Pending Transactions ---
  const allPendingTransactions = useMemo(() => {
      const cashTxs = cashTransactions || [];
      const houseTxs = householdTransactions || [];
      
      const cashIds = new Set(cashTxs.map(t => t.id));
      const cashSourceIds = new Set(cashTxs.map(t => t.sourceTransactionId).filter((id): id is string => !!id));

      const uniqueHouseTxs = houseTxs.filter(htx => {
          if (htx.sourceTransactionId && cashIds.has(htx.sourceTransactionId)) return false;
          if (htx.sourceTransactionId && cashSourceIds.has(htx.sourceTransactionId)) return false;
          return true;
      });

      // Filter for future transactions ONLY
      return [...cashTxs, ...uniqueHouseTxs].filter(tx => tx.date > todayStr);
  }, [cashTransactions, householdTransactions, todayStr]);

  const projectedBalancesWithoutDiv = useMemo(() => {
      const balances = new Map<string, number>(effectiveBalances);
      allPendingTransactions.forEach(tx => {
          const isRealAccount = /^[a-z0-9]{7}$/.test(tx.accountId);
          if (!isRealAccount) return;
          const isDividend = tx.type === 'DEPOSIT' && (tx.category?.startsWith('領息') || tx.sourceTransactionId?.includes('_dividend_'));
          if (isDividend) return;
          const curr = balances.get(tx.accountId) || 0;
          if (tx.type === 'DEPOSIT' || tx.type === 'INTEREST' || (tx.type as any) === 'INCOME') {
              balances.set(tx.accountId, curr + tx.amount);
          } else {
              balances.set(tx.accountId, curr - tx.amount);
          }
      });
      return balances;
  }, [effectiveBalances, allPendingTransactions]);

  const pendingDividends = useMemo(() => {
      const divs = new Map<string, number>();
      allPendingTransactions.forEach(tx => {
          const isRealAccount = /^[a-z0-9]{7}$/.test(tx.accountId);
          if (!isRealAccount) return;
          const isDividend = tx.type === 'DEPOSIT' && (tx.category?.startsWith('領息') || tx.sourceTransactionId?.includes('_dividend_'));
          if (isDividend) {
              const curr = divs.get(tx.accountId) || 0;
              divs.set(tx.accountId, curr + tx.amount);
          }
      });
      return divs;
  }, [allPendingTransactions]);

  const projectedBalances = useMemo(() => {
      // Start with current effective balances
      const balances = new Map<string, number>(effectiveBalances);
      
      allPendingTransactions.forEach(tx => {
          // Check if accountId is a real system account (UUID format)
          const isRealAccount = /^[a-z0-9]{7}$/.test(tx.accountId);
          if (!isRealAccount) return;

          const curr = balances.get(tx.accountId) || 0;
          
          // Apply pending transaction impact
          if (tx.type === 'DEPOSIT' || tx.type === 'INTEREST' || (tx.type as any) === 'INCOME') {
              balances.set(tx.accountId, curr + tx.amount);
          } else {
              balances.set(tx.accountId, curr - tx.amount);
          }
      });
      return balances;
  }, [effectiveBalances, allPendingTransactions]);

  const linkedCashAccounts: GeneralAssetItem[] = useMemo(() => {
      return (accounts || [])
        .filter(a => (a.isCash || a.isSecurities)) 
        .filter(a => {
            // Check if this account has a non-zero balance (current or projected)
            const balance = effectiveBalances.get(a.id) || 0;
            const projected = projectedBalances.get(a.id) || 0;
            if (balance !== 0 || projected !== 0) return true;

            // Check if there's any transaction activity in the filtered period
            const stats = periodAccountStats.get(a.id);
            if (stats && (stats.income !== 0 || stats.expense !== 0 || stats.transferNet !== 0)) return true;

            // Otherwise, hide it to keep the overview clean
            return false;
        })
        .map(a => ({
           id: `linked_${a.id}`,
           name: a.name,
           category: 'CASH',
           type: 'ASSET',
           value: effectiveBalances.get(a.id) || 0,
           projectedValue: projectedBalances.get(a.id) || 0,
           projectedWithoutDiv: projectedBalancesWithoutDiv.get(a.id) || 0,
           pendingDiv: pendingDividends.get(a.id) || 0,
           isLinked: true,
           isExcluded: a.excludeFromTotals
        }));
  }, [accounts, effectiveBalances, projectedBalances, projectedBalancesWithoutDiv, pendingDividends, periodAccountStats]);

  // Handle Recurring Rule
  const handleOpenRecurringModal = (item: GeneralAssetItem) => {
      const realAccountId = item.id.replace('linked_', '');
      setEditingRule(undefined);
      setRecurringRuleAccountId(realAccountId);
      setIsRecurringModalOpen(true);
  };

  const handleEditRecurringRule = (rule: RecurringCashRule) => {
      setEditingRule(rule);
      setRecurringRuleAccountId(rule.accountId);
      setIsRecurringModalOpen(true);
  };

  const handleSaveRecurringRule = (rule: RecurringCashRule) => {
      if (!onUpdateRecurringRules || !recurringRules) return;
      // 依據 ID 過濾，而非 AccountID，這樣同一個帳戶可以存多筆規則
      const newRules = recurringRules.filter(r => r.id !== rule.id);
      newRules.push(rule);
      onUpdateRecurringRules(newRules);
  };

  const handleDeleteRecurringRule = (id: string) => {
      if (!onUpdateRecurringRules || !recurringRules) return;
      // Direct execution without confirmation, ensuring filter is correct
      const updatedRules = recurringRules.filter(r => r.id !== id);
      onUpdateRecurringRules(updatedRules);
  };

  const getAccountName = (id: string) => accounts?.find(a => a.id === id)?.name || id;

  // Pending Transactions List (Using allPendingTransactions to include household)
  const pendingTransactions = useMemo(() => {
    let filtered = allPendingTransactions;
    if (!showVirtualAccounts) {
        filtered = filtered.filter(tx => {
            const accName = getAccountName(tx.accountId);
            return !accName.includes('模擬帳戶');
        });
    }
    // Reuse the already calculated list but ensure it's sorted for display
    return filtered.sort((a, b) => a.date.localeCompare(b.date));
  }, [allPendingTransactions, showVirtualAccounts, accounts]);

  const renderCardStats = (item: GeneralAssetItem) => {
      if (!item.isLinked) return null;
      const accountId = item.id.replace('linked_', '');
      const stats = periodAccountStats.get(accountId);
      
      const income = stats?.income || 0;
      const expense = stats?.expense || 0;
      const transfer = stats?.transferNet || 0;

      const hasRecurring = recurringRules?.some(r => r.accountId === accountId && r.enabled);
      
      // Warning Check: Is Projected Balance Negative?
      const projected = projectedBalancesWithoutDiv.get(accountId) ?? 0;
      const isDanger = projected < 0;

      // NEW: Calculate Pending Stats for this specific account
      const accountPending = allPendingTransactions.filter(t => t.accountId === accountId);
      const pendingDiv = accountPending
        .filter(t => t.type === 'DEPOSIT' && (t.category?.startsWith('領息') || t.sourceTransactionId?.includes('_dividend_')))
        .reduce((sum, t) => sum + t.amount, 0);
      const pendingInc = accountPending
        .filter(t => (t.type === 'DEPOSIT' || t.type === 'INTEREST' || (t.type as any) === 'INCOME') && !(t.type === 'DEPOSIT' && (t.category?.startsWith('領息') || t.sourceTransactionId?.includes('_dividend_'))))
        .reduce((sum, t) => sum + t.amount, 0);
      const pendingExp = accountPending
        .filter(t => t.type === 'WITHDRAWAL')
        .reduce((sum, t) => sum + t.amount, 0);

      return (
          <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t border-slate-50 relative">
             {hasRecurring && (
                 <div className="absolute -top-1 right-0">
                     <span className="text-[9px] bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded font-bold border border-indigo-100 flex items-center gap-0.5">
                         <Clock size={8} /> 固定排程
                     </span>
                 </div>
             )}
             <div>
                <span className="text-[10px] text-slate-400 block mb-0.5">收入</span>
                <span className="text-xs font-bold text-emerald-600 font-mono">+{income.toLocaleString()}</span>
             </div>
             <div>
                <span className="text-[10px] text-slate-400 block mb-0.5">支出</span>
                <span className="text-xs font-bold text-rose-500 font-mono">-{expense.toLocaleString()}</span>
             </div>
             <div>
                <span className="text-[10px] text-slate-400 block mb-0.5">轉帳</span>
                <span className={`text-xs font-bold font-mono ${transfer === 0 ? 'text-slate-400' : transfer > 0 ? 'text-blue-600' : 'text-slate-600'}`}>
                    {transfer > 0 ? '+' : ''}{transfer.toLocaleString()}
                </span>
             </div>

             {/* NEW: Pending Info Display */}
             {(pendingInc > 0 || pendingExp > 0 || pendingDiv > 0) && (
                <div className="col-span-3 mt-1.5 pt-1.5 border-t border-dashed border-slate-100 flex flex-col gap-1">
                    {(pendingInc > 0 || pendingExp > 0) && (
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1">
                                <Hourglass size={8}/> 未來預約
                            </span>
                            <div className="flex gap-2 text-[10px] font-mono font-bold">
                                {pendingInc > 0 && <span className="text-emerald-600">+{pendingInc.toLocaleString()}</span>}
                                {pendingExp > 0 && <span className="text-rose-500">-{pendingExp.toLocaleString()}</span>}
                            </div>
                        </div>
                    )}
                    {pendingDiv > 0 && (
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                                <Coins size={8}/> 未來配息
                            </span>
                            <div className="flex gap-2 text-[10px] font-mono font-bold">
                                <span className="text-emerald-600">+{pendingDiv.toLocaleString()}</span>
                            </div>
                        </div>
                    )}
                </div>
             )}
             
             {/* Insufficient Balance Warning */}
             {isDanger && (
                <div className="col-span-3 mt-2 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-center gap-2 animate-pulse">
                    <AlertCircle size={14} className="text-rose-600 shrink-0" />
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-rose-600">警示: 未來餘額不足</span>
                        <span className="text-[10px] text-rose-500 font-mono">預估: {projected.toLocaleString()}</span>
                    </div>
                </div>
             )}
          </div>
      );
  };

  const renderCashHistory = (item: GeneralAssetItem) => {
     if (!item.isLinked) return null;
     const accountId = item.id.replace('linked_', '');
     
     const history = filteredPeriodTxs
        .filter(t => t.accountId === accountId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

     if (history.length === 0) {
        return <div className="text-center text-slate-400 text-xs py-4 italic bg-slate-50/50 rounded-lg">此區間尚無交易紀錄 (或交割日未到)</div>;
     }

     return (
        <div className="overflow-x-auto overflow-y-auto max-h-[135px] custom-scrollbar pr-2">
           <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                 <tr className="text-slate-400 border-b border-slate-200">
                    <th className="py-2 pl-2">日期</th>
                    <th className="py-2">類別</th>
                    <th className="py-2 text-right">金額</th>
                    <th className="py-2 text-right pr-2">操作</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                 {history.map(tx => {
                    // 30-Day Lock Logic
                    const txDateObj = new Date(tx.date);
                    const limitDate = new Date();
                    limitDate.setDate(limitDate.getDate() - 30);
                    limitDate.setHours(0, 0, 0, 0); 
                    txDateObj.setHours(0, 0, 0, 0);
                    const isLocked = txDateObj < limitDate;

                    return (
                    <tr key={tx.id} className="hover:bg-blue-50/50 transition-colors group">
                       <td className="py-2 pl-2 font-mono text-slate-600">{tx.date}</td>
                       <td className="py-2 text-slate-500 truncate max-w-[80px]" title={tx.note}>
                          {tx.category || (tx.type === 'DEPOSIT' ? '收入' : '支出')}
                       </td>
                       <td className={`py-2 text-right font-mono font-bold ${tx.type === 'DEPOSIT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {tx.type === 'DEPOSIT' ? '+' : '-'}{tx.amount.toLocaleString()}
                       </td>
                       <td className="py-2 text-right pr-2">
                          {(!tx.sourceTransactionId || (tx.sourceTransactionId && (tx.sourceTransactionId.startsWith('auto_rec') || tx.sourceTransactionId.startsWith('manual_transfer_')))) ? (
                             isLocked ? (
                                <div className="flex justify-end gap-1 text-slate-300">
                                    <Lock size={12} />
                                </div>
                             ) : (
                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity items-center">
                                    {!tx.sourceTransactionId?.startsWith('auto_rec') && (
                                        <button onClick={() => handleOpenCashEdit(tx)} className="p-1 text-slate-400 hover:text-blue-600 rounded"><Edit2 size={12}/></button>
                                    )}
                                    <button onClick={() => handleSmartDeleteCashTx(tx.id)} className="p-1 text-slate-400 hover:text-rose-600 rounded"><Trash2 size={12}/></button>
                                    {tx.sourceTransactionId && tx.sourceTransactionId.startsWith('auto_rec') && (
                                        <span className="text-[10px] text-indigo-400 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100 ml-1 whitespace-nowrap">定期</span>
                                    )}
                                </div>
                             )
                          ) : (
                             <span className="text-[9px] text-slate-400 italic pr-2">自動</span>
                          )}
                       </td>
                    </tr>
                 )})}
              </tbody>
           </table>
         </div>
     );
  };

  const formatCurrencySimple = (val: number | undefined) => {
      if (val === undefined) return '-';
      return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(val);
  };

  const assetStock = useMemo(() => assets.filter(a => a.type === 'ASSET' && a.category === 'STOCK_PORTFOLIO'), [assets]);
  const assetRealEstate = useMemo(() => assets.filter(a => a.type === 'ASSET' && a.category === 'REAL_ESTATE'), [assets]);
  const assetOther = useMemo(() => assets.filter(a => a.type === 'ASSET' && a.category === 'OTHER'), [assets]);
  const assetCashManual = useMemo(() => assets.filter(a => a.type === 'ASSET' && a.category === 'CASH'), [assets]);
  const assetCash = useMemo(() => [...assetCashManual, ...linkedCashAccounts], [assetCashManual, linkedCashAccounts]);

  const liabilityMortgage = useMemo(() => assets.filter(a => a.type === 'LIABILITY' && a.category === 'MORTGAGE'), [assets]);
  const liabilityPledge = useMemo(() => assets.filter(a => a.type === 'LIABILITY' && a.category === 'PLEDGE'), [assets]);
  const liabilityLoan = useMemo(() => assets.filter(a => a.type === 'LIABILITY' && (a.category === 'LOAN' || a.category === 'CREDIT')), [assets]);

  const totalAssets = useMemo(() => {
      const stock = assetStock.reduce((s, i) => s + (i.isExcluded ? 0 : i.value), 0);
      const real = assetRealEstate.reduce((s, i) => s + (i.isExcluded ? 0 : i.value), 0);
      const other = assetOther.reduce((s, i) => s + (i.isExcluded ? 0 : i.value), 0);
      const cash = assetCash.reduce((s, i) => s + (i.isExcluded ? 0 : i.value), 0);
      return stock + real + other + cash;
  }, [assetStock, assetRealEstate, assetOther, assetCash]);

  const totalLiabilities = useMemo(() => {
      const mort = liabilityMortgage.reduce((s, i) => s + (i.isExcluded ? 0 : i.value), 0);
      const pledge = liabilityPledge.reduce((s, i) => s + (i.isExcluded ? 0 : i.value), 0);
      const loan = liabilityLoan.reduce((s, i) => s + (i.isExcluded ? 0 : i.value), 0);
      return mort + pledge + loan;
  }, [liabilityMortgage, liabilityPledge, liabilityLoan]);

  const netWorthValue = totalAssets - totalLiabilities;

  const allocationData = useMemo(() => {
      const stock = assetStock.reduce((s, i) => s + (i.isExcluded ? 0 : i.value), 0);
      const real = assetRealEstate.reduce((s, i) => s + (i.isExcluded ? 0 : i.value), 0);
      const other = assetOther.reduce((s, i) => s + (i.isExcluded ? 0 : i.value), 0);
      const cash = assetCash.reduce((s, i) => s + (i.isExcluded ? 0 : i.value), 0);
      
      const data = [];
      if (stock > 0) data.push({ name: '股票', value: stock, color: '#3b82f6' });
      if (real > 0) data.push({ name: '房產', value: real, color: '#f59e0b' });
      if (cash > 0) data.push({ name: '現金', value: cash, color: '#10b981' });
      if (other > 0) data.push({ name: '其他', value: other, color: '#8b5cf6' });
      
      return data.sort((a, b) => b.value - a.value);
  }, [assetStock, assetRealEstate, assetOther, assetCash]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
       {/* Top Summary Cards */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white opacity-10 rounded-full"></div>
              <p className="text-blue-100 font-bold mb-1 text-sm">總資產 (Total Assets)</p>
              <h3 className="text-2xl font-bold font-mono">{formatCurrencySimple(totalAssets)}</h3>
          </div>
          <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white opacity-10 rounded-full"></div>
              <p className="text-rose-100 font-bold mb-1 text-sm">總負債 (Total Liabilities)</p>
              <h3 className="text-2xl font-bold font-mono">{formatCurrencySimple(totalLiabilities)}</h3>
          </div>
          <div className={`rounded-2xl p-5 text-white shadow-lg relative overflow-hidden ${netWorthValue >= 0 ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' : 'bg-gradient-to-br from-slate-600 to-slate-700'}`}>
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-white opacity-10 rounded-full"></div>
              <p className="text-emerald-100 font-bold mb-1 text-sm">淨資產 (Net Worth)</p>
              <h3 className="text-2xl font-bold font-mono">{formatCurrencySimple(netWorthValue)}</h3>
          </div>
       </div>

       {allocationData.length > 0 && (
           <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
               <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3 text-sm">
                   <PieChartIcon size={18} className="text-blue-600"/> 資產配置分析
               </h3>
               <div className="flex flex-col md:flex-row items-center gap-4 h-[180px]">
                   <div className="w-full md:w-1/2 h-full">
                       <ResponsiveContainer width="100%" height="100%">
                           <RePieChart>
                               <Pie
                                   data={allocationData}
                                   cx="50%"
                                   cy="50%"
                                   innerRadius={40}
                                   outerRadius={60}
                                   paddingAngle={5}
                                   dataKey="value"
                               >
                                   {allocationData.map((entry, index) => (
                                       <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                                   ))}
                               </Pie>
                               <ReTooltip 
                                   formatter={(val: number) => formatCurrencySimple(val)}
                                   contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                               />
                           </RePieChart>
                       </ResponsiveContainer>
                   </div>
                   <div className="w-full md:w-1/2 flex flex-col gap-1.5 overflow-y-auto max-h-full pr-1 custom-scrollbar">
                       {allocationData.map((item, idx) => (
                           <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                               <div className="flex items-center gap-2">
                                   <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                                   <span className="font-bold text-slate-700 truncate max-w-[100px]">{item.name}</span>
                               </div>
                               <div className="text-right">
                                   <div className="font-mono font-bold text-slate-800">
                                       {formatCurrencySimple(item.value)}
                                   </div>
                                   <div className="text-[10px] text-slate-500 font-bold">
                                       {totalAssets > 0 ? ((item.value / totalAssets) * 100).toFixed(1) : '0.0'}%
                                   </div>
                               </div>
                           </div>
                       ))}
                   </div>
               </div>
           </div>
       )}

       {/* 1. 固定與其他資產 */}
       <div className="flex flex-col gap-2">
          <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm"><Home className="text-emerald-500" size={18}/> 固定與其他資產</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <AssetSection 
                title="股票投資組合" icon={TrendingUp} category="STOCK_PORTFOLIO" type="ASSET" 
                items={assetStock} colorClass="bg-blue-500" 
                editingId={editingId} setEditingId={setEditingId} onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem} onAddItem={handleAddItem}
                hideAddButton={true}
             />
             <AssetSection 
                title="房地產" icon={Home} category="REAL_ESTATE" type="ASSET" 
                items={assetRealEstate} colorClass="bg-amber-500" 
                editingId={editingId} setEditingId={setEditingId} onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem} onAddItem={handleAddItem}
             />
             <AssetSection 
                title="其他資產 (保險/車輛/珠寶)" icon={Shield} category="OTHER" type="ASSET" 
                items={assetOther} colorClass="bg-purple-500" 
                editingId={editingId} setEditingId={setEditingId} onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem} onAddItem={handleAddItem}
             />
          </div>
       </div>

       {/* 2. 負債與貸款 */}
       <div className="flex flex-col gap-2">
          <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm"><Home className="text-amber-500" size={18}/> 負債與貸款</h3>
          <div className="space-y-4">
             <LoanTable 
                category="MORTGAGE" 
                items={liabilityMortgage} 
                onEdit={(item) => handleEditLoan(item, 'MORTGAGE')} 
                onDelete={handleDeleteItem} 
                onAdd={() => handleEditLoan(undefined, 'MORTGAGE')} 
             />
             <LoanTable 
                category="PLEDGE" 
                items={[...liabilityPledge, ...liabilityLoan]} 
                onEdit={(item) => handleEditLoan(item, item?.category || 'PLEDGE')} 
                onDelete={handleDeleteItem} 
                onAdd={() => handleEditLoan(undefined, 'PLEDGE')} 
             />
          </div>
       </div>

       {/* 3. 現金與存款 */}
       <div className="flex flex-col gap-2">
          <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm"><Banknote className="text-emerald-500" size={18}/> 流動資產 (現金與存款)</h3>
          <AssetSection 
             title="現金與存款 (Cash & Deposits)" icon={Banknote} category="CASH" type="ASSET" 
             items={assetCash} colorClass="bg-emerald-500" 
             editingId={editingId} setEditingId={setEditingId} onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem} onAddItem={handleAddItem}
             hideAddButton={true}
             renderExpandedContent={renderCashHistory}
             renderCardStats={renderCardStats}
             viewMode="card"
             renderCardAction={(item: GeneralAssetItem) => (
                 item.isLinked ? (
                    <div className="flex gap-1">
                        <button 
                            onClick={() => handleOpenRecurringModal(item)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all border border-transparent hover:border-indigo-100"
                            title="設定每月固定扣款/轉帳"
                        >
                            <Clock size={12}/>
                            <span>排程</span>
                        </button>
                        <button 
                            onClick={() => {
                                const realAccountId = item.id.replace('linked_', '');
                                setPreselectedAccountId(realAccountId);
                                setEditingCashTx(null);
                                setIsCashModalOpen(true);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-teal-400 to-cyan-400 rounded-lg shadow-sm hover:shadow-md hover:brightness-105 transition-all active:scale-95"
                            title="新增一筆收支紀錄"
                        >
                            <Plus size={12}/>
                            <span>記一筆</span>
                        </button>
                    </div>
                 ) : null
             )}
             headerAction={
                <div className="flex flex-wrap items-center gap-3">
                   {/* ... (Filter Buttons unchanged) ... */}
                   <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
                      <div className="flex bg-white rounded-md shadow-sm border border-slate-200 p-0.5">
                         {(['MONTH', 'YEAR', 'CUSTOM'] as const).map(type => (
                            <button
                               key={type}
                               onClick={(e) => { e.stopPropagation(); setCashFilterType(type); }}
                               className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                                  cashFilterType === type ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                               }`}
                            >
                               {type === 'MONTH' ? '月' : type === 'YEAR' ? '年' : '期間'}
                            </button>
                         ))}
                      </div>
                      
                      {cashFilterType === 'MONTH' && (
                         <input 
                            type="month" 
                            value={cashFilterDate}
                            onClick={e => e.stopPropagation()}
                            onChange={(e) => setCashFilterDate(e.target.value)}
                            className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer hover:bg-white/50 px-1 rounded"
                         />
                      )}
                      {cashFilterType === 'YEAR' && (
                         <select 
                            value={cashFilterYear}
                            onClick={e => e.stopPropagation()}
                            onChange={(e) => setCashFilterYear(e.target.value)}
                            className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer hover:bg-white/50 px-1 rounded appearance-none"
                         >
                            {Array.from({length: 5}, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                               <option key={y} value={y}>{y} 年</option>
                            ))}
                         </select>
                      )}
                      {cashFilterType === 'CUSTOM' && (
                         <div className="flex items-center gap-1 text-xs font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                            <input 
                               type="date" 
                               value={cashCustomStart} 
                               onClick={e => e.stopPropagation()}
                               onChange={(e) => setCashCustomStart(e.target.value)} 
                               className="outline-none bg-transparent w-24"
                            />
                            <span>-</span>
                            <input 
                               type="date" 
                               value={cashCustomEnd} 
                               onClick={e => e.stopPropagation()}
                               onChange={(e) => setCashCustomEnd(e.target.value)} 
                               className="outline-none bg-transparent w-24"
                            />
                         </div>
                      )}
                   </div>

                   <button 
                     onClick={(e) => { e.stopPropagation(); setIsSettingsOpen(!isSettingsOpen); }}
                     className={`p-1.5 rounded-lg transition-all ${isSettingsOpen ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                     title="設定自動記帳起算日"
                   >
                      <Settings size={14} />
                   </button>
                   <button 
                     onClick={(e) => { e.stopPropagation(); setEditingCashTx(null); setIsCashModalOpen(true); }}
                     className="px-3 py-1 bg-white border border-blue-200 text-blue-600 rounded-lg text-xs font-bold shadow-sm hover:bg-blue-50 transition-all flex items-center gap-1.5 active:scale-95"
                   >
                      <Wallet size={14}/> 記一筆
                   </button>
                </div>
             }
          />
          {/* ... (Settings Panel unchanged) ... */}
          {isSettingsOpen && (
             <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex justify-between items-center mb-2">
                   <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Settings size={12} /> 自動記帳設定
                   </h4>
                   <button onClick={() => setIsSettingsOpen(false)}><X size={14} className="text-slate-400 hover:text-slate-600"/></button>
                </div>
                <div className="space-y-2">
                   <p className="text-[10px] text-slate-500">
                      設定「起算日期」後，之後新增的股票買賣/領息紀錄，將自動同步產生現金收支紀錄。
                   </p>
                   <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600">起算日:</span>
                      <input 
                        type="date" 
                        value={autoSyncStartDate || ''} 
                        onChange={(e) => onUpdateAutoSyncDate?.(e.target.value)}
                        className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                      />
                      {autoSyncStartDate && (
                         <button onClick={() => onUpdateAutoSyncDate?.('')} className="text-slate-400 hover:text-rose-500"><X size={14}/></button>
                      )}
                   </div>
                </div>
             </div>
          )}
       </div>

       {/* Recurring Rules Management Table */}
       <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-300">
            <div 
                onClick={() => setIsRecurringExpanded(!isRecurringExpanded)}
                className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white cursor-pointer hover:bg-slate-50 transition-colors select-none"
            >
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg"><Calendar size={18}/></div>
                    <h3 className="font-bold text-slate-800 text-sm">自動記帳排程管理</h3>
                </div>
                <div className="text-slate-400">
                    {isRecurringExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
            </div>
            {isRecurringExpanded && (
                <div className="overflow-x-auto animate-in slide-in-from-top-2">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-400 uppercase font-bold border-b border-slate-100">
                            <tr>
                                <th className="py-3 px-4">狀態</th>
                                <th className="py-3 px-4">執行日</th>
                                <th className="py-3 px-4">來源帳戶</th>
                                <th className="py-3 px-4">類型</th>
                                <th className="py-3 px-4">項目/轉入</th>
                                <th className="py-3 px-4 text-right">金額</th>
                                <th className="py-3 px-4">備註</th>
                                <th className="py-3 px-4 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {recurringRules.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-8 text-center text-slate-400 italic">目前尚無排程規則</td>
                                </tr>
                            ) : (
                                recurringRules.map(rule => {
                                    const acc = accounts.find(a => a.id === rule.accountId);
                                    const isTransfer = rule.type === 'TRANSFER';
                                    const isDeposit = rule.type === 'DEPOSIT';
                                    const toAcc = isTransfer ? accounts.find(a => a.id === rule.toAccountId) : null;

                                    return (
                                        <tr key={rule.id} className={`hover:bg-slate-50 transition-colors ${!rule.enabled ? 'opacity-50 grayscale' : ''}`}>
                                            <td className="py-3 px-4">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${rule.enabled ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                                                    {rule.enabled ? '啟用中' : '已停用'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 font-bold text-slate-700">每月 {rule.dayOfMonth} 號</td>
                                            <td className="py-3 px-4 text-slate-500">{acc?.name || rule.accountId || '未知帳戶'}</td>
                                            <td className="py-3 px-4">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${isTransfer ? 'text-blue-600 bg-blue-50 border-blue-100' : isDeposit ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100'}`}>
                                                    {isTransfer ? '轉帳' : isDeposit ? '入帳' : '扣款'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 font-bold text-slate-600">
                                                {isTransfer ? (
                                                    <div className="flex items-center gap-1 text-blue-600">
                                                        <ArrowRight size={12}/>
                                                        {toAcc?.name || rule.toAccountId || '未知帳戶'}
                                                    </div>
                                                ) : rule.category}
                                            </td>
                                            <td className={`py-3 px-4 text-right font-mono font-bold ${isTransfer ? 'text-blue-600' : isDeposit ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {isDeposit ? '+' : ''}NT$ {rule.amount.toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4 text-slate-400 truncate max-w-[150px]" title={rule.note}>
                                                {rule.note}
                                                {rule.budgetId && <span className="inline-block ml-1 text-[9px] bg-indigo-50 text-indigo-600 px-1 rounded border border-indigo-100">預算連動</span>}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => handleEditRecurringRule(rule)} className="p-1 text-blue-500 hover:bg-blue-100 rounded transition-colors"><Edit2 size={14}/></button>
                                                    <button onClick={() => handleDeleteRecurringRule(rule.id)} className="p-1 text-rose-500 hover:bg-rose-100 rounded transition-colors"><Trash2 size={14}/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}
       </div>

       {/* Pending Transactions List (Future) */}
       <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-300">
            <div 
                onClick={() => setIsPendingExpanded(!isPendingExpanded)}
                className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-amber-50 to-white cursor-pointer hover:bg-amber-50 transition-colors select-none"
            >
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg"><Hourglass size={18}/></div>
                    <h3 className="font-bold text-slate-800 text-sm">尚未出&入&轉帳的清單 (未來預約)</h3>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{pendingTransactions.length}</span>
                </div>
                <div className="flex items-center gap-4 text-slate-400">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setShowVirtualAccounts(!showVirtualAccounts); }}
                        className={`text-xs px-2.5 py-1 rounded-md transition-colors font-medium border ${showVirtualAccounts ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                    >
                        {showVirtualAccounts ? '隱藏模擬帳戶' : '顯示模擬帳戶'}
                    </button>
                    {isPendingExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
            </div>
            {isPendingExpanded && (
                <div className="overflow-x-auto animate-in slide-in-from-top-2">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-400 uppercase font-bold border-b border-slate-100">
                            <tr>
                                <th className="py-3 px-4">預計日期</th>
                                <th className="py-3 px-4">類型</th>
                                <th className="py-3 px-4">帳戶</th>
                                <th className="py-3 px-4">類別</th>
                                <th className="py-3 px-4 text-right">金額</th>
                                <th className="py-3 px-4">備註</th>
                                <th className="py-3 px-4 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {pendingTransactions.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-8 text-center text-slate-400 italic">目前無未來預約交易</td>
                                </tr>
                            ) : (
                                pendingTransactions.map(tx => {
                                    const isTransfer = tx.category === '轉帳' || !!tx.fromAccountId || !!tx.toAccountId;
                                    // Check if this is a Household transaction (exists in household array but not investment array)
                                    const isHousehold = householdTransactions?.some(h => h.id === tx.id) && !cashTransactions?.some(c => c.id === tx.id);
                                    
                                    let typeLabel = '支出';
                                    let typeColor = 'text-rose-600 bg-rose-50';
                                    
                                    if (isTransfer) {
                                        typeLabel = '轉帳';
                                        typeColor = 'text-blue-600 bg-blue-50';
                                    } else if (tx.type === 'DEPOSIT' || (tx.type as any) === 'INCOME' || (tx.type as any) === 'INTEREST') {
                                        typeLabel = '收入';
                                        typeColor = 'text-emerald-600 bg-emerald-50';
                                    }

                                    return (
                                        <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-3 px-4 font-mono font-bold text-slate-600">{tx.date}</td>
                                            <td className="py-3 px-4">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${typeColor}`}>
                                                    {typeLabel}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-slate-600 font-medium">
                                                {getAccountName(tx.accountId)}
                                                {isTransfer && tx.toAccountId && (
                                                    <>
                                                        <span className="text-slate-400 mx-1">→</span>
                                                        {getAccountName(tx.toAccountId)}
                                                    </>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-slate-600 font-medium flex items-center gap-1">
                                                {tx.category} {tx.subCategory ? `> ${tx.subCategory}` : ''}
                                                {isHousehold && (
                                                    <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-100 flex items-center gap-0.5" title="家用記帳預約">
                                                        <ShoppingBag size={8}/> 家用
                                                    </span>
                                                )}
                                            </td>
                                            <td className={`py-3 px-4 text-right font-mono font-bold ${tx.type === 'DEPOSIT' || (tx.type as any) === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {formatCurrencySimple(tx.amount)}
                                            </td>
                                            <td className="py-3 px-4 text-slate-400 truncate max-w-[150px]" title={tx.note}>{tx.note}</td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => handleOpenCashEdit(tx)} className="p-1 text-blue-500 hover:bg-blue-100 rounded transition-colors"><Edit2 size={14}/></button>
                                                    <button onClick={() => handleSmartDeleteCashTx(tx.id)} className="p-1 text-rose-500 hover:bg-rose-100 rounded transition-colors"><Trash2 size={14}/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}
       </div>

       {isLoanModalOpen && (
          <LoanEditModal 
             isOpen={isLoanModalOpen} 
             onClose={() => setIsLoanModalOpen(false)} 
             initialData={loanModalData.item} 
             category={loanModalData.category}
             onSave={(item) => {
                if (loanModalData.item) handleUpdateItem(item.id, item);
                else onUpdateAssets(prev => [...prev, item]);
                setIsLoanModalOpen(false);
             }}
             stocks={stocks}
          />
       )}

        <CashTransactionModal 
           isOpen={isCashModalOpen}
           onClose={() => { setIsCashModalOpen(false); setEditingCashTx(null); setPreselectedAccountId(null); setEditingTxIsHousehold(false); }}
           accounts={accounts ? accounts.filter(a => a.isCash || a.isSecurities) : []} 
           onSave={handleSaveCashTransaction}
           initialData={editingCashTx}
           defaultAccountId={preselectedAccountId}
           isHousehold={editingTxIsHousehold}
           budgetItems={budgetItems} // Pass budgetItems
        />

        <RecurringRuleModal 
            isOpen={isRecurringModalOpen}
            onClose={() => setIsRecurringModalOpen(false)}
            rule={editingRule}
            accountId={recurringRuleAccountId}
            onSave={handleSaveRecurringRule}
            accounts={accounts}
            budgetItems={budgetItems}
        />
    </div>
  );
};

export default React.memo(GeneralAssetOverview);
