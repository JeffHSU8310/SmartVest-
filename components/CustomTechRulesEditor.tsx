import { Plus, X, Settings2 } from 'lucide-react';
import React, { useState } from 'react';
import { CustomTechRule, CustomTechRuleType } from './StockScreener';

interface CustomTechRulesEditorProps {
    rules: CustomTechRule[];
    onChange: (rules: CustomTechRule[]) => void;
}

export default function CustomTechRulesEditor({ rules, onChange }: CustomTechRulesEditorProps) {
    const [addingType, setAddingType] = useState<CustomTechRuleType | null>(null);

    const addRule = (type: CustomTechRuleType) => {
        let defaultParams: any = {};
        if (type === 'MA_ARRANGEMENT') defaultParams = { maList: [5, 10, 20], priceIncluded: true };
        if (type === 'PRICE_MA_BIAS') defaultParams = { maPeriod: 20, relation: 'greater', minPct: 5, maxPct: 10 };
        if (type === 'CONSECUTIVE_PRICE_MA') defaultParams = { days: 3, maPeriod: 20, relation: 'less' };
        if (type === 'MA_VS_DEDUCT') defaultParams = { maPeriod: 20, relation: 'greater' };
        if (type === 'MA_TREND') defaultParams = { maPeriod: 20, days: 3, trend: 'up' };

        const newRule: CustomTechRule = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            params: defaultParams
        };

        onChange([...rules, newRule]);
        setAddingType(null);
    };

    const updateRule = (id: string, params: any) => {
        onChange(rules.map(r => r.id === id ? { ...r, params } : r));
    };

    const removeRule = (id: string) => {
        onChange(rules.filter(r => r.id !== id));
    };

    return (
        <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between mb-4">
                <h5 className="font-semibold text-slate-700 flex items-center gap-2">
                    <Settings2 size={16} className="text-indigo-500"/> 進階均線條件設定
                </h5>
                <div className="relative">
                    <select 
                        className="text-sm border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"
                        value={addingType || ''}
                        onChange={(e) => {
                            if (e.target.value) addRule(e.target.value as CustomTechRuleType);
                        }}
                    >
                        <option value="">+ 新增條件...</option>
                        <option value="MA_ARRANGEMENT">多重均線多頭/空頭排列</option>
                        <option value="PRICE_MA_BIAS">股價與均線乖離率</option>
                        <option value="CONSECUTIVE_PRICE_MA">連續 N 日大於/小於均線</option>
                        <option value="MA_VS_DEDUCT">均線與扣抵值比較</option>
                        <option value="MA_TREND">均線連續遞增/遞減</option>
                    </select>
                </div>
            </div>

            {rules.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4 bg-slate-50 rounded-lg border border-slate-100 border-dashed">
                    尚未設定進階均線條件
                </p>
            ) : (
                <div className="space-y-3">
                    {rules.map(rule => (
                        <div key={rule.id} className="bg-white border border-slate-200 p-3 rounded-lg shadow-sm flex items-start gap-4">
                            <div className="flex-1">
                                {rule.type === 'MA_ARRANGEMENT' && (
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                                        <span>排列方式：</span>
                                        <label className="flex items-center gap-1">
                                            <input type="checkbox" checked={rule.params.priceIncluded} onChange={e => updateRule(rule.id, {...rule.params, priceIncluded: e.target.checked})} className="rounded text-indigo-600 focus:ring-indigo-500 h-3 w-3" />
                                            <span>收盤價</span>
                                        </label>
                                        <span>&gt;</span>
                                        <input type="text" value={rule.params.maList.join(', ')} onChange={e => {
                                            const arr = e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                                            updateRule(rule.id, {...rule.params, maList: arr});
                                        }} className="w-32 border border-slate-200 p-1 rounded-md text-center" placeholder="例如: 5, 10, 20" />
                                        <span className="text-xs text-slate-500">(依序填入天數，以逗號分隔)</span>
                                    </div>
                                )}
                                {rule.type === 'PRICE_MA_BIAS' && (
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                                        <span>今日股價</span>
                                        <select value={rule.params.relation} onChange={e => updateRule(rule.id, {...rule.params, relation: e.target.value})} className="border border-slate-200 p-1 rounded-md">
                                            <option value="greater">大於</option>
                                            <option value="less">小於</option>
                                        </select>
                                        <input type="number" value={rule.params.maPeriod} onChange={e => updateRule(rule.id, {...rule.params, maPeriod: parseInt(e.target.value) || 20})} className="w-16 border border-slate-200 p-1 rounded-md text-center" />
                                        <span>日均線</span>
                                        <input type="number" value={rule.params.minPct} onChange={e => updateRule(rule.id, {...rule.params, minPct: e.target.value})} className="w-16 border border-slate-200 p-1 rounded-md text-center" placeholder="Min" />
                                        <span>% ~</span>
                                        <input type="number" value={rule.params.maxPct} onChange={e => updateRule(rule.id, {...rule.params, maxPct: e.target.value})} className="w-16 border border-slate-200 p-1 rounded-md text-center" placeholder="Max" />
                                        <span>%</span>
                                    </div>
                                )}
                                {rule.type === 'CONSECUTIVE_PRICE_MA' && (
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                                        <span>連續</span>
                                        <input type="number" value={rule.params.days} onChange={e => updateRule(rule.id, {...rule.params, days: parseInt(e.target.value) || 1})} className="w-16 border border-slate-200 p-1 rounded-md text-center" />
                                        <span>日股價</span>
                                        <select value={rule.params.relation} onChange={e => updateRule(rule.id, {...rule.params, relation: e.target.value})} className="border border-slate-200 p-1 rounded-md">
                                            <option value="greater">大於</option>
                                            <option value="less">小於</option>
                                        </select>
                                        <input type="number" value={rule.params.maPeriod} onChange={e => updateRule(rule.id, {...rule.params, maPeriod: parseInt(e.target.value) || 20})} className="w-16 border border-slate-200 p-1 rounded-md text-center" />
                                        <span>日均線</span>
                                    </div>
                                )}
                                {rule.type === 'MA_VS_DEDUCT' && (
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                                        <input type="number" value={rule.params.maPeriod} onChange={e => updateRule(rule.id, {...rule.params, maPeriod: parseInt(e.target.value) || 20})} className="w-16 border border-slate-200 p-1 rounded-md text-center" />
                                        <span>日均線</span>
                                        <select value={rule.params.relation} onChange={e => updateRule(rule.id, {...rule.params, relation: e.target.value})} className="border border-slate-200 p-1 rounded-md">
                                            <option value="greater">大於</option>
                                            <option value="less">小於</option>
                                        </select>
                                        <span>扣抵值 (即 N 日前收盤價)</span>
                                    </div>
                                )}
                                {rule.type === 'MA_TREND' && (
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                                        <span>連續</span>
                                        <input type="number" value={rule.params.days} onChange={e => updateRule(rule.id, {...rule.params, days: parseInt(e.target.value) || 1})} className="w-16 border border-slate-200 p-1 rounded-md text-center" />
                                        <span>天，</span>
                                        <input type="number" value={rule.params.maPeriod} onChange={e => updateRule(rule.id, {...rule.params, maPeriod: parseInt(e.target.value) || 20})} className="w-16 border border-slate-200 p-1 rounded-md text-center" />
                                        <span>日均線呈現</span>
                                        <select value={rule.params.trend} onChange={e => updateRule(rule.id, {...rule.params, trend: e.target.value})} className="border border-slate-200 p-1 rounded-md">
                                            <option value="up">上升 (遞增)</option>
                                            <option value="down">下降 (遞減)</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                            <button onClick={() => removeRule(rule.id)} className="text-slate-400 hover:text-rose-500 transition-colors p-1 bg-slate-50 hover:bg-rose-50 rounded-md">
                                <X size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
