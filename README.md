# Mail Redirector

A Node.js application that monitors an IMAP email inbox and automatically forwards emails containing specific keywords to designated recipients.

## Features

- 📧 **IMAP Email Monitoring**: Real-time email inbox monitoring with spam folder support
- 🔍 **Advanced Keyword Filtering**: Forward emails based on configurable keywords with regex support
- 📤 **SMTP Email Forwarding**: Automatic email forwarding with attachment support
- 💾 **Persistent Tracking**: SQLite database to track processed emails
- 📊 **Comprehensive Logging**: Winston-based logging system with daily rotation
- 🔄 **Advanced Error Handling**: Exponential backoff retry mechanism for IMAP and SMTP
- 🌐 **Web Dashboard**: Modern web interface for monitoring and management
- 🔌 **REST API**: Full REST API for integration and automation
- 📋 **Log Viewer**: Web-based log viewer with filtering and search
- 📈 **Periodic Reporting**: Automated daily/weekly email reports
- 🔐 **Configuration Encryption**: Secure encryption for sensitive configuration data
- ⚙️ **Advanced Rule Engine**: Time-based rules, sender/subject filters, regex patterns
- 🐳 **Docker Support**: Containerized deployment with security optimizations

## Quick Start

### Prerequisites

- Node.js 22+
- IMAP and SMTP access to an email account

### Installation

1. **Clone and install dependencies**
```bash
git clone <repository-url>
cd node-mailredirector
npm install
```

2. **Create environment file**
```bash
# Create .env file with the following variables:
IMAP_HOST=imap.gmail.com
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

3. **Configure keywords** (`app/config/keywords.json`)
```json
{
  "keywordGroups": [
    {
      "keywords": ["urgent", "critical"],
      "recipients": ["manager@company.com"],
      "description": "Urgent emails"
    }
  ],
  "caseSensitive": false,
  "matchWholeWord": false,
  "defaultRecipients": ["default@company.com"]
}
```

4. **Run the application**
```bash
# Development
npm run dev

# Production
npm start

# Docker
docker-compose up -d
```

5. **Access Web Dashboard** (if API is enabled)
```
http://localhost:3000
```

6. **Encrypt Configuration** (Optional)
```bash
# Encrypt sensitive configuration
npm run encrypt-config
```

## Configuration

### Environment Variables

#### Required Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `IMAP_HOST` | IMAP server address | ✅ |
| `IMAP_USER` | IMAP username | ✅ |
| `IMAP_PASSWORD` | IMAP password | ✅ |
| `SMTP_HOST` | SMTP server address | ✅ |
| `SMTP_USER` | SMTP username | ✅ |
| `SMTP_PASSWORD` | SMTP password | ✅ |

#### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHECK_INTERVAL` | Email check interval (ms) | 30000 |
| `ONLY_UNREAD` | Process only unread emails | false |
| `MONITOR_SPAM` | Monitor spam folder | false |
| `SPAM_FOLDER_NAME` | Spam folder name | - |
| `API_ENABLED` | Enable REST API | true |
| `API_PORT` | API server port | 3000 |
| `MAX_RETRY_ATTEMPTS` | IMAP max retry attempts | 10 |
| `BASE_RETRY_DELAY` | IMAP base retry delay (ms) | 5000 |
| `SMTP_MAX_RETRY_ATTEMPTS` | SMTP max retry attempts | 3 |
| `LOG_MAX_SIZE` | Log file max size | 20m |
| `LOG_MAX_FILES` | Log retention period | 14d |
| `REPORT_DAILY_ENABLED` | Enable daily reports | false |
| `REPORT_WEEKLY_ENABLED` | Enable weekly reports | false |
| `ENCRYPTION_KEY` | Master password for config encryption | - |

### Keyword Configuration

Keywords can be configured in two ways:

#### 1. Web Dashboard (Recommended)
Access the web dashboard at `http://localhost:3000/keywords.html` to manage keywords through a user-friendly interface.

#### 2. Manual Configuration File
Edit `app/config/keywords.json`:

```json
{
  "keywordGroups": [
    {
      "description": "Urgent Emails",
      "keywords": ["urgent", "critical", {"pattern": "/ASAP/i", "regex": true}],
      "recipients": ["manager@company.com"],
      "fromFilter": "@company.com",
      "subjectFilter": "URGENT",
      "daysOfWeek": [1, 2, 3, 4, 5],
      "timeRange": {
        "start": "09:00",
        "end": "17:00"
      }
    }
  ],
  "caseSensitive": false,
  "matchWholeWord": false,
  "defaultRecipients": ["default@company.com"]
}
```

#### Advanced Features

- **Regex Support**: Use `{"pattern": "/regex/", "regex": true}` for regex patterns
- **Time-based Rules**: Set `daysOfWeek` (0=Sunday, 6=Saturday) and `timeRange`
- **Sender Filter**: Use `fromFilter` to filter by sender email
- **Subject Filter**: Use `subjectFilter` to filter by subject line

## Project Structure

```
node-mailredirector/
├── app/
│   ├── api/
│   │   └── server.js           # REST API server
│   ├── config/
│   │   ├── keywords.json       # Keyword configuration
│   │   └── config.encrypted.json # Encrypted config (optional)
│   ├── services/
│   │   ├── imapListener.js     # IMAP email monitoring
│   │   ├── keywordChecker.js   # Keyword matching engine
│   │   ├── smtpSender.js       # SMTP email sending
│   │   ├── databaseService.js  # Database operations
│   │   ├── logService.js       # Log file management
│   │   ├── reportService.js    # Report generation
│   │   └── schedulerService.js # Cron job scheduler
│   ├── templates/
│   │   ├── email-template.html # HTML email template
│   │   └── report-template.html # Report email template
│   ├── utils/
│   │   ├── logger.js           # Logging utility
│   │   ├── templateEngine.js   # Template engine
│   │   ├── encryption.js       # Encryption service
│   │   └── configManager.js    # Config management
│   └── index.js                # Main application
├── public/                     # Web dashboard files
│   ├── css/
│   ├── js/
│   ├── index.html              # Dashboard
│   ├── keywords.html           # Keywords management
│   ├── emails.html             # Email history
│   ├── logs.html               # Log viewer
│   └── reports.html            # Reports
├── scripts/
│   └── encrypt-config.js       # Config encryption CLI
├── data/                       # Database files
├── tests/                      # Test files
└── docker-compose.yml          # Docker configuration
```

## Email Templates

The application uses external HTML templates for email formatting, making it easy to customize the appearance of forwarded emails.

### Template Location
- **HTML Template**: `app/templates/email-template.html`

### Template Variables
The following variables can be used in templates:
- `{{from}}` - Original sender email
- `{{subject}}` - Email subject
- `{{date}}` - Email date
- `{{content}}` - Email content (HTML or text)

### Customizing Templates
You can modify the HTML template to change the appearance of forwarded emails. The template uses standard HTML and CSS.

Example template structure:
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        /* Your custom styles */
    </style>
</head>
<body>
    <div class="header">
        <p>This email was automatically forwarded.</p>
        <p><strong>From:</strong> {{from}}</p>
        <p><strong>Subject:</strong> {{subject}}</p>
        <p><strong>Date:</strong> {{date}}</p>
    </div>
    <div class="content">
        {{content}}
    </div>
</body>
</html>
```

## Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build manually
docker build -t mail-redirector .
docker run -d --env-file .env mail-redirector
```

## Web Dashboard

The application includes a modern web dashboard for monitoring and management:

### Access
- **URL**: `http://localhost:3000` (default)
- **Port**: Configured via `API_PORT` environment variable

### Features
- **Dashboard**: System status, statistics, recent activity
- **Keywords Management**: Add, edit, delete keyword groups via web interface
- **Email History**: View processed emails with filtering and search
- **Log Viewer**: Browse and filter application logs
- **Reports**: Generate and view daily/weekly reports

### API Endpoints

The REST API provides programmatic access:

- `GET /api/health` - Health check
- `GET /api/status` - System status
- `GET /api/keywords` - Get keywords
- `POST /api/keywords/groups` - Add keyword group
- `PUT /api/keywords/groups/:index` - Update keyword group
- `DELETE /api/keywords/groups/:index` - Delete keyword group
- `GET /api/emails/processed` - Get processed emails
- `GET /api/logs` - Get logs
- `POST /api/reports/daily` - Generate daily report
- `POST /api/reports/weekly` - Generate weekly report
- `GET /api/config/encryption-status` - Check encryption status

See API documentation for full endpoint list.

## Logging

Logs are stored in `app/logs/` with daily rotation:
- `system-YYYY-MM-DD.log` - System logs
- `errors-YYYY-MM-DD.log` - Error logs
- `forwarded-YYYY-MM-DD.log` - Forwarded email details

Logs are automatically rotated daily and can be compressed and archived based on configuration.

## Troubleshooting

### Common Issues

1. **IMAP Connection Error**
   - Enable IMAP in your email account
   - Use app password if 2FA is enabled
   - Check firewall settings

2. **SMTP Sending Error**
   - Verify SMTP settings
   - Use app password for Gmail
   - Check "Less secure app access" settings

3. **Keyword Matching Not Working**
   - Check `keywords.json` configuration
   - Verify `caseSensitive` and `matchWholeWord` settings
   - Review log files
   - Use web dashboard to verify keyword groups

4. **Web Dashboard Not Accessible**
   - Verify `API_ENABLED=true` in environment
   - Check `API_PORT` is not blocked by firewall
   - Review API server logs

5. **Configuration Encryption Issues**
   - Ensure `ENCRYPTION_KEY` is set or `.encryption_key` file exists
   - Verify encrypted config file permissions
   - Check encryption key matches the one used for encryption

## Configuration Encryption

For enhanced security, you can encrypt sensitive configuration data:

```bash
# Encrypt configuration
npm run encrypt-config

# Or with custom password
node scripts/encrypt-config.js --password "your-password"
```

The encrypted configuration is stored in `app/config/config.encrypted.json`. Set `ENCRYPTION_KEY` environment variable or create `app/config/.encryption_key` file.

## Periodic Reporting

Configure automatic daily/weekly reports:

```bash
# Enable daily reports
REPORT_DAILY_ENABLED=true
REPORT_DAILY_TIME=08:00
REPORT_DAILY_RECIPIENTS=admin@company.com

# Enable weekly reports
REPORT_WEEKLY_ENABLED=true
REPORT_WEEKLY_DAY=monday
REPORT_WEEKLY_TIME=09:00
REPORT_WEEKLY_RECIPIENTS=admin@company.com
```

Reports include:
- Total processed emails
- Forwarded emails count
- Top recipients
- Error statistics

## Advanced Features

### Time-based Rules
Configure keyword groups to only match during specific days and times:

```json
{
  "daysOfWeek": [1, 2, 3, 4, 5],  // Monday to Friday
  "timeRange": {
    "start": "09:00",
    "end": "17:00"
  }
}
```

### Regex Patterns
Use regex for advanced keyword matching:

```json
{
  "keywords": [
    {"pattern": "/invoice|bill|payment/i", "regex": true}
  ]
}
```

### Sender and Subject Filters
Filter emails by sender or subject:

```json
{
  "fromFilter": "@company.com",
  "subjectFilter": "URGENT"
}
```

### Spam Folder Monitoring
Monitor spam folder in addition to inbox:

```bash
MONITOR_SPAM=true
SPAM_FOLDER_NAME=Junk
```

## Development

```bash
# Run tests
npm test

# Debug mode
LOG_LEVEL=debug npm start

# Encrypt configuration
npm run encrypt-config
```

## License

MIT License

## Contact

- **Developer**: Aytac Malkoc
- **Email**: aytacmalkoc@protonmail.com 