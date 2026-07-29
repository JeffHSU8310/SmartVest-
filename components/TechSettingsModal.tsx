import React, { useState, useEffect } from 'react';
import { X, Sliders, Check, Ruler, Activity, Key, Plus, Lock, Target } from 'lucide-react';
import { TechSettings } from '../types';

type MAMode = 'SMA' | 'WMA' | 'EMA' | 'S-EMA';

interface Props {
  techSettings: TechSettings;
  onUpdateTechSettings: (s: TechSettings) => void;
  onClose: () => void;
}

export default function TechSettingsModal({ techSettings, onUpdateTechSettings, onClose }: Props) {
  const [tempSettings, setTempSettings] = useState<TechSettings>(techSettings);
  const [tempApiKey, setTempApiKey] = useState(localStorage.getItem('smartvest_gemini_api_key') || '');
  
  useEffect(() => {
    setTempSettings(techSettings);
  }, [techSettings]);

  const handleSaveSettings = () => {
    onUpdateTechSettings(tempSettings);
    if (tempApiKey) {
        localStorage.setItem('smartvest_gemini_api_key', tempApiKey);
    }
    onClose();
  };
  
  const setShowSettings = (v) => {
    if (!v) onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 z-50">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="font-bold text-slate-800 flex items-center gap-2"><Sliders size={18} className="text-blue-600"/> 技術指標參數設定</h3>
                 <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
              </div>
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                 <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Ruler size={14}/> 區間分析設定</h4>
                    <div className="flex items-center gap-3">
                       <label className="text-sm font-bold text-slate-600">統計天數:</label>
                       <input 
                            type="number" 
                            value={tempSettings.rangeAnalysis?.period || 60} 
                            onChange={(e) => {
                                const current = tempSettings.rangeAnalysis || { period: 60, tolerance: 0.03 };
                                setTempSettings({ 
                                    ...tempSettings, 
                                    rangeAnalysis: { 
                                        ...current, 
                                        period: parseInt(e.target.value) || 60 
                                    } 
                                })
                            }} 
                            className="w-24 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500"
                        />
                       <span className="text-xs text-slate-400">抓取近期N天的最高與最低點</span>
                    </div>
                 </div>
                 <div className="space-y-3 pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-center mb-3"><h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Activity size={14}/> 均線設定 (MA)</h4></div>
                    <div className="grid grid-cols-1 gap-3">
                       {tempSettings.mas.map((ma, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 hover:border-blue-200 transition-colors">
                             <input type="checkbox" checked={ma.visible} onChange={(e) => { const newMas = [...tempSettings.mas]; newMas[idx].visible = e.target.checked; setTempSettings({ ...tempSettings, mas: newMas }); }} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"/>
                             <input type="color" value={ma.color} onChange={(e) => { const newMas = [...tempSettings.mas]; newMas[idx].color = e.target.value; setTempSettings({ ...tempSettings, mas: newMas }); }} className="w-6 h-6 p-0 border-0 rounded-full overflow-hidden cursor-pointer shadow-sm" title="點擊更換顏色"/>
                             <input type="number" value={ma.period} onChange={(e) => { const newMas = [...tempSettings.mas]; newMas[idx].period = parseInt(e.target.value) || 0; setTempSettings({ ...tempSettings, mas: newMas }); }} className="w-16 px-2 py-1 text-sm font-bold text-slate-700 outline-none border-b border-transparent focus:border-blue-300 text-center"/>
                             <span className="text-xs text-slate-400 font-bold mr-auto">日</span>
                             <select value={ma.mode} onChange={(e) => { const newMas = [...tempSettings.mas]; newMas[idx].mode = e.target.value as MAMode; setTempSettings({ ...tempSettings, mas: newMas }); }} className="bg-slate-50 border border-slate-200 text-xs font-bold px-2 py-1 rounded outline-none text-slate-600 cursor-pointer focus:border-blue-400 focus:bg-white transition-colors">
                                <option value="SMA">SMA</option><option value="EMA">EMA</option><option value="WMA">WMA</option><option value="S-EMA">S-EMA</option>
                             </select>
                          </div>
                       ))}
                    </div>
                 </div>
                 <div className="space-y-3 pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Target size={14}/> 乖離率設定</h4>
                    <div className="flex flex-col gap-2">
                       <div className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 hover:border-blue-200 transition-colors">
                          <input type="checkbox" checked={tempSettings.bias?.visible !== false} onChange={(e) => setTempSettings({ ...tempSettings, bias: { ...(tempSettings.bias || { period: 20, mode: 'SMA', visible: true }), visible: e.target.checked } })} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"/>
                          <span className="text-xs font-bold text-slate-600">乖離率 1</span>
                          <input type="number" value={tempSettings.bias?.period || 20} onChange={(e) => setTempSettings({ ...tempSettings, bias: { ...(tempSettings.bias || { period: 20, mode: 'SMA', visible: true }), period: parseInt(e.target.value) || 20 } })} className="w-16 px-2 py-1 text-sm font-bold text-slate-700 outline-none border-b border-transparent focus:border-blue-300 text-center ml-2"/>
                          <span className="text-xs text-slate-400 font-bold mr-auto">日</span>
                          <select value={tempSettings.bias?.mode || 'SMA'} onChange={(e) => setTempSettings({ ...tempSettings, bias: { ...(tempSettings.bias || { period: 20, mode: 'SMA', visible: true }), mode: e.target.value as 'SMA' | 'EMA' } })} className="bg-slate-50 border border-slate-200 text-xs font-bold px-2 py-1 rounded outline-none text-slate-600 cursor-pointer focus:border-blue-400 focus:bg-white transition-colors">
                             <option value="SMA">SMA</option><option value="EMA">EMA</option>
                          </select>
                       </div>
                       <div className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 hover:border-blue-200 transition-colors">
                          <input type="checkbox" checked={tempSettings.bias2?.visible !== false} onChange={(e) => setTempSettings({ ...tempSettings, bias2: { ...(tempSettings.bias2 || { period: 60, mode: 'SMA', visible: true }), visible: e.target.checked } })} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"/>
                          <span className="text-xs font-bold text-slate-600">乖離率 2</span>
                          <input type="number" value={tempSettings.bias2?.period || 60} onChange={(e) => setTempSettings({ ...tempSettings, bias2: { ...(tempSettings.bias2 || { period: 60, mode: 'SMA', visible: true }), period: parseInt(e.target.value) || 60 } })} className="w-16 px-2 py-1 text-sm font-bold text-slate-700 outline-none border-b border-transparent focus:border-blue-300 text-center ml-2"/>
                          <span className="text-xs text-slate-400 font-bold mr-auto">日</span>
                          <select value={tempSettings.bias2?.mode || 'SMA'} onChange={(e) => setTempSettings({ ...tempSettings, bias2: { ...(tempSettings.bias2 || { period: 60, mode: 'SMA', visible: true }), mode: e.target.value as 'SMA' | 'EMA' } })} className="bg-slate-50 border border-slate-200 text-xs font-bold px-2 py-1 rounded outline-none text-slate-600 cursor-pointer focus:border-blue-400 focus:bg-white transition-colors">
                             <option value="SMA">SMA</option><option value="EMA">EMA</option>
                          </select>
                       </div>
                    </div>
                 </div>
                 <div className="space-y-3 pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 uppercase">KD 指標</h4>
                    <div className="flex items-center gap-3">
                       <label className="text-sm font-bold text-slate-600">RSV 週期:</label>
                       <input type="number" value={tempSettings.kd.period} onChange={(e) => setTempSettings({ ...tempSettings, kd: { period: parseInt(e.target.value) || 9 } })} className="w-20 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500"/>
                    </div>
                 </div>
                 <div className="space-y-3 pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 uppercase">MACD 指標</h4>
                    <div className="grid grid-cols-3 gap-3">
                       <div className="space-y-1"><label className="text-[10px] text-slate-400 font-bold uppercase">Fast</label><input type="number" value={tempSettings.macd.fast} onChange={(e) => setTempSettings({ ...tempSettings, macd: { ...tempSettings.macd, fast: parseInt(e.target.value) || 12 } })} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500" /></div>
                       <div className="space-y-1"><label className="text-[10px] text-slate-400 font-bold uppercase">Slow</label><input type="number" value={tempSettings.macd.slow} onChange={(e) => setTempSettings({ ...tempSettings, macd: { ...tempSettings.macd, slow: parseInt(e.target.value) || 26 } })} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500" /></div>
                       <div className="space-y-1"><label className="text-[10px] text-slate-400 font-bold uppercase">Signal</label><input type="number" value={tempSettings.macd.signal} onChange={(e) => setTempSettings({ ...tempSettings, macd: { ...tempSettings.macd, signal: parseInt(e.target.value) || 9 } })} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500" /></div>
                    </div>
                 </div>
                 <div className="space-y-3 pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 uppercase">RSI 指標</h4>
                    <div className="flex items-center gap-3">
                       <label className="text-sm font-bold text-slate-600">週期:</label>
                       <input type="number" value={tempSettings.rsi.period} onChange={(e) => setTempSettings({ ...tempSettings, rsi: { period: parseInt(e.target.value) || 14 } })} className="w-20 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500"/>
                    </div>
                 </div>
                 
                 <div className="space-y-3 pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 uppercase">JR 指標</h4>
                    <div className="flex flex-wrap items-center gap-3">
                       <div className="flex items-center gap-2">
                          <label className="text-sm font-bold text-slate-600">J 參數:</label>
                          <input type="number" value={tempSettings.jr?.jPeriod || 14} onChange={(e) => {
                             const currentJr = tempSettings.jr || { jPeriod: 14, rsiPeriod: 14, normalizePeriod: 60 };
                             setTempSettings({ ...tempSettings, jr: { ...currentJr, jPeriod: parseInt(e.target.value) || 14 } });
                          }} className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500"/>
                       </div>
                       <div className="flex items-center gap-2">
                          <label className="text-sm font-bold text-slate-600">RSI 參數:</label>
                          <input type="number" value={tempSettings.jr?.rsiPeriod || 14} onChange={(e) => {
                             const currentJr = tempSettings.jr || { jPeriod: 14, rsiPeriod: 14, normalizePeriod: 60 };
                             setTempSettings({ ...tempSettings, jr: { ...currentJr, rsiPeriod: parseInt(e.target.value) || 14 } });
                          }} className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500"/>
                       </div>
                       <div className="flex items-center gap-2">
                          <label className="text-sm font-bold text-slate-600">正規化天數:</label>
                          <input type="number" value={tempSettings.jr?.normalizePeriod || 60} onChange={(e) => {
                             const currentJr = tempSettings.jr || { jPeriod: 14, rsiPeriod: 14, normalizePeriod: 60 };
                             setTempSettings({ ...tempSettings, jr: { ...currentJr, normalizePeriod: parseInt(e.target.value) || 60 } });
                          }} title="決定J線高低波動範圍的天數，大盤建議設定60或120" className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500"/>
                       </div>
                       <div className="flex items-center gap-2">
                          <label className="text-sm font-bold text-slate-600">均線計算:</label>
                          <select value={tempSettings.jr?.smoothMode || 'S-EMA'} onChange={(e) => {
                             const currentJr = tempSettings.jr || { jPeriod: 14, rsiPeriod: 14, normalizePeriod: 60, smoothMode: 'S-EMA', trendPeriod: 9 };
                             setTempSettings({ ...tempSettings, jr: { ...currentJr, smoothMode: e.target.value as any } });
                          }} className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500">
                              <option value="SMA">SMA</option>
                              <option value="EMA">EMA</option>
                              <option value="S-EMA">S-EMA</option>
                          </select>
                       </div>
                       <div className="flex items-center gap-2">
                          <label className="text-sm font-bold text-slate-600">Trend 參數:</label>
                          <input type="number" value={tempSettings.jr?.trendPeriod || 9} onChange={(e) => {
                             const currentJr = tempSettings.jr || { jPeriod: 14, rsiPeriod: 14, normalizePeriod: 60, smoothMode: 'S-EMA', trendPeriod: 9 };
                             setTempSettings({ ...tempSettings, jr: { ...currentJr, trendPeriod: parseInt(e.target.value) || 9 } });
                          }} title="計算RSI的EMA天數，產生趨勢參考線" className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500"/>
                       </div>
                       <div className="w-full mt-2 border-t border-slate-200 pt-3">
                          <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-2 w-full">
                                  <label className="text-sm font-bold text-slate-600 whitespace-nowrap min-w-[80px]">交易策略:</label>
                                  <select value={tempSettings.jr?.strategyMode || 'SWING'} onChange={(e) => {
                                     const currentJr = tempSettings.jr || { jPeriod: 14, rsiPeriod: 14, normalizePeriod: 60 };
                                     setTempSettings({ ...tempSettings, jr: { ...currentJr, strategyMode: e.target.value as 'SWING'|'ACCUMULATE' } });
                                  }} className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500 bg-white">
                                      <option value="SWING">波段交易 (多空雙向與防守)</option>
                                      <option value="ACCUMULATE">長期存股 (僅左側買進加碼)</option>
                                  </select>
                              </div>
                              {tempSettings.jr?.strategyMode === 'ACCUMULATE' && (
                                  <div className="w-full space-y-2 mt-2 bg-blue-50 p-2 rounded-lg border border-blue-100">
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                          <div className="flex items-center justify-between">
                                              <label className="text-slate-600 font-bold" title="J值跌破此數值視為極度恐慌">J值極度恐慌</label>
                                              <input type="number" value={tempSettings.jr?.accJrJThresh ?? 10} onChange={e => setTempSettings({...tempSettings, jr: {...tempSettings.jr!, accJrJThresh: parseFloat(e.target.value)||10}})} className="w-14 px-1 py-1 border rounded text-center"/>
                                          </div>
                                          <div className="flex items-center justify-between">
                                              <label className="text-slate-600 font-bold" title="RSI在此數值下發生金叉">RSI位階一</label>
                                              <input type="number" value={tempSettings.jr?.accJrRsiThresh1 ?? 50} onChange={e => setTempSettings({...tempSettings, jr: {...tempSettings.jr!, accJrRsiThresh1: parseFloat(e.target.value)||50}})} className="w-14 px-1 py-1 border rounded text-center"/>
                                          </div>
                                          <div className="flex items-center justify-between">
                                              <label className="text-slate-600 font-bold" title="RSI在此數值下反彈站上趨勢線">RSI位階二</label>
                                              <input type="number" value={tempSettings.jr?.accJrRsiThresh2 ?? 45} onChange={e => setTempSettings({...tempSettings, jr: {...tempSettings.jr!, accJrRsiThresh2: parseFloat(e.target.value)||45}})} className="w-14 px-1 py-1 border rounded text-center"/>
                                          </div>
                                          <div className="flex items-center justify-between">
                                              <label className="text-slate-600 font-bold" title="加碼冷卻天數">加碼冷卻天數</label>
                                              <input type="number" value={tempSettings.jr?.accCooldownDays ?? 5} onChange={e => setTempSettings({...tempSettings, jr: {...tempSettings.jr!, accCooldownDays: parseInt(e.target.value)||5}})} className="w-14 px-1 py-1 border rounded text-center"/>
                                          </div>
                                          <div className="flex items-center justify-between col-span-2 border-t border-blue-100/50 pt-1 mt-1">
                                              <label className="text-slate-600 font-bold" title="跌了多少%無條件再買">破底加碼跌幅 (例如 0.03 即 3%)</label>
                                              <input type="number" step="0.01" value={tempSettings.jr?.accPriceDropThresh ?? 0.03} onChange={e => setTempSettings({...tempSettings, jr: {...tempSettings.jr!, accPriceDropThresh: parseFloat(e.target.value)||0.03}})} className="w-16 px-1 py-1 border rounded text-center"/>
                                          </div>
                                      </div>
                                  </div>
                              )}
                              {(!tempSettings.jr?.strategyMode || tempSettings.jr.strategyMode === 'SWING') && (
                              <div className="w-full space-y-2 mt-2 bg-indigo-50/50 p-2 rounded-lg border border-indigo-100/50">
                                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-indigo-100/50">
                                      <label className="text-xs font-bold text-slate-600">防守均線:</label>
                                      <div className="flex items-center gap-1">
                                          <input type="number" value={tempSettings.jr?.maDefensePeriod || 60} onChange={(e) => {
                                             const currentJr = tempSettings.jr || { jPeriod: 14, rsiPeriod: 14, normalizePeriod: 60 };
                                             setTempSettings({ ...tempSettings, jr: { ...currentJr, maDefensePeriod: parseInt(e.target.value) || 60 } });
                                          }} title="作為停損或多頭防守的均線天期" className="w-12 px-1 py-1 border border-slate-200 rounded text-xs font-bold outline-none focus:border-blue-500 bg-white"/>
                                          <select value={tempSettings.jr?.maDefenseMode || 'SMA'} onChange={(e) => {
                                             const currentJr = tempSettings.jr || { jPeriod: 14, rsiPeriod: 14, normalizePeriod: 60 };
                                             setTempSettings({ ...tempSettings, jr: { ...currentJr, maDefenseMode: e.target.value as 'SMA'|'EMA'|'WMA'|'S-EMA' } });
                                          }} className="px-1 py-1 border border-slate-200 rounded text-xs font-bold outline-none focus:border-blue-500 bg-white">
                                              <option value="SMA">SMA</option>
                                              <option value="EMA">EMA</option>
                                              <option value="WMA">WMA</option>
                                              <option value="S-EMA">S-EMA</option>
                                          </select>
                                      </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                      <div className="flex items-center justify-between">
                                          <label className="text-slate-600 font-bold" title="買點：多頭回檔KD">買多頭KD</label>
                                          <input type="number" value={tempSettings.jr?.swingKdThreshBuy ?? 65} onChange={e => setTempSettings({...tempSettings, jr: {...tempSettings.jr!, swingKdThreshBuy: parseFloat(e.target.value)||65}})} className="w-14 px-1 py-1 border rounded text-center"/>
                                      </div>
                                      <div className="flex items-center justify-between">
                                          <label className="text-slate-600 font-bold" title="買點：多頭回檔RSI">買多頭RSI</label>
                                          <input type="number" value={tempSettings.jr?.swingJrRsiThreshBuy ?? 65} onChange={e => setTempSettings({...tempSettings, jr: {...tempSettings.jr!, swingJrRsiThreshBuy: parseFloat(e.target.value)||65}})} className="w-14 px-1 py-1 border rounded text-center"/>
                                      </div>
                                      <div className="flex items-center justify-between">
                                          <label className="text-slate-600 font-bold" title="買點：突破極限KD (需低於此值)">突破極限KD</label>
                                          <input type="number" value={tempSettings.jr?.swingKdThreshBreakout ?? 80} onChange={e => setTempSettings({...tempSettings, jr: {...tempSettings.jr!, swingKdThreshBreakout: parseFloat(e.target.value)||80}})} className="w-14 px-1 py-1 border rounded text-center"/>
                                      </div>
                                      <div className="flex items-center justify-between">
                                          <label className="text-slate-600 font-bold" title="買點：空頭底背離極度恐慌閾值">底背離KD下限</label>
                                          <input type="number" value={tempSettings.jr?.swingKdThreshOversold ?? 25} onChange={e => setTempSettings({...tempSettings, jr: {...tempSettings.jr!, swingKdThreshOversold: parseFloat(e.target.value)||25}})} className="w-14 px-1 py-1 border rounded text-center"/>
                                      </div>
                                      <div className="flex items-center justify-between">
                                          <label className="text-slate-600 font-bold" title="賣點：多頭過熱KD死叉">賣過熱KD</label>
                                          <input type="number" value={tempSettings.jr?.swingKdThreshSell ?? 75} onChange={e => setTempSettings({...tempSettings, jr: {...tempSettings.jr!, swingKdThreshSell: parseFloat(e.target.value)||75}})} className="w-14 px-1 py-1 border rounded text-center"/>
                                      </div>
                                      <div className="flex items-center justify-between">
                                          <label className="text-slate-600 font-bold" title="賣點：多頭過熱RSI死叉">賣過熱RSI</label>
                                          <input type="number" value={tempSettings.jr?.swingJrRsiThreshSell ?? 70} onChange={e => setTempSettings({...tempSettings, jr: {...tempSettings.jr!, swingJrRsiThreshSell: parseFloat(e.target.value)||70}})} className="w-14 px-1 py-1 border rounded text-center"/>
                                      </div>
                                      <div className="flex items-center justify-between col-span-2 pt-1 mt-1 border-t border-indigo-200/50">
                                          <label className="text-slate-600 font-bold text-[11px]" title="跌破防守均線多少比例視為有效跌破並停損">跌穿均線停損比例 (預設:0.995)</label>
                                          <input type="number" step="0.001" value={tempSettings.jr?.swingMaStopLossDrop ?? 0.995} onChange={e => setTempSettings({...tempSettings, jr: {...tempSettings.jr!, swingMaStopLossDrop: parseFloat(e.target.value)||0.995}})} className="w-16 px-1 py-1 border rounded text-center font-mono"/>
                                      </div>
                                  </div>
                              </div>
                              )}
                          </div>
                       </div>
                    </div>
                 </div>
                 
                 <div className="space-y-3 pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">布林通道 (Bollinger Bands)</h4>
                    {tempSettings.bollinger && (
                        <div className="grid grid-cols-1 gap-3">
                            <div className="flex items-center gap-2 p-2 rounded-lg border border-slate-100">
                                <input type="checkbox" checked={tempSettings.bollinger.middle.visible} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, middle: {...tempSettings.bollinger!.middle, visible: e.target.checked}}})} className="w-4 h-4 rounded text-blue-600 cursor-pointer"/>
                                <input type="color" value={tempSettings.bollinger.middle.color} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, middle: {...tempSettings.bollinger!.middle, color: e.target.value}}})} className="w-6 h-6 p-0 border-0 rounded-full overflow-hidden cursor-pointer shadow-sm" title="點擊更換顏色"/>
                                <span className="text-xs font-bold text-slate-600 w-10">中線</span>
                                <input type="number" value={tempSettings.bollinger.middle.period} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, middle: {...tempSettings.bollinger!.middle, period: parseInt(e.target.value)||20}}})} className="w-12 px-1 py-1 text-sm font-bold text-center border-b outline-none"/>
                                <span className="text-xs text-slate-400">日</span>
                            </div>
                            <div className="flex items-center gap-2 p-2 rounded-lg border border-slate-100">
                                <input type="checkbox" checked={tempSettings.bollinger.upper1.visible} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, upper1: {...tempSettings.bollinger!.upper1, visible: e.target.checked}}})} className="w-4 h-4 rounded text-blue-600 cursor-pointer"/>
                                <input type="color" value={tempSettings.bollinger.upper1.color} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, upper1: {...tempSettings.bollinger!.upper1, color: e.target.value}}})} className="w-6 h-6 p-0 border-0 rounded-full overflow-hidden cursor-pointer shadow-sm" title="點擊更換顏色"/>
                                <span className="text-xs font-bold text-slate-600 w-10">上限1</span>
                                <span className="text-xs text-slate-400">SD</span>
                                <input type="number" step="0.1" value={tempSettings.bollinger.upper1.stdDev} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, upper1: {...tempSettings.bollinger!.upper1, stdDev: parseFloat(e.target.value)||2.0}}})} className="w-12 px-1 py-1 text-sm font-bold text-center border-b outline-none"/>
                            </div>
                            <div className="flex items-center gap-2 p-2 rounded-lg border border-slate-100">
                                <input type="checkbox" checked={tempSettings.bollinger.lower1.visible} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, lower1: {...tempSettings.bollinger!.lower1, visible: e.target.checked}}})} className="w-4 h-4 rounded text-blue-600 cursor-pointer"/>
                                <input type="color" value={tempSettings.bollinger.lower1.color} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, lower1: {...tempSettings.bollinger!.lower1, color: e.target.value}}})} className="w-6 h-6 p-0 border-0 rounded-full overflow-hidden cursor-pointer shadow-sm" title="點擊更換顏色"/>
                                <span className="text-xs font-bold text-slate-600 w-10">下限1</span>
                                <span className="text-xs text-slate-400">SD</span>
                                <input type="number" step="0.1" value={tempSettings.bollinger.lower1.stdDev} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, lower1: {...tempSettings.bollinger!.lower1, stdDev: parseFloat(e.target.value)||2.0}}})} className="w-12 px-1 py-1 text-sm font-bold text-center border-b outline-none"/>
                            </div>
                            <div className="flex items-center gap-2 p-2 rounded-lg border border-slate-100">
                                <input type="checkbox" checked={tempSettings.bollinger.upper2.visible} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, upper2: {...tempSettings.bollinger!.upper2, visible: e.target.checked}}})} className="w-4 h-4 rounded text-blue-600 cursor-pointer"/>
                                <input type="color" value={tempSettings.bollinger.upper2.color} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, upper2: {...tempSettings.bollinger!.upper2, color: e.target.value}}})} className="w-6 h-6 p-0 border-0 rounded-full overflow-hidden cursor-pointer shadow-sm" title="點擊更換顏色"/>
                                <span className="text-xs font-bold text-slate-600 w-10">上限2</span>
                                <span className="text-xs text-slate-400">SD</span>
                                <input type="number" step="0.1" value={tempSettings.bollinger.upper2.stdDev} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, upper2: {...tempSettings.bollinger!.upper2, stdDev: parseFloat(e.target.value)||2.5}}})} className="w-12 px-1 py-1 text-sm font-bold text-center border-b outline-none"/>
                            </div>
                            <div className="flex items-center gap-2 p-2 rounded-lg border border-slate-100">
                                <input type="checkbox" checked={tempSettings.bollinger.lower2.visible} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, lower2: {...tempSettings.bollinger!.lower2, visible: e.target.checked}}})} className="w-4 h-4 rounded text-blue-600 cursor-pointer"/>
                                <input type="color" value={tempSettings.bollinger.lower2.color} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, lower2: {...tempSettings.bollinger!.lower2, color: e.target.value}}})} className="w-6 h-6 p-0 border-0 rounded-full overflow-hidden cursor-pointer shadow-sm" title="點擊更換顏色"/>
                                <span className="text-xs font-bold text-slate-600 w-10">下限2</span>
                                <span className="text-xs text-slate-400">SD</span>
                                <input type="number" step="0.1" value={tempSettings.bollinger.lower2.stdDev} onChange={(e) => setTempSettings({...tempSettings, bollinger: {...tempSettings.bollinger!, lower2: {...tempSettings.bollinger!.lower2, stdDev: parseFloat(e.target.value)||2.5}}})} className="w-12 px-1 py-1 text-sm font-bold text-center border-b outline-none"/>
                            </div>
                        </div>
                    )}
                 </div>

                 <div className="space-y-3 pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">布林帶寬度 (BBW)</h4>
                    <div className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 hover:border-blue-200 transition-colors">
                        <input 
                            type="color" 
                            value={tempSettings.bbw?.color || '#3b82f6'} 
                            onChange={(e) => setTempSettings({
                                ...tempSettings, 
                                bbw: {
                                    ...(tempSettings.bbw || { period: 20, stdDev: 2.0, color: '#3b82f6', visible: false }), 
                                    color: e.target.value
                                }
                            })} 
                            className="w-6 h-6 p-0 border-0 rounded-full overflow-hidden cursor-pointer shadow-sm" 
                            title="點擊更換顏色"
                        />
                        <span className="text-xs font-bold text-slate-600 ml-1">參數</span>
                        <input 
                            type="number" 
                            value={tempSettings.bbw?.period || 20} 
                            onChange={(e) => setTempSettings({
                                ...tempSettings, 
                                bbw: {
                                    ...(tempSettings.bbw || { period: 20, stdDev: 2.0, color: '#3b82f6', visible: false }), 
                                    period: parseInt(e.target.value) || 20
                                }
                            })} 
                            className="w-12 px-1 py-1 text-sm font-bold text-center border-b border-transparent focus:border-blue-300 outline-none"
                            title="週期"
                        />
                        <span className="text-xs text-slate-400">日</span>
                        <input 
                            type="number" 
                            step="0.1"
                            value={tempSettings.bbw?.stdDev || 2.0} 
                            onChange={(e) => setTempSettings({
                                ...tempSettings, 
                                bbw: {
                                    ...(tempSettings.bbw || { period: 20, stdDev: 2.0, color: '#3b82f6', visible: false }), 
                                    stdDev: parseFloat(e.target.value) || 2.0
                                }
                            })} 
                            className="w-12 px-1 py-1 text-sm font-bold text-center border-b border-transparent focus:border-blue-300 outline-none ml-2"
                            title="標準差"
                        />
                        <span className="text-xs text-slate-400">SD</span>
                    </div>
                 </div>

                 <div className="space-y-3 pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Ruler size={14}/> 水平線設定</h4>
                        <button 
                            onClick={() => {
                                const newLines = [...(tempSettings.horizontalLines || [])];
                                newLines.push({ id: Date.now().toString(), value: 0, color: '#ef4444', style: 'solid', visible: true });
                                setTempSettings({ ...tempSettings, horizontalLines: newLines });
                            }}
                            className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-bold hover:bg-blue-100 flex items-center gap-1"
                        >
                            <Plus size={12}/> 新增
                        </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                        {tempSettings.horizontalLines?.map((line, idx) => (
                            <div key={line.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 hover:border-blue-200 transition-colors">
                                <input type="checkbox" checked={line.visible !== false} onChange={(e) => { const newLines = [...(tempSettings.horizontalLines || [])]; newLines[idx].visible = e.target.checked; setTempSettings({ ...tempSettings, horizontalLines: newLines }); }} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"/>
                                <input type="color" value={line.color} onChange={(e) => { const newLines = [...(tempSettings.horizontalLines || [])]; newLines[idx].color = e.target.value; setTempSettings({ ...tempSettings, horizontalLines: newLines }); }} className="w-6 h-6 p-0 border-0 rounded-full overflow-hidden cursor-pointer shadow-sm" title="點擊更換顏色"/>
                                <input type="number" value={line.value} onChange={(e) => { const newLines = [...(tempSettings.horizontalLines || [])]; newLines[idx].value = parseFloat(e.target.value) || 0; setTempSettings({ ...tempSettings, horizontalLines: newLines }); }} className="w-24 px-2 py-1 text-sm font-bold text-slate-700 outline-none border-b border-transparent focus:border-blue-300 text-center" placeholder="數值"/>
                                <select value={line.style} onChange={(e) => { const newLines = [...(tempSettings.horizontalLines || [])]; newLines[idx].style = e.target.value as any; setTempSettings({ ...tempSettings, horizontalLines: newLines }); }} className="bg-slate-50 border border-slate-200 text-xs font-bold px-2 py-1 rounded outline-none text-slate-600 cursor-pointer focus:border-blue-400 focus:bg-white transition-colors">
                                    <option value="solid">實線</option>
                                    <option value="dashed">虛線</option>
                                    <option value="dotted">點線</option>
                                </select>
                                <button onClick={() => { const newLines = tempSettings.horizontalLines?.filter(l => l.id !== line.id); setTempSettings({ ...tempSettings, horizontalLines: newLines }); }} className="ml-auto p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded"><X size={14}/></button>
                            </div>
                        ))}
                        {(!tempSettings.horizontalLines || tempSettings.horizontalLines.length === 0) && (
                            <div className="text-center py-4 text-slate-400 text-xs">尚未新增任何水平線</div>
                        )}
                    </div>
                 </div>

                 <div className="space-y-3 pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Lock size={14}/> Gemini API Key (AI 分析用)</h4>
                    <input 
                        type="password" 
                        value={tempApiKey} 
                        onChange={(e) => setTempApiKey(e.target.value)} 
                        placeholder="請輸入 Google Gemini API Key"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                    />
                    <p className="text-[10px] text-slate-400">金鑰將儲存於您的瀏覽器本地端，不會上傳至伺服器。</p>
                 </div>
              </div>
              <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                 <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg text-sm">取消</button>
                 <button onClick={handleSaveSettings} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg text-sm hover:bg-blue-700 shadow-md">儲存設定</button>
              </div>
           </div>
        </div>
      
  );
}
