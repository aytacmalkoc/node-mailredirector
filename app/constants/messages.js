/**
 * Application Messages, Logs, and Errors Constants
 * All text content for the mail redirector application
 */

const MESSAGES = {
    // Application Status Messages
    APP_STARTING: 'Mail Redirector application is starting...',
    APP_STARTED_SUCCESS: 'Application started successfully',
    APP_STOPPING: 'Mail Redirector application is stopping...',
    APP_STOPPED: 'Application stopped',
    APP_START_FAILED: 'Application failed to start',
    APP_STOP_FAILED: 'Application failed to stop',

    // Environment and Configuration
    ENV_VALIDATION_SUCCESS: 'Environment variables validated',
    ENV_VALIDATION_FAILED: 'Environment validation failed',
    MISSING_ENV_VARS: 'Missing environment variables',
    CONFIG_RELOADED: 'Configuration reloaded successfully',
    CONFIG_RELOAD_FAILED: 'Configuration reload failed',

    // Service Initialization
    SERVICES_INIT_FAILED: 'Services initialization failed',
    KEYWORD_CHECKER_STARTED: 'Keyword checker started',
    SMTP_SENDER_STARTED: 'SMTP sender started and tested',
    SMTP_CONNECTION_TEST_FAILED: 'SMTP connection test failed',
    IMAP_LISTENER_STARTED: 'IMAP listener started',
    DATABASE_INITIALIZED: 'Database initialized successfully',

    // IMAP Connection
    IMAP_CONNECTION_STARTED: 'IMAP connection started',
    IMAP_CONNECTION_READY: 'IMAP connection ready',
    IMAP_CONNECTION_ERROR: 'IMAP connection error',
    IMAP_CONNECTION_ENDED: 'IMAP connection ended',
    IMAP_CONNECTION_CLOSED: 'IMAP connection closed',
    IMAP_RECONNECT_ATTEMPT: 'IMAP reconnection attempt',
    IMAP_RECONNECT_FAILED: 'IMAP reconnection failed',
    IMAP_LISTENING_STARTED: 'IMAP listening started',
    IMAP_LISTENING_STOPPED: 'IMAP listening stopped',
    IMAP_FETCHING_EMAILS: 'Fetching emails from IMAP',
    IMAP_NO_NEW_EMAILS: 'No new emails found',
    IMAP_EMAILS_FOUND: 'New emails found',
    IMAP_PROCESSING_EMAIL: 'Processing email from IMAP',

    // Email Processing
    EMAIL_PROCESSING: 'Processing email',
    EMAIL_ALREADY_PROCESSED: 'Email already processed',
    EMAIL_FORWARDED_SUCCESS: 'Email forwarded successfully',
    EMAIL_FORWARD_FAILED: 'Email forwarding failed',
    EMAIL_SKIPPED_NO_MATCH: 'Email skipped - no keyword match found',
    EMAIL_PROCESSING_ERROR: 'Email processing error',

    // Keyword Checking
    KEYWORDS_LOADED: 'Keywords loaded successfully',
    KEYWORDS_LOAD_FAILED: 'Keywords loading failed',
    KEYWORDS_LOADED_LEGACY: 'Keywords loaded (legacy format)',
    KEYWORD_MATCH_FOUND: 'Keyword match found, forwarding email',
    KEYWORD_NO_MATCH: 'No keyword match found, skipping email',
    TOTAL_KEYWORDS_COUNT: 'Total keyword count',

    // SMTP Operations
    SMTP_TRANSPORTER_STARTED: 'SMTP transporter started',
    SMTP_TRANSPORTER_FAILED: 'SMTP transporter initialization failed',
    SMTP_SENDING_EMAIL: 'Sending email',
    SMTP_EMAIL_SENT: 'Email sent successfully',
    SMTP_EMAIL_FAILED: 'Email sending failed',
    SMTP_NO_RECIPIENTS: 'Recipient list is empty - recipients should come from keywords.json',
    SMTP_CONNECTION_TEST: 'SMTP connection test',

    // Database Operations
    DATABASE_CONNECTION_ESTABLISHED: 'SQLite database connection established',
    DATABASE_CONNECTION_FAILED: 'Database connection failed',
    DATABASE_TABLES_CREATED: 'Database tables created',
    DATABASE_TABLE_CREATION_FAILED: 'Database table creation failed',
    DATABASE_INDEX_CREATION_FAILED: 'Database index creation failed',
    DATABASE_EMAIL_SAVED: 'Email saved to database',
    DATABASE_EMAIL_SAVE_FAILED: 'Email save to database failed',
    DATABASE_CLEANUP_COMPLETED: 'Database cleanup completed',
    DATABASE_CLEANUP_FAILED: 'Database cleanup failed',

    // Logging
    LOGGER_STARTED: 'Winston logger started successfully',
    LOGGER_START_FAILED: 'Winston logger failed to start, using fallback logger',
    LOG_FOLDER_CREATION_FAILED: 'Log folder creation failed',
    FALLBACK_LOG_WRITE_FAILED: 'Fallback log write failed',
    FORWARDED_LOG_WRITE_FAILED: 'Forwarded log write failed',
    SYSTEM_LOG_WRITE_FAILED: 'System log write failed',

    // Error Messages
    UNCAUGHT_EXCEPTION: 'Uncaught exception',
    UNHANDLED_REJECTION: 'Unhandled promise rejection',
    LOGGER_ERROR: 'Logger error',
    CRITICAL_ERROR: 'Critical error - Application failed to start',

    // Signal Handling
    SIGNAL_RECEIVED: 'Signal received, shutting down application...',

    // Statistics and Status
    SYSTEM_STATUS: 'System status',
    FINAL_STATS: 'Final statistics',

    // File Operations
    FILE_READ_ERROR: 'File read error',
    FILE_WRITE_ERROR: 'File write error',
    DIRECTORY_CREATION_FAILED: 'Directory creation failed',

    // Validation Messages
    VALIDATION_SUCCESS: 'Validation successful',
    VALIDATION_FAILED: 'Validation failed',

    // General
    SUCCESS: 'Success',
    FAILED: 'Failed',
    ERROR: 'Error',
    WARNING: 'Warning',
    INFO: 'Information',
    DEBUG: 'Debug'
};

const LOG_MESSAGES = {
    // Application lifecycle
    APP_START: 'Starting Mail Redirector application...',
    APP_STOP: 'Stopping Mail Redirector application...',
    APP_RUNNING: 'Application is running',
    APP_SHUTDOWN: 'Application shutdown initiated',

    // Service status
    SERVICE_INIT: 'Initializing services...',
    SERVICE_READY: 'All services ready',
    SERVICE_ERROR: 'Service error occurred',

    // Connection status
    CONNECTION_ESTABLISHED: 'Connection established',
    CONNECTION_LOST: 'Connection lost',
    CONNECTION_RETRY: 'Connection retry attempt',

    // Email operations
    EMAIL_RECEIVED: 'Email received',
    EMAIL_PROCESSED: 'Email processed',
    EMAIL_FORWARDED: 'Email forwarded',
    EMAIL_SKIPPED: 'Email skipped',

    // Configuration
    CONFIG_LOADED: 'Configuration loaded',
    CONFIG_UPDATED: 'Configuration updated',
    CONFIG_ERROR: 'Configuration error',

    // Database operations
    DB_QUERY_EXECUTED: 'Database query executed',
    DB_TRANSACTION_STARTED: 'Database transaction started',
    DB_TRANSACTION_COMMITTED: 'Database transaction committed',
    DB_TRANSACTION_ROLLBACK: 'Database transaction rollback',

    // Performance
    PERFORMANCE_METRIC: 'Performance metric recorded',
    SLOW_OPERATION: 'Slow operation detected',
    MEMORY_USAGE: 'Memory usage recorded'
};

const ERROR_MESSAGES = {
    // General errors
    UNKNOWN_ERROR: 'Unknown error occurred',
    INVALID_INPUT: 'Invalid input provided',
    MISSING_PARAMETER: 'Required parameter is missing',
    TIMEOUT_ERROR: 'Operation timed out',
    NETWORK_ERROR: 'Network error occurred',
    PERMISSION_DENIED: 'Permission denied',

    // Configuration errors
    CONFIG_FILE_NOT_FOUND: 'Configuration file not found',
    CONFIG_PARSE_ERROR: 'Configuration parse error',
    INVALID_CONFIG: 'Invalid configuration',

    // Connection errors
    CONNECTION_TIMEOUT: 'Connection timeout',
    AUTHENTICATION_FAILED: 'Authentication failed',
    CONNECTION_REFUSED: 'Connection refused',
    SSL_ERROR: 'SSL/TLS error',

    // Email errors
    EMAIL_PARSE_ERROR: 'Email parsing error',
    EMAIL_VALIDATION_ERROR: 'Email validation error',
    EMAIL_SEND_ERROR: 'Email sending error',
    EMAIL_RECEIVE_ERROR: 'Email receiving error',

    // Database errors
    DB_CONNECTION_ERROR: 'Database connection error',
    DB_QUERY_ERROR: 'Database query error',
    DB_TRANSACTION_ERROR: 'Database transaction error',
    DB_LOCK_ERROR: 'Database lock error',

    // File system errors
    FILE_NOT_FOUND: 'File not found',
    FILE_ACCESS_ERROR: 'File access error',
    DISK_SPACE_ERROR: 'Insufficient disk space',
    FILE_CORRUPTED: 'File corrupted',

    // Memory errors
    MEMORY_ERROR: 'Memory allocation error',
    STACK_OVERFLOW: 'Stack overflow',
    HEAP_ERROR: 'Heap memory error',

    // Process errors
    PROCESS_KILLED: 'Process killed',
    PROCESS_HANG: 'Process hang detected',
    CHILD_PROCESS_ERROR: 'Child process error'
};

module.exports = {
    MESSAGES,
    LOG_MESSAGES,
    ERROR_MESSAGES
}; 