const fs = require('fs');

let c = fs.readFileSync('components/StockScreener.tsx', 'utf8');

c = c.replace(
`      if (config.minEps) {
        const val = parseFloat(config.minEps);
        if (stock.eps == null || isNaN(stock.eps) || stock.eps < val)
          return false;
      }`,
`      if (config.minEps !== "") {
        const val = parseFloat(config.minEps);
        const epsVal = (stock.eps == null || isNaN(stock.eps)) ? 0 : Number(stock.eps);
        if (!isNaN(val) && epsVal < val) {
          return false;
        }
      }`
);

c = c.replace('EPS 大於', 'EPS (近四季) 大於');

const oldInputEnd = `className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />`;
const newInputEnd = `className="w-full border border-slate-200 rounded-md p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">預期為近四季 TTM 的總和，若缺值則用 本益比 x 股價 估算。</p>`;
c = c.replace(oldInputEnd, newInputEnd);

const oldYahoo = `            if (yInfo.epsTrailingTwelveMonths != null) {
              stock.eps = yInfo.epsTrailingTwelveMonths;
            } else if (yInfo.epsCurrentYear != null) {
              stock.eps = yInfo.epsCurrentYear;
            } else if (stock.pe > 0 && stock.price > 0) {
              stock.eps = stock.price / stock.pe;
            }`;

const newYahoo = `            if (yInfo.epsTrailingTwelveMonths != null) {
              stock.eps = Number(yInfo.epsTrailingTwelveMonths);
            } else if (yInfo.epsCurrentYear != null) {
              stock.eps = Number(yInfo.epsCurrentYear);
            } else if (stock.pe > 0 && stock.price > 0) {
              stock.eps = stock.price / stock.pe;
            }`;

c = c.replace(oldYahoo, newYahoo);

fs.writeFileSync('components/StockScreener.tsx', c);
console.log("Replaced:", c.includes("EPS (近四季) 大於"));
