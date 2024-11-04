require('dotenv').config();
const DiscordNotifier = require('./discordNotifier');
const discord = new DiscordNotifier(process.env.DISCORD_WEBHOOK_URL);

const BASE_URL = 'https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql';
const SECURITY_TOKEN_BASE = 'https://ebcec29959ba.abf8e894.us-east-1.token.awswaf.com/ebcec29959ba';
const readline = require('readline');
const https = require('https');

// Helper function to convert zip to coordinates
async function getCoordinatesFromZip(zipCode) {
    return new Promise((resolve, reject) => {
        https.get(`https://api.zippopotam.us/us/${zipCode}`, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result?.places?.[0]) {
                        resolve({
                            lat: parseFloat(result.places[0].latitude),
                            lng: parseFloat(result.places[0].longitude)
                        });
                    } else {
                        reject(new Error('Invalid ZIP code'));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

// Replace getUserInput function with this
function getSearchParameters() {
    return {
        zipCode: process.env.ZIP_CODE || '11001',
        distance: parseInt(process.env.SEARCH_RADIUS) || 50,
        pageSize: parseInt(process.env.PAGE_SIZE) || 5
    };
}

// Log new job to console
function logNewJob(job) {
    const colors = {
        reset: '\x1b[0m',
        bright: '\x1b[1m',
        green: '\x1b[32m',
        blue: '\x1b[34m',
        yellow: '\x1b[33m'
    };

    console.log('\n' + '='.repeat(50));
    console.log(`${colors.bright}🔔 NEW JOB ALERT!${colors.reset}`);
    console.log('-'.repeat(50));
    console.log(`${colors.bright}📋 Position:${colors.reset} ${job.title}`);
    console.log(`${colors.bright}📍 Location:${colors.reset} ${job.location}`);
    console.log(`${colors.bright}🚗 Distance:${colors.reset} ${job.distanceDisplay}`);
    console.log(`${colors.bright}🔗 URL:${colors.reset} ${job.jobUrl}`);
    
    if (job.shifts && job.shifts.length > 0) {
        console.log(`\n${colors.bright}📅 Shift Details:${colors.reset}`);
        job.shifts.forEach((shift, index) => {
            console.log(`\n${colors.blue}Shift ${index + 1}:${colors.reset}`);
            console.log(`  • Schedule: ${shift.schedule}`);
            console.log(`  • Hours/Week: ${shift.hoursPerWeek}`);
            console.log(`  • Pay Rate: ${colors.green}${shift.totalPay}${colors.reset}`);
            console.log(`  • Weekly Pay: ${colors.green}${shift.weeklyPay}${colors.reset}`);
            if (shift.signOnBonus) {
                console.log(`  • ${colors.yellow}Sign-on Bonus: ${shift.signOnBonus}${colors.reset}`);
            }
        });
    }
    console.log('='.repeat(50) + '\n');
}

// Monitor jobs periodically
async function monitorJobs(coordinates, userInput) {
    const timestamp = () => {
        return new Date().toLocaleString('en-US', { 
            hour12: true,
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        });
    };

    console.log('\n🔍 Starting job monitor...');
    console.log(`📍 Monitoring jobs within ${userInput.distance} miles of ${userInput.zipCode}`);
    console.log('⏰ Checking for new jobs every 3 minutes...\n');
    
    const jobSearch = new AmazonJobSearch();
    let knownJobIds = new Set();
    
    await jobSearch.getSecurityToken();

    async function checkJobs() {
        try {
            await discord.sendStatusUpdate('Checking for new jobs...', 'info');
            console.log(`\n[${timestamp()}] Checking for jobs...`);
            const today = new Date().toISOString().split('T')[0];
            const jobs = await jobSearch.searchSchedules({
                lat: coordinates.lat,
                lng: coordinates.lng,
                distance: userInput.distance,
                pageSize: userInput.pageSize,
                startDate: today
            });

            console.log(`[${timestamp()}] Found ${jobs.length} total jobs\n`);

            // Always show all available jobs
            console.log('📋 Current Available Jobs:');
            console.log('='.repeat(50));
            
            for (const [index, job] of jobs.entries()) {
                const isNew = !knownJobIds.has(job.jobId.id);
                if (isNew) {
                    knownJobIds.add(job.jobId.id);
                    await discord.sendJobNotification(job, true);
                } else {
                    await discord.sendJobNotification(job, false);
                }
                
                console.log(`\nJob ${index + 1} of ${jobs.length}${isNew ? ' 🆕 NEW!' : ''}`);
                logNewJob(job);
            }

            // Clean up old job IDs after 24 hours
            const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
            knownJobIds = new Set([...knownJobIds].filter(id => 
                typeof id === 'object' ? id.timestamp > twentyFourHoursAgo : true
            ));

        } catch (error) {
            console.error(`[${timestamp()}] ❌ Error:`, error.message);
            await discord.sendErrorNotification(error);
            if (error.message.includes('token')) {
                try {
                    console.log(`[${timestamp()}] 🔄 Refreshing security token...`);
                    await jobSearch.getSecurityToken();
                } catch (tokenError) {
                    console.error(`[${timestamp()}] ❌ Token refresh failed:`, tokenError.message);
                }
            }
        }
    }

    await checkJobs();
    return setInterval(checkJobs, 3 * 60 * 1000); // Check every 3 minutes
}

// Main class for Amazon job search
class AmazonJobSearch {
    constructor() {
        this.securityToken = null;

        // Headers that mimic a web browser request
        // These are important to avoid being detected as a bot
        this.headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'content-type': 'application/json',
            'country': 'United States',
            'iscanary': 'false',
            'origin': 'https://hiring.amazon.com',
            'referer': 'https://hiring.amazon.com/',
            // Browser identification headers
            'sec-ch-ua': '"Chromium";v="130", "Brave";v="130", "Not?A_Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site'
        };
    }

    // Security-related methods for token generation
    generateSignals() {
        // Generate security signals required by Amazon's API
        return [{
            name: 'KramerAndRio',
            value: {
                Present: this.generateBrowserFingerprint()
            }
        }];
    }

    generateMetrics() {
        // Generate metrics required for security verification
        // These values are part of Amazon's security requirements
        return [
            { name: '2', value: 0.3, unit: '2' },
            { name: '100', value: 1, unit: '2' },
            { name: '101', value: 0, unit: '2' }
        ];
    }

    generateBrowserFingerprint() {
        // Create a unique browser fingerprint
        // This helps Amazon identify the client making the request
        return Buffer.from(JSON.stringify({
            userAgent: this.headers['sec-ch-ua'],
            platform: this.headers['sec-ch-ua-platform'],
            language: this.headers['accept-language'],
            timestamp: new Date().getTime()
        })).toString('base64');
    }

    // ... keeping all security-related methods from amazonJobs.js ...
    async getSecurityToken() {
        try {
            // Step 1: Get the security challenge from Amazon
            const challengeResponse = await fetch(`${SECURITY_TOKEN_BASE}/inputs?client=browser`, {
                headers: {
                    'accept': '*/*',
                    'sec-fetch-mode': 'cors',
                    'referer': 'https://hiring.amazon.com/'
                },
                method: 'GET',
                credentials: 'omit'
            });

            const challenge = await challengeResponse.json();

            // Step 2: Solve the challenge and get verification token
            const verifyResponse = await fetch(`${SECURITY_TOKEN_BASE}/verify`, {
                method: 'POST',
                headers: {
                    'content-type': 'text/plain;charset=UTF-8',
                    'referer': 'https://hiring.amazon.com/'
                },
                body: JSON.stringify({
                    challenge,
                    client: 'Browser',
                    domain: 'hiring.amazon.com',
                    signals: this.generateSignals(),    // Browser fingerprint
                    metrics: this.generateMetrics()     // Required metrics
                }),
                credentials: 'omit'
            });

            // Store and return the security token
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
            // Ensure we have a valid security token
            if (!this.securityToken) {
                await this.getSecurityToken();
            }

            // Step 1: Search for available jobs
            const jobSearchRequest = {
                operationName: "searchJobCardsByLocation",
                variables: {
                    searchJobRequest: {
                        locale: "en-US",
                        country: "United States",
                        pageSize: params.pageSize || 5,
                        geoQueryClause: {
                            lat: params.lat || 40.702514,      // Default to New York area
                            lng: params.lng || -73.703361,
                            unit: "mi",
                            distance: params.distance || 50     // Search radius in miles
                        }
                    }
                },
                // GraphQL query to get job details
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

            // Make the job search request
            const jobResponse = await fetch(BASE_URL, {
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

            // Extract job cards from response
            const jobs = jobData.data?.searchJobCardsByLocation?.jobCards || [];
            const results = [];

            // Step 2: Get schedules for each job
            for (const job of jobs) {
                // Create schedule search request for this job
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
                    // GraphQL query to get schedule details
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

                // Get schedules for this job
                const scheduleResponse = await fetch(BASE_URL, {
                    method: 'POST',
                    headers: {
                        ...this.headers,
                        'authorization': `Bearer ${this.securityToken}`
                    },
                    body: JSON.stringify(scheduleRequest)
                });

                const scheduleData = await scheduleResponse.json();
                
                // Add job and its schedules to results if no errors
                if (!scheduleData.errors) {
                    results.push({
                        jobInfo: job,
                        schedules: scheduleData.data?.searchScheduleCards?.scheduleCards || []
                    });
                }

                // Add delay between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Format and return the final results
            return this.formatResults(results);
        } catch (error) {
            console.error('Error fetching data:', error);
            throw error;
        }
    }

    formatResults(results) {
        const formattedResults = results.map(result => ({
            jobId: {
                id: result.jobInfo.jobId,
                timestamp: Date.now()
            },
            jobUrl: `https://hiring.amazon.com/app#/jobDetail?jobId=${result.jobInfo.jobId}&locale=en-US&recommended=1`,
            title: result.jobInfo.jobTitle,
            location: `${result.jobInfo.city}, ${result.jobInfo.state} ${result.jobInfo.postalCode}`,
            distance: result.jobInfo.distance || Infinity,
            distanceDisplay: `${result.jobInfo.distance?.toFixed(1) || 'N/A'} miles`,
            shifts: result.schedules.map(schedule => {
                const payRate = parseFloat(schedule.totalPayRateL10N?.match(/\d+\.\d+/)?.[0] || 0);
                const hoursPerWeek = schedule.hoursPerWeek || 0;
                
                // Calculate weekly salary
                const weeklyPay = (payRate * hoursPerWeek).toFixed(2);

                return {
                    schedule: schedule.scheduleText,
                    hoursPerWeek: schedule.hoursPerWeek,
                    basePay: schedule.basePayL10N,
                    totalPay: schedule.totalPayRateL10N,
                    weeklyPay: weeklyPay > 0 ? `$${weeklyPay}` : 'Not available',
                    signOnBonus: schedule.signOnBonusL10N,
                    employmentType: schedule.employmentType,
                    startDate: schedule.firstDayOnSite
                };
            })
        }));

        // Sort by distance
        return formattedResults.sort((a, b) => a.distance - b.distance);
    }
}

// Main function to execute the job search
async function displayJobs() {
    try {
        console.log('Amazon Job Search Monitor\n');
        
        // Get parameters from environment variables
        const searchParams = getSearchParameters();
        
        // Convert ZIP to coordinates
        const coordinates = await getCoordinatesFromZip(searchParams.zipCode);
        
        // Start monitoring
        const monitor = await monitorJobs(coordinates, searchParams);

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\nStopping job monitor...');
            clearInterval(monitor);
            process.exit(0);
        });

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Start the job search
displayJobs();

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
    process.exit(1);
});