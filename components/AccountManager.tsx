
import React, { useState, useEffect, useMemo } from 'react';
import { Account } from '../types';
import { generateId } from '../utils';
import { Trash2, Plus, Edit2, Check, Wallet, CreditCard, TrendingUp, Banknote, Ban, Link as LinkIcon, ArrowRight, GripVertical, User, Key, Lock, Unlock, X, Eye, EyeOff, KeyRound, ArrowRightLeft } from 'lucide-react';

interface Props {
  accounts: Account[];
  onAddAccount: (account: Account) => void;
  onUpdateAccount: (account: Account) => void;
  onDeleteAccount: (id: string) => void;
  onReorderAccounts: (accounts: Account[]) => void;
  onTransferTransactions?: (fromId: string, toId: string) => void;
}

const MASTER_PIN_KEY = 'smartvest_master_pin';

const AccountManager: React.FC<Props> = ({ accounts, onAddAccount, onUpdateAccount, onDeleteAccount, onReorderAccounts, onTransferTransactions }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [isSecurities, setIsSecurities] = useState(true);
  const [isCash, setIsCash] = useState(false);
  const [excludeFromTotals, setExcludeFromTotals] = useState(false);
  const [linkedCashAccountId, setLinkedCashAccountId] = useState('');
  
  // New Fields
  const [accUsername, setAccUsername] = useState('');
  const [accPassword, setAccPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false); // Toggle visibility in edit form

  // Security State
  const [masterPin, setMasterPin] = useState(() => localStorage.getItem(MASTER_PIN_KEY) || '8888');
  const [isSecretsUnlocked, setIsSecretsUnlocked] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockInput, setUnlockInput] = useState('');
  const [unlockError, setUnlockError] = useState(false);
  
  // Change PIN State
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState(false);
  const [cpOld, setCpOld] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpError, setCpError] = useState('');

  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Transfer State
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [isConfirmingTransfer, setIsConfirmingTransfer] = useState(false);

  // Available cash accounts for linking (exclude current editing account if it's a cash account, to prevent self-link loop)
  const availableCashAccounts = useMemo(() => {
     return accounts.filter(a => (a.isCash || a.isSecurities) && !a.excludeFromTotals && a.id !== editingId);
  }, [accounts, editingId]);

  const resetForm = () => {
    setName('');
    setAccUsername('');
    setAccPassword('');
    setShowPasswordInput(false);
    setIsSecurities(true);
    setIsCash(false);
    setExcludeFromTotals(false);
    setLinkedCashAccountId('');
    setIsAdding(false);
    setEditingId(null);
  };

  useEffect(() => {
    if (isAdding) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          resetForm();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isAdding]);

  const handleEditClick = (account: Account) => {
    setEditingId(account.id);
    setName(account.name);
    setAccUsername(account.username || '');
    setAccPassword(account.password || '');
    // Backward compatibility: undefined means treated as Securities primarily, but let's be explicit
    setIsSecurities(account.isSecurities !== false);
    setIsCash(!!account.isCash);
    setExcludeFromTotals(!!account.excludeFromTotals);
    setLinkedCashAccountId(account.linkedCashAccountId || '');
    setIsAdding(true);
  };

  const handleExcludeToggle = () => {
     const newValue = !excludeFromTotals;
     setExcludeFromTotals(newValue);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Ensure at least one type is selected
    if (!isSecurities && !isCash) {
       alert('請至少勾選一種帳戶類型 (證券帳戶或現金帳戶)');
       return;
    }

    const accountData: Account = { 
       id: editingId || generateId(),
       name, 
       isSecurities: isSecurities, 
       isCash: isCash,
       excludeFromTotals,
       linkedCashAccountId: (isSecurities && linkedCashAccountId) ? linkedCashAccountId : undefined,
       username: accUsername || undefined,
       password: accPassword || undefined
    };

    if (editingId) {
      onUpdateAccount(accountData);
    } else {
      onAddAccount(accountData);
    }
    resetForm();
  };

  const handleUnlockAttempt = (e: React.FormEvent) => {
      e.preventDefault();
      if (unlockInput === masterPin) {
          setIsSecretsUnlocked(true);
          setIsUnlockModalOpen(false);
          setUnlockInput('');
          setUnlockError(false);
      } else {
          setUnlockError(true);
          // Shake effect reset
          setTimeout(() => setUnlockError(false), 500);
      }
  };

  const handleChangePinSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (cpOld !== masterPin) {
          setCpError('舊密碼不正確');
          return;
      }
      if (cpNew !== cpConfirm) {
          setCpError('兩次新密碼輸入不一致');
          return;
      }
      if (!cpNew) {
          setCpError('新密碼不能為空');
          return;
      }

      setMasterPin(cpNew);
      localStorage.setItem(MASTER_PIN_KEY, cpNew);
      setIsChangePinModalOpen(false);
      // Reset
      setCpOld('');
      setCpNew('');
      setCpConfirm('');
      setCpError('');
      alert('密碼修改成功！請牢記您的新密碼。');
  };

  const getLinkedAccountName = (id?: string) => {
     if (!id) return null;
     const found = accounts.find(a => a.id === id);
     return found ? found.name : '未知帳戶';
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Make the row semi-transparent while dragging
    if (e.currentTarget) e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent<HTMLTableRowElement>) => {
    e.currentTarget.style.opacity = '1';
    setDraggedId(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLTableRowElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLTableRowElement>, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const fromIndex = accounts.findIndex(a => a.id === draggedId);
    const toIndex = accounts.findIndex(a => a.id === targetId);

    if (fromIndex !== -1 && toIndex !== -1) {
      const newOrder = [...accounts];
      const [moved] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, moved);
      onReorderAccounts(newOrder);
    }
    setDraggedId(null);
  };

  const handleTransfer = () => {
    if (!transferFrom || !transferTo) {
      alert('請選擇來源與目的帳戶');
      return;
    }
    if (transferFrom === transferTo) {
      alert('來源與目的不應為同一個帳戶');
      return;
    }
    
    if (!isConfirmingTransfer) {
      setIsConfirmingTransfer(true);
      return;
    }

    // Second click: Execute
    if (onTransferTransactions) {
      onTransferTransactions(transferFrom, transferTo);
      alert('紀錄轉移成功');
      setTransferFrom('');
      setTransferTo('');
      setIsConfirmingTransfer(false);
    } else {
      alert('發生錯誤：移轉函式未定義');
      setIsConfirmingTransfer(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 animate-in fade-in slide-in-from-bottom-4 w-full mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
           <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Wallet className="text-blue-600" size={24} /> 帳戶管理
          </h2>
          <p className="text-xs text-slate-500 mt-1 pl-8">設定您的帳戶用途：股票交易或現金資產管理。可拖拉調整順序。</p>
        </div>
        
        <div className="flex items-center gap-3">
            <button
                onClick={() => {
                    setCpError('');
                    setCpOld('');
                    setCpNew('');
                    setCpConfirm('');
                    setIsChangePinModalOpen(true);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="修改解鎖密碼"
            >
                <KeyRound size={18} />
            </button>

            <button
                onClick={() => isSecretsUnlocked ? setIsSecretsUnlocked(false) : setIsUnlockModalOpen(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                    isSecretsUnlocked 
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
                {isSecretsUnlocked ? <Unlock size={14}/> : <Lock size={14}/>}
                {isSecretsUnlocked ? '隱藏帳密' : '顯示帳密'}
            </button>

            {!isAdding && (
            <button 
                type="button"
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-full hover:bg-slate-700 hover:shadow-lg transition-all text-sm font-bold active:scale-95"
            >
                <Plus size={18} /> 新增帳戶
            </button>
            )}
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-8 p-6 bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-100 animate-in fade-in slide-in-from-top-2 shadow-inner">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">帳戶名稱</label>
              <div className="relative">
                 <CreditCard className="absolute left-3.5 top-3 text-slate-400" size={18} />
                 <input 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: 玉山證券 (主帳戶)"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-medium text-slate-800"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Credentials Section - Only Visible When Unlocked */}
            {isSecretsUnlocked && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50/80 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-1">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1 flex items-center gap-1"><User size={12}/> 帳戶使用者名稱</label>
                        <input 
                            value={accUsername}
                            onChange={e => setAccUsername(e.target.value)}
                            placeholder="選填，輸入帳號/ID"
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white text-sm"
                            autoComplete="off"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1 flex items-center gap-1"><Key size={12}/> 密碼</label>
                        <div className="relative">
                            <input 
                                type={showPasswordInput ? "text" : "password"}
                                value={accPassword}
                                onChange={e => setAccPassword(e.target.value)}
                                placeholder="選填，允許特殊符號"
                                className="w-full pl-4 pr-10 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white text-sm"
                                autoComplete="off"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPasswordInput(!showPasswordInput)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                {showPasswordInput ? <EyeOff size={16}/> : <Eye size={16}/>}
                            </button>
                        </div>
                    </div>
                    <div className="col-span-full text-[10px] text-slate-400 flex items-center gap-1">
                        <Lock size={10} /> 資訊將儲存於本地，需輸入解鎖密碼才可於列表中查看。
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 py-2">
                <label className={`flex-1 flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isSecurities ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                  <input 
                    type="checkbox" 
                    checked={isSecurities} 
                    onChange={e => setIsSecurities(e.target.checked)} 
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-slate-300"
                  />
                  <div className="flex flex-col">
                     <span className={`font-bold text-sm ${isSecurities ? 'text-blue-700' : 'text-slate-600'}`}>證券帳戶</span>
                     <span className="text-[10px] text-slate-400">用於股票交易，並顯示於資產概況之現金項目</span>
                  </div>
                  <TrendingUp className={`ml-auto ${isSecurities ? 'text-blue-500' : 'text-slate-300'}`} size={20} />
               </label>

               <label className={`flex-1 flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isCash ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                  <input 
                    type="checkbox" 
                    checked={isCash} 
                    onChange={e => setIsCash(e.target.checked)} 
                    className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 border-slate-300"
                  />
                  <div className="flex flex-col">
                     <span className={`font-bold text-sm ${isCash ? 'text-emerald-700' : 'text-slate-600'}`}>現金帳戶</span>
                     <span className="text-[10px] text-slate-400">顯示於總資產概況之現金項目</span>
                  </div>
                  <Banknote className={`ml-auto ${isCash ? 'text-emerald-500' : 'text-slate-300'}`} size={20} />
               </label>
            </div>

            {/* Linked Account Selector */}
            {isSecurities && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 animate-in slide-in-from-top-1">
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                      <LinkIcon size={12} /> 連結交割現金帳戶
                   </label>
                   <div className="relative">
                      <select 
                         value={linkedCashAccountId} 
                         onChange={e => setLinkedCashAccountId(e.target.value)}
                         className="w-full pl-4 pr-10 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium text-slate-700 appearance-none cursor-pointer"
                      >
                         <option value="">(無連結 - 資金留在證券戶)</option>
                         {availableCashAccounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                         ))}
                      </select>
                      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400">
                         <ArrowRight size={16} className="rotate-90" />
                      </div>
                   </div>
                   <p className="text-[10px] text-slate-400 mt-2">
                      設定連結後，此證券帳戶產生的自動記帳紀錄 (買入扣款/賣出入帳/股息)，將會自動記入選擇的交割現金帳戶中。
                   </p>
                </div>
            )}

            <div 
               onClick={handleExcludeToggle}
               className={`w-full p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-center gap-2 font-bold text-sm select-none mt-2
                  ${excludeFromTotals 
                     ? 'bg-blue-50 border-blue-500 text-blue-600' 
                     : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-500'}
               `}
            >
               {excludeFromTotals ? <Check size={18} className="text-blue-500" strokeWidth={3} /> : <Ban size={18} />}
               不列入任何資產計算
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={resetForm}
                className="px-5 py-2.5 text-slate-500 hover:bg-slate-200 rounded-xl text-sm font-bold transition-colors"
              >
                取消
              </button>
              <button 
                type="submit" 
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-bold flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
              >
                <Check size={16} /> {editingId ? '更新' : '儲存'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Unlock Modal */}
      {isUnlockModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
              <form onSubmit={handleUnlockAttempt} className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 relative overflow-hidden">
                  <button type="button" onClick={() => setIsUnlockModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  <div className="flex flex-col items-center gap-4 mb-4">
                      <div className="p-3 bg-amber-100 text-amber-600 rounded-full"><Lock size={24}/></div>
                      <h3 className="text-lg font-bold text-slate-800">輸入密碼以顯示</h3>
                  </div>
                  <div className="space-y-2">
                      <input 
                          type="password" 
                          autoFocus
                          value={unlockInput}
                          onChange={e => { setUnlockInput(e.target.value); setUnlockError(false); }}
                          placeholder="請輸入解鎖密碼"
                          className={`w-full px-4 py-3 border rounded-xl outline-none text-center font-bold tracking-widest text-lg transition-all ${unlockError ? 'border-rose-500 bg-rose-50' : 'border-slate-200 focus:border-blue-500'}`}
                      />
                      {unlockError && <p className="text-xs text-rose-500 text-center font-bold">密碼錯誤</p>}
                  </div>
                  <button type="submit" className="w-full mt-6 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-md active:scale-95">
                      解鎖顯示
                  </button>
              </form>
          </div>
      )}

      {/* Change PIN Modal */}
      {isChangePinModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
              <form onSubmit={handleChangePinSubmit} className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 relative overflow-hidden">
                  <button type="button" onClick={() => setIsChangePinModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  <div className="flex flex-col items-center gap-4 mb-4">
                      <div className="p-3 bg-blue-100 text-blue-600 rounded-full"><KeyRound size={24}/></div>
                      <h3 className="text-lg font-bold text-slate-800">修改解鎖密碼</h3>
                  </div>
                  <div className="space-y-3">
                      <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500">舊密碼</label>
                          <input 
                              type="password" 
                              value={cpOld}
                              onChange={e => { setCpOld(e.target.value); setCpError(''); }}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                              placeholder="驗證身分"
                          />
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500">新密碼</label>
                          <input 
                              type="password" 
                              value={cpNew}
                              onChange={e => { setCpNew(e.target.value); setCpError(''); }}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                              placeholder="輸入新密碼"
                          />
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500">確認新密碼</label>
                          <input 
                              type="password" 
                              value={cpConfirm}
                              onChange={e => { setCpConfirm(e.target.value); setCpError(''); }}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                              placeholder="再次輸入新密碼"
                          />
                      </div>
                      {cpError && <p className="text-xs text-rose-500 text-center font-bold bg-rose-50 p-2 rounded-lg">{cpError}</p>}
                  </div>
                  <button type="submit" className="w-full mt-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md active:scale-95">
                      確認修改
                  </button>
              </form>
          </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-bold">帳戶名稱</th>
              <th className="px-6 py-4 font-bold">類型功能</th>
              <th className="px-6 py-4 font-bold text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                      <Wallet size={32} className="text-slate-300" />
                      <span>尚未新增帳戶</span>
                   </div>
                </td>
              </tr>
            ) : (
              accounts.map(account => {
                const linkedName = getLinkedAccountName(account.linkedCashAccountId);
                const isDragging = draggedId === account.id;

                return (
                  <tr 
                    key={account.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, account.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, account.id)}
                    onDragEnd={handleDragEnd}
                    className={`transition-colors group ${isDragging ? 'bg-blue-50 opacity-50' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-6 py-4 font-bold text-slate-800">
                       <div className="flex items-center gap-3">
                          <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-blue-500 transition-colors" title="拖曳排序">
                             <GripVertical size={16} />
                          </div>
                          <div className={`p-2 rounded-lg ${account.excludeFromTotals ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-500'}`}>
                              <CreditCard size={18} />
                          </div>
                          <div className="flex flex-col gap-1">
                              <span className="text-base">{account.name}</span>
                              {account.excludeFromTotals && <span className="text-[10px] text-slate-400 font-normal">不計入資產</span>}
                              
                              {/* Credentials Display */}
                              {(account.username || account.password) && (
                                  <div className="flex items-center gap-2 mt-1">
                                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono border ${isSecretsUnlocked ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                                          <User size={10} className="shrink-0"/>
                                          <span className="truncate max-w-[100px]">{isSecretsUnlocked ? (account.username || '-') : '******'}</span>
                                      </div>
                                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono border ${isSecretsUnlocked ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                                          <Key size={10} className="shrink-0"/>
                                          <span className="truncate max-w-[100px]">{isSecretsUnlocked ? (account.password || '-') : '******'}</span>
                                      </div>
                                  </div>
                              )}

                              {linkedName && (
                                 <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 bg-emerald-50 px-1.5 rounded w-fit mt-0.5 border border-emerald-100">
                                    <LinkIcon size={10} /> 交割: {linkedName}
                                 </span>
                              )}
                          </div>
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex flex-wrap gap-2">
                          {account.isSecurities !== false && !account.excludeFromTotals && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                               <TrendingUp size={12}/> 證券
                            </span>
                          )}
                          {account.isCash && !account.excludeFromTotals && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                               <Banknote size={12}/> 現金
                            </span>
                          )}
                          {account.excludeFromTotals && (
                             <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                <Ban size={12}/> 僅記錄 (不計算)
                             </span>
                          )}
                       </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                          type="button"
                          onClick={() => handleEditClick(account)}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="編輯"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          type="button"
                          onClick={() => onDeleteAccount(account.id)}
                          className="p-2 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors"
                          title="刪除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 bg-slate-50 p-6 rounded-2xl border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
          <ArrowRightLeft size={20} className="text-blue-500" />
          交易紀錄帳戶移轉工具
        </h3>
        <p className="text-xs text-slate-500 mb-4">如果您想將某個證券帳戶的「所有股票交易紀錄」移轉至另一個帳戶，可以使用此工具。移轉後來源帳戶的紀錄將自動歸屬於目的帳戶。</p>
        
        <div className="flex flex-col sm:flex-row items-end gap-4">
          <div className="flex-1 space-y-1 w-full">
            <label className="text-xs font-bold text-slate-500">來源帳戶 (移出)</label>
            <select 
              value={transferFrom} 
              onChange={e => { setTransferFrom(e.target.value); setIsConfirmingTransfer(false); }}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-blue-500 bg-white"
            >
              <option value="">-- 選擇來源帳戶 --</option>
              {accounts.filter(a => a.isSecurities).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          
          <div className="hidden sm:block pb-2 text-slate-400">
            <ArrowRight size={20} />
          </div>

          <div className="flex-1 space-y-1 w-full">
            <label className="text-xs font-bold text-slate-500">目的帳戶 (移入)</label>
            <select 
              value={transferTo} 
              onChange={e => { setTransferTo(e.target.value); setIsConfirmingTransfer(false); }}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:border-blue-500 bg-white"
            >
              <option value="">-- 選擇目的帳戶 --</option>
              {accounts.filter(a => a.isSecurities).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          
          <button 
            type="button"
            onClick={handleTransfer}
            onMouseLeave={() => setIsConfirmingTransfer(false)}
            disabled={!transferFrom || !transferTo || transferFrom === transferTo}
            className={`w-full sm:w-auto px-6 py-2 ${isConfirmingTransfer ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'} disabled:bg-slate-300 text-white font-bold rounded-xl transition-all whitespace-nowrap h-[42px] flex items-center justify-center gap-2`}
          >
            {isConfirmingTransfer ? (
              <>
                <Check size={18} />
                <span>確定轉移？</span>
              </>
            ) : (
              <span>執行移轉</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AccountManager);
