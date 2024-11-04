const fetch = require('node-fetch');

class AmazonJobSearch {
    constructor() {
        this.baseUrl = 'https://e5mquma77feepi2bdn4d6h3mpu.appsync-api.us-east-1.amazonaws.com/graphql';
    }

    async searchSchedules(params) {
        const headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'authorization': 'Bearer Status|unauthenticated|Session|eyJhbGciOiJLTVMiLCJ0eXAiOiJKV1QifQ.eyJpYXQiOjE3MzA1ODg2MDYsImV4cCI6MTczMDU5MjIwNn0.AQICAHgz1m58+e586dZFf4bchvbbMWCAcCXZvg9CS5F50i9DfAFQgrnVzkWyV2EigH0RWwpiAAAAtDCBsQYJKoZIhvcNAQcGoIGjMIGgAgEAMIGaBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDGhJLfyK3aIgj8f6SAIBEIBt4rF+WLE2DLniWcxolUxNqvvxrWyw8BuWLnkIyRl92aQ5htfwtGUHPS5Ry5aQNCgdlttDW8Klc0S2n+E9LHPNOpfzayOBd0f8T6SVsO7o5bjK/6sFFNwUIg+nOpO/Q1TYsCJmecaaU9aw5gSvGA==',
            'content-type': 'application/json',
            'country': 'United States',
            'iscanary': 'false',
            'origin': 'https://hiring.amazon.com',
            'referer': 'https://hiring.amazon.com/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        };

        // First, let's get all available jobs
        const jobSearchRequest = {
            operationName: "searchJobCardsByLocation",
            variables: {
                searchJobRequest: {
                    locale: "en-US",
                    country: "United States",
                    pageSize: 5,
                    geoQueryClause: {
                        lat: 40.702514,
                        lng: -73.703361,
                        unit: "mi",
                        distance: 50
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

        try {
            // Get jobs first
            const jobResponse = await fetch(this.baseUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(jobSearchRequest)
            });

            const jobData = await jobResponse.json();
            
            if (jobData.errors) {
                console.error('Job Search API Error:', jobData.errors);
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
                                lat: 40.702514,
                                lng: -73.703361,
                                unit: "mi",
                                distance: 100
                            },
                            dateFilters: [{
                                key: "firstDayOnSite",
                                range: {
                                    startDate: "2024-11-02"
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

                const scheduleResponse = await fetch(this.baseUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(scheduleRequest)
                });

                const scheduleData = await scheduleResponse.json();
                
                if (!scheduleData.errors) {
                    results.push({
                        jobInfo: job,
                        schedules: scheduleData.data?.searchScheduleCards?.scheduleCards || []
                    });
                }

                // Add a small delay between requests to avoid rate limiting
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
        const jobSearch = new AmazonJobSearch();
        const jobs = await jobSearch.searchSchedules({});

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
        console.error('Error displaying jobs:', error);
    }
}

// Run the search
displayJobs();
