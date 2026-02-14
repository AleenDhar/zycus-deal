const https = require('https');

const url = 'https://wfwgatyfzqzrcauatufb.supabase.co';

console.log(`Testing connection to ${url}...`);

const req = https.get(url, (res) => {
    console.log('StatusCode:', res.statusCode);
    console.log('Headers:', res.headers);

    res.on('data', (d) => {
        // just consume data
    });

    res.on('end', () => {
        console.log('Response ended. Connection successful.');
    });
});

req.on('error', (e) => {
    console.error('Connection failed:', e);
});

req.end();
