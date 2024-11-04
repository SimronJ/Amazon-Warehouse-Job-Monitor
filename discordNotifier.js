const fetch = require('node-fetch');

class DiscordNotifier {
    constructor(webhookUrl) {
        this.webhookUrl = webhookUrl;
        if (!this.webhookUrl) {
            throw new Error('Discord webhook URL is required');
        }
    }

    async sendJobNotification(job, isNew = false) {
        try {
            const emoji = isNew ? '🆕' : '📋';
            const color = isNew ? 0x00ff00 : 0x0099ff; // Green for new jobs, blue for updates

            const embed = {
                title: `${emoji} ${job.title}`,
                color: color,
                fields: [
                    {
                        name: '📍 Location',
                        value: job.location,
                        inline: true
                    },
                    {
                        name: '🚗 Distance',
                        value: job.distanceDisplay,
                        inline: true
                    }
                ],
                url: job.jobUrl,
                footer: {
                    text: `Amazon Jobs Monitor • ${new Date().toLocaleString()}`
                }
            };

            // Add shift details if available
            if (job.shifts && job.shifts.length > 0) {
                job.shifts.forEach((shift, index) => {
                    embed.fields.push(
                        {
                            name: `📅 Shift ${index + 1}`,
                            value: shift.schedule,
                            inline: false
                        },
                        {
                            name: '💰 Pay Rate',
                            value: shift.totalPay,
                            inline: true
                        },
                        {
                            name: '⏰ Hours/Week',
                            value: `${shift.hoursPerWeek}`,
                            inline: true
                        },
                        {
                            name: '💵 Weekly Pay',
                            value: shift.weeklyPay,
                            inline: true
                        }
                    );

                    if (shift.signOnBonus) {
                        embed.fields.push({
                            name: '🎉 Sign-on Bonus',
                            value: shift.signOnBonus,
                            inline: false
                        });
                    }
                });
            }

            await this.sendWebhook({ embeds: [embed] });
            console.log(`[Discord] Sent notification for job: ${job.title}`);
        } catch (error) {
            console.error('[Discord] Error sending job notification:', error);
        }
    }

    async sendStatusUpdate(message, type = 'info') {
        try {
            const colors = {
                info: 0x0099ff,    // Blue
                success: 0x00ff00, // Green
                warning: 0xffaa00, // Orange
                error: 0xff0000    // Red
            };

            const emojis = {
                info: 'ℹ️',
                success: '✅',
                warning: '⚠️',
                error: '❌'
            };

            const embed = {
                title: `${emojis[type]} Monitor Status Update`,
                description: message,
                color: colors[type],
                timestamp: new Date().toISOString()
            };

            await this.sendWebhook({ embeds: [embed] });
            console.log(`[Discord] Sent status update: ${message}`);
        } catch (error) {
            console.error('[Discord] Error sending status update:', error);
        }
    }

    async sendErrorNotification(error) {
        try {
            const embed = {
                title: '❌ Error in Job Monitor',
                description: error.message || 'An unknown error occurred',
                color: 0xff0000, // Red
                fields: [
                    {
                        name: 'Timestamp',
                        value: new Date().toLocaleString(),
                        inline: false
                    }
                ],
                footer: {
                    text: 'Amazon Jobs Monitor Error Report'
                }
            };

            if (error.stack) {
                embed.fields.push({
                    name: 'Stack Trace',
                    value: `\`\`\`${error.stack.slice(0, 1000)}\`\`\``,
                    inline: false
                });
            }

            await this.sendWebhook({ embeds: [embed] });
            console.log('[Discord] Sent error notification');
        } catch (error) {
            console.error('[Discord] Error sending error notification:', error);
        }
    }

    async sendWebhook(payload) {
        try {
            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Discord webhook failed: ${response.statusText}`);
            }

            // Discord rate limit handling
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error('[Discord] Webhook error:', error);
            throw error;
        }
    }
}

module.exports = DiscordNotifier; 