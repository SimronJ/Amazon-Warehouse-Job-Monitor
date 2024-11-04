const tunnel = require('tunnel');

const BASE_URL = 'https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql';
const SECURITY_TOKEN_BASE = 'https://ebcec29959ba.abf8e894.us-east-1.token.awswaf.com/ebcec29959ba';

class AmazonJobSearch {
    constructor() {
        this.securityToken = null;
        this.headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'content-type': 'application/json',
            'country': 'United States',
            'iscanary': 'false',
            'origin': 'https://hiring.amazon.com',
            'referer': 'https://hiring.amazon.com/',
            'sec-ch-ua': '"Chromium";v="130", "Brave";v="130", "Not?A_Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site'
        };

        // Create tunneling agent for Charles Proxy
        this.tunnelingAgent = tunnel.httpsOverHttp({
            proxy: {
                host: '127.0.0.1',
                port: 8888
            },
            ca: [],
            rejectUnauthorized: false
        });

         // Disable certificate validation globally
         process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        // Add debug mode
        this.debug = true;
    }

    async monitoredFetch(url, options) {
        if (this.debug) {
            console.log('\n=== REQUEST ===');
            console.log('URL:', url);
            console.log('Headers:', JSON.stringify(options.headers, null, 2));
            console.log('Method:', options.method);
            if (options.body) {
                console.log('Body:', JSON.stringify(JSON.parse(options.body), null, 2));
            }
        }

        try {
            const finalOptions = {
                ...options,
                agent: this.tunnelingAgent,
                rejectUnauthorized: false,
                strictSSL: false
            };

            const response = await fetch(url, finalOptions);
            
            if (this.debug) {
                console.log('\n=== RESPONSE ===');
                console.log('Status:', response.status);
                console.log('Status Text:', response.statusText);
                console.log('Headers:', response.headers);
            }

            // Clone the response before reading it
            const responseClone = response.clone();
            const responseData = await responseClone.text();

            if (this.debug) {
                try {
                    console.log('Response Data:', JSON.stringify(JSON.parse(responseData), null, 2));
                } catch (e) {
                    console.log('Raw Response:', responseData);
                }
            }

            return response;
        } catch (error) {
            console.error('\n=== ERROR ===');
            console.error('Failed to fetch:', url);
            console.error('Error details:', error);
            throw error;
        }
    }

    // ... keeping all security-related methods from amazonJobs.js ...
    generateSignals() {
        return [{
            name: 'KramerAndRio',
            value: {
                Present: this.generateBrowserFingerprint()
            }
        }];
    }
    generateMetrics() {
        return [
            { name: '2', value: 0.3, unit: '2' },
            { name: '100', value: 1, unit: '2' },
            { name: '101', value: 0, unit: '2' }
        ];
    }
    generateBrowserFingerprint() {
        return Buffer.from(JSON.stringify({
            userAgent: this.headers['sec-ch-ua'],
            platform: this.headers['sec-ch-ua-platform'],
            language: this.headers['accept-language'],
            timestamp: new Date().getTime()
        })).toString('base64');
    }
    
    async getSecurityToken() {
        try {
            const challengeResponse = await this.monitoredFetch(`${SECURITY_TOKEN_BASE}/inputs?client=browser`, {
                headers: {
                    'accept': '*/*',
                    'sec-fetch-mode': 'cors',
                    'referer': 'https://hiring.amazon.com/'
                },
                method: 'GET',
                credentials: 'omit'
            });

            const challenge = await challengeResponse.json();

            const verifyResponse = await this.monitoredFetch(`${SECURITY_TOKEN_BASE}/verify`, {
                method: 'POST',
                headers: {
                    'content-type': 'text/plain;charset=UTF-8',
                    'referer': 'https://hiring.amazon.com/'
                },
                body: JSON.stringify({
                    challenge,
                    client: 'Browser',
                    domain: 'hiring.amazon.com',
                    signals: this.generateSignals(),
                    metrics: this.generateMetrics()
                }),
                credentials: 'omit'
            });

            const verification = await verifyResponse.json();
            this.securityToken = verification.token;
            return verification.token;
        } catch (error) {
            console.error('Error getting security token:', error);
            throw error;
        }
    }

    async searchSchedules(params = {}) {
        try {
            if (!this.securityToken) {
                await this.getSecurityToken();
            }

            // First, search for jobs
            const jobSearchRequest = {
                operationName: "searchJobCardsByLocation",
                variables: {
                    searchJobRequest: {
                        locale: "en-US",
                        country: "United States",
                        pageSize: params.pageSize || 5,
                        geoQueryClause: {
                            lat: params.lat || 40.702514,
                            lng: params.lng || -73.703361,
                            unit: "mi",
                            distance: params.distance || 50
                        }
                    }
                },
                query: `
                    query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
                        searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
                            jobCards {
                                jobId
                                jobTitle
                                city
                                state
                                postalCode
                                totalPayRateMin
                                totalPayRateMax
                                scheduleCount
                                employmentType
                                distance
                                bonusJob
                                bonusPay
                                currencyCode
                            }
                        }
                    }
                `
            };

            const jobResponse = await this.monitoredFetch(BASE_URL, {
                method: 'POST',
                headers: {
                    ...this.headers,
                    'authorization': `Bearer ${this.securityToken}`
                },
                body: JSON.stringify(jobSearchRequest)
            });

            const jobData = await jobResponse.json();
            
            if (jobData.errors) {
                throw new Error('Job Search API returned errors');
            }

            const jobs = jobData.data?.searchJobCardsByLocation?.jobCards || [];
            const results = [];

            // Now get schedules for each job
            for (const job of jobs) {
                const scheduleRequest = {
                    operationName: "searchScheduleCards",
                    variables: {
                        searchScheduleRequest: {
                            locale: "en-US",
                            country: "United States",
                            pageSize: 100,
                            geoQueryClause: {
                                lat: params.lat || 40.702514,
                                lng: params.lng || -73.703361,
                                unit: "mi",
                                distance: 100
                            },
                            dateFilters: [{
                                key: "firstDayOnSite",
                                range: {
                                    startDate: params.startDate || "2024-11-02"
                                }
                            }],
                            jobId: job.jobId
                        }
                    },
                    query: `
                        query searchScheduleCards($searchScheduleRequest: SearchScheduleRequest!) {
                            searchScheduleCards(searchScheduleRequest: $searchScheduleRequest) {
                                scheduleCards {
                                    scheduleText
                                    basePayL10N
                                    totalPayRateL10N
                                    signOnBonusL10N
                                    hoursPerWeek
                                    employmentType
                                    firstDayOnSite
                                }
                            }
                        }
                    `
                };

                const scheduleResponse = await this.monitoredFetch(BASE_URL, {
                    method: 'POST',
                    headers: {
                        ...this.headers,
                        'authorization': `Bearer ${this.securityToken}`
                    },
                    body: JSON.stringify(scheduleRequest)
                });

                const scheduleData = await scheduleResponse.json();
                
                if (!scheduleData.errors) {
                    results.push({
                        jobInfo: job,
                        schedules: scheduleData.data?.searchScheduleCards?.scheduleCards || []
                    });
                }

                await new Promise(resolve => setTimeout(resolve, 500));
            }

            return this.formatResults(results);
        } catch (error) {
            console.error('Error fetching data:', error);
            throw error;
        }
    }

    formatResults(results) {
        return results.map(result => ({
            jobId: result.jobInfo.jobId,
            jobUrl: `https://hiring.amazon.com/app#/jobDetail?jobId=${result.jobInfo.jobId}&locale=en-US&recommended=1`,
            title: result.jobInfo.jobTitle,
            location: `${result.jobInfo.city}, ${result.jobInfo.state} ${result.jobInfo.postalCode}`,
            distance: `${result.jobInfo.distance?.toFixed(1) || 'N/A'} miles`,
            shifts: result.schedules.map(schedule => ({
                schedule: schedule.scheduleText,
                hoursPerWeek: schedule.hoursPerWeek,
                basePay: schedule.basePayL10N,
                totalPay: schedule.totalPayRateL10N,
                signOnBonus: schedule.signOnBonusL10N,
                employmentType: schedule.employmentType,
                startDate: schedule.firstDayOnSite
            }))
        }));
    }
}

async function displayJobs() {
    try {
        console.log('Starting job search...');
        const jobSearch = new AmazonJobSearch();
        
        console.log('Getting security token...');
        await jobSearch.getSecurityToken();
        
        console.log('Searching for jobs...');
        const jobs = await jobSearch.searchSchedules({
            lat: 40.702514,
            lng: -73.703361,
            distance: 50,
            pageSize: 5,
            startDate: "2024-11-02"
        });

        if (jobs.length === 0) {
            console.log('No jobs found in the specified area.');
            return;
        }

        console.log(`Found ${jobs.length} jobs:\n`);
        jobs.forEach((job, jobIndex) => {
            console.log(`================================================================================`);
            console.log(`[Job ${jobIndex + 1}]`);
            console.log(`Position: ${job.title}`);
            console.log(`Location: ${job.location}`);
            console.log(`Distance: ${job.distance}`);
            console.log(`Job URL: ${job.jobUrl}`);
            
            if (job.shifts && job.shifts.length > 0) {
                console.log('\nAvailable Shifts:');
                job.shifts.forEach((shift, shiftIndex) => {
                    console.log(`\n  Shift ${shiftIndex + 1}:`);
                    console.log(`  │ Schedule: ${shift.schedule}`);
                    console.log(`  │ Hours/Week: ${shift.hoursPerWeek}`);
                    console.log(`  │ Base Pay: ${shift.basePay}`);
                    console.log(`  │ Total Pay: ${shift.totalPay}`);
                    if (shift.signOnBonus) {
                        console.log(`  │ Sign-on Bonus: ${shift.signOnBonus}`);
                    }
                    console.log(`  │ Employment Type: ${shift.employmentType}`);
                    console.log(`  │ Start Date: ${shift.startDate}`);
                });
            } else {
                console.log('\nNo shifts currently available for this position.');
            }
            console.log('');
        });
        console.log(`================================================================================`);
    } catch (error) {
        console.error('\n=== FATAL ERROR ===');
        console.error('Error details:', error);
        console.error('Stack trace:', error.stack);
    }
}

// Run with more detailed error handling
displayJobs().catch(error => {
    console.error('Unhandled error in main execution:', error);
    process.exit(1);
});


// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
    process.exit(1);
});