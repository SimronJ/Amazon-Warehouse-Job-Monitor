#!/bin/bash
# Save as start.sh

# Load environment variables
export $(cat .env | xargs)

# Start the application with PM2
pm2 start amazonJobs.js --name "amazon-jobs" --time 