const http = require('http');
http.get('http://127.0.0.1:8082/status', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', data);
  });
}).on('error', (err) => {
  console.log('ERROR:', err.message);
});
