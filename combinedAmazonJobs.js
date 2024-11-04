const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Create a custom agent for HTTPS
const httpsAgent = new https.Agent({
    proxy: 'http://127.0.0.1:8888',
    rejectUnauthorized: false
});

class AmazonJobSearch {
    constructor() {
        // ... existing constructor code ...

        // Modify fetch calls to use the agent
        this.fetchOptions = {
            agent: httpsAgent,
            headers: this.headers
        };
    }

    async monitoredFetch(url, options) {
        const finalOptions = {
            ...options,
            agent: httpsAgent,
        };

        return await fetch(url, finalOptions);
    }
} 