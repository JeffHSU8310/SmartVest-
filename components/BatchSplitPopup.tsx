import React, { useState } from 'react';
import { Transaction, Stock, TransactionType } from '../types';
import { X, Calculator, Check } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onApply: (rate: number, updatedOtherTxs: Transaction[]) => void;
    otherTxs: Transaction[];
    currentUSD: number;
    stocks: Stock[];
    type: TransactionType;
}

export const BatchSplitPopup = ({ isOpen, onClose, onApply, otherTxs, currentUSD, stocks, type }: Props) => {
    const [twdInput, setTwdInput] = useState('');

    if (!isOpen) return null;

    const getTransactionUSD = (t: Transaction) => {
        const p = t.price * t.quantity;
        if (t.type === TransactionType.BUY) return p + t.fee;
        if (t.type === TransactionType.SELL) return -(p - t.fee - t.tax);
        return -(p - t.fee - t.tax);
    };

    const otherUSD = otherTxs.reduce((sum, t) => sum + getTransactionUSD(t), 0);
    const totalUSD = currentUSD + otherUSD;
    const parsedTwd = parseFloat(twdInput) || 0;
    const rate = parsedTwd !== 0 && totalUSD !== 0 ? Math.abs(parsedTwd / totalUSD) : 0;

    const handleApply = () => {
        if (rate > 0) {
            const updated = otherTxs.map(t => ({ ...t, exchangeRate: rate }));
            onApply(rate, updated);
        }
    };

    const formatSignedUSD = (val: number) => {
        return val > 0 ? `-$${Math.abs(val).toFixed(2)} (買進支出)` : `+$${Math.abs(val).toFixed(2)} (賣出/領息收入)`;
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg">
                            <Calculator size={18} />
                        </div>
                        <h3 className="font-bold text-slate-800">批量分攤計算 (同交割日)</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 overflow-y-auto">
                    <div className="space-y-4">
                        {otherTxs.length > 0 && (
                            <div className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-100">
                                <div className="text-xs font-bold text-slate-500 mb-1">包含此日期其他交易</div>
                                {otherTxs.map(t => {
                                    const stock = stocks.find(s => s.id === t.stockId);
                                    return (
                                        <div key={t.id} className="flex justify-between items-center text-sm">
                                            <span className="font-medium text-slate-700">{stock?.ticker} {stock?.name}</span>
                                            <span className="font-mono text-slate-600">{formatSignedUSD(getTransactionUSD(t))}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        
                        <div className="flex justify-between items-center text-sm p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                            <span className="font-bold text-blue-800">當前編輯交易</span>
                            <span className="font-mono font-bold text-blue-700">{formatSignedUSD(currentUSD)}</span>
                        </div>

                        <div className="flex justify-between items-center text-base p-3 bg-slate-100 rounded-xl">
                            <span className="font-bold text-slate-800">淨美金 {totalUSD > 0 ? '扣款' : '入帳'}</span>
                            <span className="font-mono font-bold text-slate-900">${Math.abs(totalUSD).toFixed(2)}</span>
                        </div>

                        <div className="space-y-2 pt-2">
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">輸入總台幣金額 (扣款或入帳)</label>
                            <input 
                                type="number" 
                                value={twdInput} 
                                onChange={e => setTwdInput(e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl outline-none focus:border-blue-500 transition-all font-bold text-slate-800 font-mono text-lg text-center"
                                placeholder="例如: 10000"
                                autoFocus
                            />
                        </div>

                        {rate > 0 && (
                            <div className="flex justify-between items-center text-sm p-3 bg-emerald-50 rounded-xl border border-emerald-100 mt-2">
                                <span className="font-bold text-emerald-800">計算出對應匯率</span>
                                <span className="font-mono font-bold text-emerald-700">{rate.toFixed(4)}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">
                        取消
                    </button>
                    <button 
                        onClick={handleApply}
                        disabled={rate <= 0}
                        className="flex-1 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                        <Check size={18} /> 套用匯率
                    </button>
                </div>
            </div>
        </div>
    );
};
