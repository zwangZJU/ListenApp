const http = require('http');
const url = 'http://127.0.0.1:8082/index.bundle?platform=android&dev=true&minify=false';
console.log('Fetching bundle...');
const start = Date.now();
http.get(url, (res) => {
  let size = 0;
  res.on('data', chunk => size += chunk.length);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('SIZE:', (size / 1024).toFixed(1) + 'KB');
    console.log('TIME:', (Date.now() - start) + 'ms');
  });
}).on('error', (err) => {
  console.log('ERROR:', err.message);
});
