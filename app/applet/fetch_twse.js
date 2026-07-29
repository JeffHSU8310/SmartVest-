const https = require('https');

https.get('https://mis.twse.com.tw/stock/data/all_etf.txt', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      console.log('Parsed successfully. Number of ETFs:', j?.a1?.length || j?.a?.length);
      console.log('Sample a1:', j.a1[0]);
    } catch(e) {
      console.log('Raw output:', data.substring(0, 500));
    }
  });
}).on('error', console.error);
