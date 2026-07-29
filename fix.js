const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

const replacement = `
        settings.forEach(setting => {
            let targetAccount = accounts.find(a => a.id === setting.accountId);
            let targetAccountId = setting.accountId;
            if (!targetAccount || targetAccountId === 'UNASSIGNED') {
                targetAccount = accounts.find(a => a.isSecurities && !a.excludeFromTotals);
                if (targetAccount) targetAccountId = targetAccount.id;
                else return; 
            }

            setting.dates.forEach(dcaDay => {
               if (currentDay >= dcaDay) {
                  const txDate = \`\${currentYear}-\${currentMonth.toString().padStart(2, '0')}-\${dcaDay.toString().padStart(2, '0')}\`;
                  
                  // Enforce minimum start date of 2026-07-20 as requested
                  if (txDate < '2026-07-20') return;
                  if (autoSyncStartDate && txDate < autoSyncStartDate) return;

                  const existingStockTx = transactions.find(tx => 
                       tx.stockId === stock.id && 
                       tx.accountId === targetAccountId &&
                      tx.date === txDate &&
                      tx.isDCA === true
                  );
                  
                  const isUS = stock.currency === "USD" || (stock.market === Market.US && !stock.currency);
                  let totalAmount = Math.round(isUS ? amountPerDeduction * exchangeRate : amountPerDeduction);
                  
                  let targetCashAccountId = targetAccount!.linkedCashAccountId || targetAccount!.id;
                  let targetCashAccountName = targetAccount!.name;

                  if (!existingStockTx) {
                      const price = stock.currentPrice || stock.nav || 1;
                      const quantity = amountPerDeduction / price;
                      
                      const txId = generateId();
                      newStockTxs.push({
                          id: txId,
                          date: txDate,
                          settlementDate: txDate,
                          accountId: targetAccountId,
                          stockId: stock.id,
                          type: TransactionType.BUY,
                          price: price,
                          quantity: quantity,
                          isDCA: true,
                          note: '定期定額自動買進'
                      });

                      newCashTxs.push({
                          id: generateId(),
                          date: txDate,
                          accountId: targetCashAccountId,
                          type: "WITHDRAWAL",
                          amount: totalAmount,
                          currency: "TWD",
                          category: \`買進 \${stock.ticker}\`,
                          note: \`買進 \${stock.name} (自動)\`,
                          sourceTransactionId: txId,
                      });

                      newHouseTxs.push({
                          id: generateId(),
                          date: txDate,
                          accountId: targetCashAccountName,
                          type: "WITHDRAWAL",
                          amount: totalAmount,
                          currency: "TWD",
                          category: "投資支出",
                          note: \`買進 \${stock.name} (自動) - 連動\`,
                          sourceTransactionId: txId,
                      });
                  } else {
                      // Self-healing: if stock tx exists but cash/house txs are missing, add them
                      const cashExists = cashTransactions.some(c => c.sourceTransactionId === existingStockTx.id);
                      if (!cashExists) {
                          newCashTxs.push({
                              id: generateId(),
                              date: txDate,
                              accountId: targetCashAccountId,
                              type: "WITHDRAWAL",
                              amount: totalAmount,
                              currency: "TWD",
                              category: \`買進 \${stock.ticker}\`,
                              note: \`買進 \${stock.name} (自動)\`,
                              sourceTransactionId: existingStockTx.id,
                          });
                      }

                      const houseExists = householdTransactions.some(h => h.sourceTransactionId === existingStockTx.id);
                      if (!houseExists) {
                          newHouseTxs.push({
                              id: generateId(),
                              date: txDate,
                              accountId: targetCashAccountName,
                              type: "WITHDRAWAL",
                              amount: totalAmount,
                              currency: "TWD",
                              category: "投資支出",
                              note: \`買進 \${stock.name} (自動) - 連動\`,
                              sourceTransactionId: existingStockTx.id,
                          });
                      }
                  }
               }
            });
        });
      }
    });

    if (newStockTxs.length > 0 || newCashTxs.length > 0 || newHouseTxs.length > 0) {
       if (newStockTxs.length > 0) setTransactions(prev => [...prev, ...newStockTxs]);
       if (newCashTxs.length > 0) setCashTransactions(prev => [...prev, ...newCashTxs]);
       if (newHouseTxs.length > 0) setHouseholdTransactions(prev => [...prev, ...newHouseTxs]);
    }
  }, [stocks, transactions, cashTransactions, householdTransactions, isInitialized, accounts, autoSyncStartDate, exchangeRate]);
`;

// Now find the start and end indices of the block to replace
const startIndex = content.indexOf('        settings.forEach(setting => {');
const endIndex = content.indexOf('  // Helper function for saving data (used in useEffect and initial load)');

if (startIndex !== -1 && endIndex !== -1) {
    content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
    fs.writeFileSync('App.tsx', content);
    console.log("Fixed!");
} else {
    console.log("Could not find start or end index.");
}
