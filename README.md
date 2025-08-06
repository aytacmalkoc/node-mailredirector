# Mail Redirector

A Node.js application that monitors an IMAP email inbox and automatically forwards emails containing specific keywords to designated recipients.

## Features

- 📧 **IMAP Email Monitoring**: Real-time email inbox monitoring
- 🔍 **Keyword-based Filtering**: Forward emails based on configurable keywords
- 📤 **SMTP Email Forwarding**: Automatic email forwarding with formatting
- 💾 **Persistent Tracking**: SQLite database to track processed emails
- 📊 **Comprehensive Logging**: Winston-based logging system
- 🔄 **Auto-reconnection**: Automatic reconnection on connection loss
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

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `IMAP_HOST` | IMAP server address | ✅ |
| `IMAP_USER` | IMAP username | ✅ |
| `IMAP_PASSWORD` | IMAP password | ✅ |
| `SMTP_HOST` | SMTP server address | ✅ |
| `SMTP_USER` | SMTP username | ✅ |
| `SMTP_PASSWORD` | SMTP password | ✅ |
| `CHECK_INTERVAL` | Email check interval (ms) | ❌ |
| `ONLY_UNREAD` | Process only unread emails | ❌ |

### Keyword Configuration

Keywords are configured in `app/config/keywords.json`:

```json
{
  "keywordGroups": [
    {
      "keywords": ["keyword1", "keyword2"],
      "recipients": ["recipient1@domain.com", "recipient2@domain.com"],
      "description": "Group description"
    }
  ],
  "caseSensitive": false,
  "matchWholeWord": false,
  "defaultRecipients": ["default@domain.com"]
}
```

## Project Structure

```
node-mailredirector/
├── app/
│   ├── config/keywords.json    # Keyword configuration
│   ├── services/               # Core services
│   ├── templates/              # Email templates
│   │   └── email-template.html # HTML email template
│   ├── utils/                  # Utilities
│   │   ├── logger.js           # Logging utility
│   │   └── templateEngine.js   # Template engine
│   └── index.js                # Main application
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

## Logging

Logs are stored in `app/logs/`:
- `combined.log` - All logs
- `error.log` - Error logs only
- `forwarded.log` - Forwarded email details

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

## Development

```bash
# Run tests
npm test

# Debug mode
LOG_LEVEL=debug npm start
```

## License

MIT License

## Contact

- **Developer**: Aytac Malkoc
- **Email**: aytacmalkoc@protonmail.com 