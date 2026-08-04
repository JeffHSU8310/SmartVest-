import { useEffect, useRef } from "react";
import { Stock, Transaction, TransactionType, Account } from "../types";
import { fetchDcaPrice, fetchHistoricalPrice, generateId, withTimeout } from "../utils";

// Helper to get Taiwan date string YYYY-MM-DD
const getTaiwanDateString = (d: Date) => {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(d);
  } catch (e) {
    // Fallback if en-CA or timeZone fails
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
};

const formatLocalDate = (d: Date) => {
  return getTaiwanDateString(d);
};

// Helper to parse YYYY-MM-DD into a Date object at local midnight
const parseLocalDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const addBusinessDays = (dateStr: string, days: number) => {
  const d = parseLocalDate(dateStr);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      added++;
    }
  }
  return formatLocalDate(d);
};

const getNextBusinessDay = (dateStr: string) => {
  const d = parseLocalDate(dateStr);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return formatLocalDate(d);
};

export const useAutoDCA = (
  isInitialized: boolean,
  stocks: Stock[],
  transactions: Transaction[],
  accounts: Account[],
  onSaveTransaction: (tx: Transaction, stock?: Stock) => void,
  exchangeRate: number = 32.5,
) => {
  const processed = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isInitialized || stocks.length === 0 || accounts.length === 0) return;

    const runAutoDCA = async () => {
      const now = new Date();
      const todayStr = formatLocalDate(now);
      const todayObj = new Date(todayStr + "T00:00:00Z");

      const lookbackDays = 60;
      const lookbackDateObj = new Date(todayObj);
      lookbackDateObj.setDate(lookbackDateObj.getDate() - lookbackDays);

      for (const stock of stocks) {
        if (!stock.dcaSettings || stock.dcaSettings.length === 0) continue;

        for (const setting of stock.dcaSettings) {
          if (
            !setting.autoDeduct ||
            !setting.amount ||
            setting.dates.length === 0
          )
            continue;

          const requiredDates: string[] = [];
          for (
            let d = new Date(lookbackDateObj);
            d <= todayObj;
            d.setDate(d.getDate() + 1)
          ) {
            if (setting.dates.includes(d.getUTCDate())) {
              requiredDates.push(d.toISOString().split("T")[0]);
            }
          }

          for (const reqDateStr of requiredDates) {
            const targetDateStr = getNextBusinessDay(reqDateStr);

            // Time constraint: Execute at 10 AM local time on target date
            const now = new Date();
            const targetDateObjMatch = parseLocalDate(targetDateStr);
            const isToday =
              now.getFullYear() === targetDateObjMatch.getFullYear() &&
              now.getMonth() === targetDateObjMatch.getMonth() &&
              now.getDate() === targetDateObjMatch.getDate();

            if (isToday && now.getHours() < 10) {
              // It's today, but before 10 AM local time. Skip.
              continue;
            }

            if (targetDateStr <= todayStr) {
              const matchingTxs = transactions.filter(
                (t) =>
                  t.stockId === stock.id &&
                  t.accountId === setting.accountId &&
                  t.type === TransactionType.BUY &&
                  t.isDCA,
              );

              matchingTxs.sort((a, b) => {
                const targetDateObj = parseLocalDate(targetDateStr);
                const aDiff = Math.abs(
                  parseLocalDate(a.date).getTime() - targetDateObj.getTime(),
                );
                const bDiff = Math.abs(
                  parseLocalDate(b.date).getTime() - targetDateObj.getTime(),
                );
                return aDiff - bDiff;
              });

              let existingTx = matchingTxs.length > 0 ? matchingTxs[0] : undefined;

              if (existingTx) {
                  // Only consider it an existingTx for THIS targetDate if they are relatively close (within 5 days), OR if it explicitly matches.
                  // This prevents a single historical tx from matching all future target dates if no others exist.
                  const targetDateObj = parseLocalDate(targetDateStr);
                  const aDiff = Math.abs(parseLocalDate(existingTx.date).getTime() - targetDateObj.getTime()) / (1000 * 3600 * 24);
                  if (aDiff > 5) {
                      existingTx = undefined;
                  }
              }

              // Do not process or create any DCA for target dates before 2026-08-01
              if (targetDateStr < '2026-08-01') continue;

              if (!existingTx) {
                const cacheKey = `${stock.id}_${setting.accountId}_${targetDateStr}`;
                if (processed.current.has(cacheKey)) continue;
                processed.current.add(cacheKey);

                console.log(
                  `Auto DCA: Missing transaction for ${stock.ticker} scheduled for ${reqDateStr} -> executing on ${targetDateStr}. Fetching price...`,
                );

                let priceInfo = await withTimeout(fetchDcaPrice(
                  stock.ticker,
                  targetDateStr,
                ), 8000);

                const account = accounts.find(
                  (a) => a.id === setting.accountId,
                );
                const isUS = (stock.market as string) === "US" || stock.currency === "USD";

                let txExchangeRate = exchangeRate;
                if (isUS) {
                  try {
                    let prevDateObj = parseLocalDate(targetDateStr);
                    prevDateObj.setDate(prevDateObj.getDate() - 1);
                    const prevDateStr = formatLocalDate(prevDateObj);
                    const exRate = await withTimeout(fetchHistoricalPrice("TWD=X", prevDateStr), 8000);
                    if (exRate && exRate > 0) {
                      txExchangeRate = exRate;
                    }
                  } catch (e) {
                    console.warn("Failed to fetch exchange rate for auto DCA", e);
                  }
                }

                const isFund =
                  stock.market === "FUND" ||
                  (stock.category && stock.category.includes("基金")) ||
                  (account && account.name.includes("基富通"));

                if ((!priceInfo || priceInfo.price <= 0) && isFund) {
                  const isEst =
                    !stock.lastUpdateDate ||
                    stock.lastUpdateDate < targetDateStr;
                  priceInfo = {
                    price: stock.currentPrice || 10,
                    date: targetDateStr,
                    isEstimated: isEst,
                  };
                }

                if (priceInfo && priceInfo.price > 0) {
                  const price = priceInfo.price;
                  const amount = setting.amount;

                  let fee = 0;
                  let feeRate = "0.1";

                  let effectiveAmount = amount;
                  if (isUS) {
                    effectiveAmount = amount / txExchangeRate;
                    if (isFund) feeRate = "0";
                    else if (account?.name.includes("永豐")) feeRate = "0.01";
                    else if (account?.name.includes("凱基")) feeRate = "0.03";

                    fee = effectiveAmount * (parseFloat(feeRate) / 100);
                    if (
                      account?.name.includes("永豐") ||
                      account?.name.includes("凱基")
                    )
                      fee = parseFloat(feeRate);
                  } else {
                    if (isFund) fee = 0;
                    else fee = 1;
                  }

                  const principal = Math.max(0, effectiveAmount - fee);
                  const quantity = principal / price;

                  const txDateStr = targetDateStr;
                  const noteStr = priceInfo.isEstimated
                    ? "系統自動生成定期定額 (系統估算價)"
                    : "系統自動生成定期定額";

                  const newTx: Transaction = {
                    id: generateId(),
                    date: txDateStr,
                    accountId: setting.accountId,
                    stockId: stock.id,
                    type: TransactionType.BUY,
                    price: parseFloat(price.toFixed(4)),
                    quantity: parseFloat(quantity.toFixed(6)),
                    fee: isUS ? parseFloat(fee.toFixed(2)) : Math.round(fee),
                    tax: 0,
                    note: noteStr,
                    isDCA: true,
                    ...(isUS ? { exchangeRate: txExchangeRate } : {}),
                    settlementDate: isFund
                      ? txDateStr
                      : addBusinessDays(txDateStr, 2),
                  };

                  console.log(
                    `Auto DCA: Generated transaction for ${stock.ticker}`,
                    newTx,
                  );
                  alert(
                    `成功自動買進 ${stock.ticker}！價格: ${price}, 數量: ${quantity}`,
                  );
                  onSaveTransaction(newTx, stock);
                }
              } else {
                // existingTx found
                const needsDateFix = existingTx.date !== targetDateStr;
                const isEstimated =
                  existingTx.note && existingTx.note.includes("(系統估算價)");

                const account = accounts.find(
                  (a) => a.id === setting.accountId,
                );
                const isUS = (stock.market as string) === "US" || stock.currency === "USD";
                const isFund =
                  stock.market === "FUND" ||
                  (stock.category && stock.category.includes("基金")) ||
                  (account && account.name.includes("基富通"));

                const targetDateObjMatch = parseLocalDate(targetDateStr);
                const isRecent =
                  (todayObj.getTime() - targetDateObjMatch.getTime()) /
                    (1000 * 3600 * 24) <=
                  7;

                const isFundPriceOutdated =
                  isFund &&
                  isRecent &&
                  isEstimated && // ONLY update fund prices if they are still marked as estimated
                  stock.currentPrice &&
                  Math.abs(stock.currentPrice - existingTx.price) > 0.0001;

                const isTodayPriceOutdated =
                  targetDateStr === todayStr &&
                  isEstimated && // ONLY update if it was estimated, or if it's not a fund it might update during the day?
                  stock.currentPrice &&
                  Math.abs(stock.currentPrice - existingTx.price) > 0.0001;

                const principalUSD = existingTx.price * existingTx.quantity;
                const isWrongQuantity = isUS && Math.abs(principalUSD - setting.amount) < 5;

                if (targetDateStr < '2026-08-01') continue;
                // STRICT RULE: NEVER TOUCH ANY RECORD BEFORE 2026-08-01
                if (existingTx.date < '2026-08-01') continue;

                if (
                  needsDateFix ||
                  isEstimated ||
                  isFundPriceOutdated ||
                  isTodayPriceOutdated ||
                  isWrongQuantity
                ) {
                  const cacheKey = `update_${existingTx.id}_${stock.currentPrice || 0}_${stock.lastUpdateDate || ""}_${isEstimated}`;
                  if (processed.current.has(cacheKey)) continue;
                  processed.current.add(cacheKey);

                  console.log(
                    `Auto DCA: Checking if update needed for transaction ${existingTx.id} (Stock: ${stock.ticker}, Target: ${targetDateStr}, Current: ${existingTx.date}). Date mismatch: ${needsDateFix}, Estimated: ${isEstimated}`,
                  );

                  let priceInfo = await withTimeout(fetchDcaPrice(
                    stock.ticker,
                    targetDateStr,
                  ), 8000);

                  let txExchangeRate = exchangeRate;
                  if (isUS && !existingTx.exchangeRate) {
                    try {
                      let prevDateObj = parseLocalDate(targetDateStr);
                      prevDateObj.setDate(prevDateObj.getDate() - 1);
                      const prevDateStr = formatLocalDate(prevDateObj);
                      const exRate = await withTimeout(fetchHistoricalPrice("TWD=X", prevDateStr), 8000);
                    if (exRate && exRate > 0) {
                      txExchangeRate = exRate;
                    }
                    } catch (e) {
                      console.warn("Failed to fetch exchange rate for auto DCA update", e);
                    }
                  }

                  if ((!priceInfo || priceInfo.price <= 0) && isFund) {
                    // For funds, if we are checking an existing transaction, the user explicitly
                    // requested to remove the estimated tag when they update the stock prices.
                    // Because fund NAVs are usually delayed, stock.lastUpdateDate < targetDateStr
                    // is often true, which caused the tag to persist incorrectly.
                    let priceChanged = stock.currentPrice && Math.abs(stock.currentPrice - existingTx.price) > 0.0001;

                    // If the user just updated prices (stock.lastUpdateDate is today or newer),
                    // and the price didn't change, we should still remove the estimated tag.
                    let isEst = !stock.lastUpdateDate || stock.lastUpdateDate < targetDateStr;
                    if (priceChanged) isEst = false;

                    priceInfo = {
                      price: stock.currentPrice || (existingTx ? existingTx.price : 0),
                      date: targetDateStr,
                      isEstimated: isEst,
                    };
                  } else if (!priceInfo || priceInfo.price <= 0) {
                    if (needsDateFix) {
                      priceInfo = {
                        price: existingTx.price,
                        date: targetDateStr,
                        isEstimated: isEstimated,
                      };
                    }
                  }

                  if (priceInfo && priceInfo.price > 0) {
                    const price = priceInfo.price;
                    const amount = setting.amount;

                    let fee = 0;
                    let feeRate = "0.1";

                    let effectiveAmount = amount;
                    if (isUS) {
                      effectiveAmount = amount / txExchangeRate;
                      if (isFund) feeRate = "0";
                      else if (account?.name.includes("永豐")) feeRate = "0.01";
                      else if (account?.name.includes("凱基")) feeRate = "0.03";
                      fee = effectiveAmount * (parseFloat(feeRate) / 100);
                      if (
                        account?.name.includes("永豐") ||
                        account?.name.includes("凱基")
                      )
                        fee = parseFloat(feeRate);
                    } else {
                      if (isFund) fee = 0;
                      else fee = 1;
                    }

                    const principal = Math.max(0, effectiveAmount - fee);
                    const quantity = principal / price;

                    const noteStr = priceInfo.isEstimated
                      ? "系統自動生成定期定額 (系統估算價)"
                      : "系統自動生成定期定額";

                    // Update if it was estimated and now we have a real price, or if we need to fix the date
                    if (
                      needsDateFix ||
                      (!priceInfo.isEstimated && isEstimated) ||
                      isFundPriceOutdated ||
                      isTodayPriceOutdated ||
                      isWrongQuantity
                    ) {
                      const updatedTx: Transaction = {
                        ...existingTx,
                        date: targetDateStr,
                        price: parseFloat(price.toFixed(4)),
                        quantity: parseFloat(quantity.toFixed(6)),
                        fee: isUS
                          ? parseFloat(fee.toFixed(2))
                          : Math.round(fee),
                        note: noteStr,
                        ...(isUS && !existingTx.exchangeRate ? { exchangeRate: txExchangeRate } : {}),
                        settlementDate: isFund
                          ? targetDateStr
                          : addBusinessDays(targetDateStr, 2),
                      };
                      console.log(
                        `Auto DCA: Updated transaction for ${stock.ticker}`,
                        updatedTx,
                      );
                      alert(
                        `自動定期定額更新：將 ${stock.ticker} 原本 ${existingTx.date} 的紀錄更新至 ${targetDateStr}`,
                      );
                      onSaveTransaction(updatedTx, stock);
                    }
                  }
                }
              }
            }
          }
        }
      }
    };

    runAutoDCA();
  }, [isInitialized, stocks, transactions, accounts, onSaveTransaction, exchangeRate]);
};
