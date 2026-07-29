
import React, { useState, useMemo } from 'react';
import { BudgetItem, CashTransaction } from '../types';
import { generateId } from '../utils';
import { Plus, Edit2, Trash2, Calculator, Wallet, DollarSign, PiggyBank, ArrowRight, X, Save, AlertCircle, CheckCircle2, Calendar } from 'lucide-react';

interface Props {
  items: BudgetItem[];
  onUpdateItems: (items: BudgetItem[]) => void;
  transactions?: CashTransaction[]; // New prop for actual data calculation
}

const BudgetOverview: React.FC<Props> = ({ items, onUpdateItems, transactions = [] }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  
  // Form State
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [note, setNote] = useState('');

  const incomeItems = useMemo(() => items.filter(i => i.type === 'INCOME'), [items]);
  const expenseItems = useMemo(() => items.filter(i => i.type === 'EXPENSE'), [items]);

  const totalIncome = useMemo(() => incomeItems.reduce((sum, i) => sum + i.amount, 0), [incomeItems]);
  const totalExpense = useMemo(() => expenseItems.reduce((sum, i) => sum + i.amount, 0), [expenseItems]);
  const netBalance = totalIncome - totalExpense;

  // Calculate Actuals for Selected Month
  const currentMonthStats = useMemo(() => {
      const currentMonthPrefix = selectedMonth;
      const actuals = new Map<string, number>();

      transactions.forEach(tx => {
          if (tx.budgetId && tx.date.startsWith(currentMonthPrefix)) {
              const currentVal = actuals.get(tx.budgetId) || 0;
              // Sum absolute amounts regardless of type logic here, assume linkage is correct
              actuals.set(tx.budgetId, currentVal + tx.amount);
          }
      });
      return actuals;
  }, [transactions, selectedMonth]);

  const handleOpenModal = (item?: BudgetItem, defaultType: 'INCOME' | 'EXPENSE' = 'EXPENSE') => {
    if (item) {
      setEditingId(item.id);
      setName(item.name);
      setAmount(item.amount.toString());
      setType(item.type);
      setNote(item.note || '');
    } else {
      setEditingId(null);
      setName('');
      setAmount('');
      setType(defaultType);
      setNote('');
    }
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    const newItem: BudgetItem = {
      id: editingId || generateId(),
      name,
      amount: parseFloat(amount),
      type,
      note
    };

    if (editingId) {
      onUpdateItems(items.map(i => i.id === editingId ? newItem : i));
    } else {
      onUpdateItems([...items, newItem]);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    onUpdateItems(items.filter(i => i.id !== id));
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('zh-TW', { style: 'decimal', maximumFractionDigits: 0 }).format(val);

  const StatCard = ({ title, value, colorClass, icon: Icon }: any) => (
    <div className={`relative overflow-hidden p-6 rounded-2xl shadow-sm border bg-white flex-1 ${colorClass}`}>
       <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-current opacity-5"></div>
       <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2 opacity-70">
             <Icon size={18} />
             <h3 className="text-sm font-bold uppercase tracking-wider">{title}</h3>
          </div>
          <div className="text-3xl font-black font-mono tracking-tight">
            <span className="text-xs mr-1 align-top opacity-60">NT$</span>
            {formatCurrency(value)}
          </div>
       </div>
    </div>
  );

  const ItemList = ({ title, data, typeColor, headerColor }: { title: string, data: BudgetItem[], typeColor: string, headerColor: string }) => {
    const totalEstimated = data.reduce((acc, c) => acc + c.amount, 0);
    const totalActual = data.reduce((acc, c) => acc + (currentMonthStats.get(c.id) || 0), 0);

    return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden">
        <div className={`px-5 py-3 border-b border-slate-100 flex justify-between items-center ${headerColor}`}>
            <h3 className={`font-bold flex items-center gap-2 ${typeColor}`}>
                {title === '預估收入' ? <TrendingUpIcon size={18}/> : <TrendingDownIcon size={18}/>}
                {title}
            </h3>
            <button 
                onClick={() => handleOpenModal(undefined, title === '預估收入' ? 'INCOME' : 'EXPENSE')}
                className={`p-1.5 rounded-lg hover:bg-white/50 transition-colors ${typeColor}`}
            >
                <Plus size={18} />
            </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar min-h-[300px]">
            {data.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                    <div className="p-3 bg-slate-50 rounded-full"><Edit2 size={20} className="opacity-20"/></div>
                    <span className="text-xs font-medium">尚無項目</span>
                </div>
            ) : (
                data.map(item => {
                    const actual = currentMonthStats.get(item.id) || 0;
                    const percent = item.amount > 0 ? (actual / item.amount) * 100 : 0;
                    const isIncome = item.type === 'INCOME';
                    
                    // Status Check
                    let statusColor = 'bg-slate-200';
                    let statusText = '';
                    let alertIcon = null;

                    if (isIncome) {
                        if (actual >= item.amount) {
                            statusColor = 'bg-emerald-500';
                            statusText = 'text-emerald-600';
                            alertIcon = <CheckCircle2 size={12} className="text-emerald-500"/>;
                        } else {
                            statusColor = 'bg-emerald-200';
                        }
                    } else {
                        // Expense
                        if (actual > item.amount) {
                            statusColor = 'bg-rose-500';
                            statusText = 'text-rose-600';
                            alertIcon = <AlertCircle size={12} className="text-rose-500"/>;
                        } else if (percent > 80) {
                            statusColor = 'bg-amber-400';
                            statusText = 'text-amber-600';
                        } else {
                            statusColor = 'bg-rose-200';
                        }
                    }

                    return (
                        <div key={item.id} className="group flex flex-col p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all gap-2">
                            <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-slate-700 text-sm flex items-center gap-1">
                                        {item.name}
                                        {alertIcon}
                                    </div>
                                    {item.note && <div className="text-xs text-slate-400 truncate mt-0.5">{item.note}</div>}
                                </div>
                                <div className="text-right">
                                    <div className={`font-mono font-bold ${typeColor}`}>
                                        {formatCurrency(item.amount)}
                                    </div>
                                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                                        <button onClick={() => handleOpenModal(item)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 size={12}/></button>
                                        <button onClick={() => handleDelete(item.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"><Trash2 size={12}/></button>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Actual vs Budget Progress */}
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-bold">
                                    <span className="text-slate-400">{selectedMonth} 實際: {formatCurrency(actual)}</span>
                                    <span className={statusText || 'text-slate-400'}>{percent.toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all ${statusColor}`}
                                        style={{ width: `${Math.min(percent, 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 grid grid-cols-2 gap-4">
            <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">預估小計</span>
                <span className={`font-mono font-bold text-lg ${typeColor}`}>
                    {formatCurrency(totalEstimated)}
                </span>
            </div>
            <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">{selectedMonth} 實際合計</span>
                <span className={`font-mono font-bold text-lg ${typeColor}`}>
                    {formatCurrency(totalActual)}
                </span>
            </div>
        </div>
    </div>
  )};

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
         <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl"><Calculator size={20}/></div>
            <div>
               <h2 className="text-xl font-bold text-slate-800">基本收支總表</h2>
               <p className="text-xs text-slate-500">規劃每月的固定預算，並即時追蹤 {selectedMonth} 執行狀況。</p>
            </div>
         </div>
         <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm self-start sm:self-auto">
            <div className="p-1.5 bg-slate-100 rounded-lg text-slate-500">
                <Calendar size={16} />
            </div>
            <input 
                type="month" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="outline-none text-sm font-bold text-slate-700 bg-transparent cursor-pointer"
            />
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <StatCard 
            title="預估月收入" 
            value={totalIncome} 
            colorClass="border-emerald-200 text-emerald-600 bg-emerald-50/30" 
            icon={Wallet} 
         />
         <StatCard 
            title="預估月支出" 
            value={totalExpense} 
            colorClass="border-rose-200 text-rose-600 bg-rose-50/30" 
            icon={DollarSign} 
         />
         <StatCard 
            title="預估月結餘" 
            value={netBalance} 
            colorClass={`border-indigo-200 ${netBalance >= 0 ? 'text-indigo-600' : 'text-rose-600'} bg-indigo-50/30`} 
            icon={PiggyBank} 
         />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <ItemList 
            title="預估收入" 
            data={incomeItems} 
            typeColor="text-emerald-600" 
            headerColor="bg-emerald-50/50"
         />
         <ItemList 
            title="預估支出" 
            data={expenseItems} 
            typeColor="text-rose-600" 
            headerColor="bg-rose-50/50"
         />
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        {editingId ? <Edit2 size={18}/> : <Plus size={18}/>}
                        {editingId ? '編輯項目' : '新增項目'}
                    </h3>
                    <button type="button" onClick={() => setIsModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button type="button" onClick={() => setType('INCOME')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${type === 'INCOME' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>收入</button>
                        <button type="button" onClick={() => setType('EXPENSE')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${type === 'EXPENSE' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>支出</button>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">項目名稱</label>
                        <input value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-700" placeholder="例如: 薪資、房租" required autoFocus />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">金額</label>
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={`w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-mono font-bold text-lg ${type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'}`} placeholder="0" required />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">備註 (選填)</label>
                        <input value={note} onChange={e => setNote(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500" placeholder="..." />
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg transition-colors">取消</button>
                    <button type="submit" className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 shadow-md active:scale-95 transition-all flex items-center gap-2">
                        <Save size={16}/> 儲存
                    </button>
                </div>
            </form>
        </div>
      )}
    </div>
  );
};

const TrendingUpIcon = ({size}: {size: number}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
);
const TrendingDownIcon = ({size}: {size: number}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>
);

export default React.memo(BudgetOverview);
