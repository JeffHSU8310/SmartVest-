const fs = require('fs');
let c = fs.readFileSync('components/StockScreener.tsx', 'utf8');
c = c.replace(/===  uy/g, "=== 'buy'");
fs.writeFileSync('components/StockScreener.tsx', c);
