# Amazon Jobs Monitor 🔍

An automated tool that monitors Amazon warehouse job postings in real-time, with Discord integration for notifications. This tool helps job seekers stay updated on new warehouse positions without manually checking Amazon's hiring portal.

## 🌟 Features

- Real-time job monitoring with 3-minute refresh intervals
- Discord webhook integration for instant notifications
- Customizable search radius and job listing count
- Detailed shift and salary information
- Color-coded console output
- Automatic token refresh handling
- Rate limit management
- Error handling and reporting

## 🛠️ Tech Stack

- **Node.js** - Runtime environment
- **Discord.js** - Discord integration
- **node-fetch** - HTTP requests
- **dotenv** - Environment variable management

## 🚀 Installation

1. Clone the repository
2. Install dependencies
3. Create a `.env` file in the root directory: DISCORD_WEBHOOK_URL=your_webhook_url_here

4. Start the monitor


## 🔧 Technical Challenges & Solutions

### 1. Amazon's Security Token System
**Challenge:** Amazon's hiring portal uses a complex security token system to prevent automated access.

**Solution:** Implemented a sophisticated token generation system that:
- Mimics browser fingerprinting
- Handles token refresh automatically
- Manages security challenges
- Uses proper headers to avoid detection

### 2. Rate Limiting
**Challenge:** Frequent API calls could trigger rate limits or IP blocks.

**Solution:**
- Implemented delay between requests (500ms)
- Added retry mechanism for failed requests
- Proper error handling for rate limit responses
- Discord notification throttling (100ms between webhooks)

### 3. Data Processing
**Challenge:** Raw job data needed significant processing to be useful.

**Solution:**
- Created a robust formatting system
- Implemented weekly pay calculations
- Added distance-based sorting
- Structured shift information clearly

### 4. Discord Integration
**Challenge:** Needed to handle different types of notifications without hitting Discord's rate limits.

**Solution:**
- Created separate notification types (jobs, status, errors)
- Implemented color coding for different message types
- Added detailed error reporting with stack traces
- Managed webhook rate limits

## 📝 Usage

The tool will prompt for:
1. ZIP code (default: 11001)
2. Search radius in miles (default: 50)
3. Number of jobs to monitor (default: 5)

### Discord Notifications

The tool sends different types of notifications:
- 🆕 New job listings (Green)
- 📋 Existing job updates (Blue)
- ℹ️ Status updates (Blue)
- ❌ Error notifications (Red)

## ⚠️ Known Limitations

1. Amazon may update their security system, requiring token generation updates
2. ZIP code API has rate limits
3. Some job details might not be available immediately
4. Discord webhook has rate limits (50 requests per second)

## 🔍 Monitoring

The tool provides:
- Console output with color coding
- Discord notifications for all events
- Error logging with stack traces
- Status updates every 3 minutes

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

**Note:** This tool is for educational purposes and personal use. Please be mindful of Amazon's terms of service and API usage limits.