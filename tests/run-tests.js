#!/usr/bin/env node

/**
 * Test Runner Script
 * Tüm testleri çalıştırmak ve raporlama için kullanılır
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test konfigürasyonları
const testConfigs = {
    unit: {
        pattern: 'tests/(?!integration).*\\.test\\.js',
        exclude: ['tests/integration.test.js'],
        description: 'Unit Tests'
    },
    integration: {
        pattern: 'tests/integration\\.test\\.js',
        description: 'Integration Tests'
    },
    all: {
        pattern: 'tests/.*\\.test\\.js',
        description: 'All Tests'
    },
    coverage: {
        pattern: 'tests/.*\\.test\\.js',
        coverage: true,
        description: 'Tests with Coverage'
    }
};

// Renkli console çıktısı için
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
    log('\n' + '='.repeat(60), 'cyan');
    log(`  ${message}`, 'bright');
    log('='.repeat(60), 'cyan');
}

function logSection(message) {
    log('\n' + '-'.repeat(40), 'yellow');
    log(`  ${message}`, 'yellow');
    log('-'.repeat(40), 'yellow');
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

/**
 * Jest komutunu çalıştırır
 */
function runJest(config) {
    return new Promise((resolve, reject) => {
        const args = [
            '--testPathPatterns', config.pattern,
            '--verbose',
            '--detectOpenHandles',
            '--forceExit'
        ];

        if (config.coverage) {
            args.push('--coverage');
            args.push('--coverageReporters=text');
            args.push('--coverageReporters=html');
            args.push('--coverageDirectory=coverage');
        }

        if (config.exclude) {
            args.push('--testPathIgnorePatterns', config.exclude.join('|'));
        }

        logInfo(`Jest komutu çalıştırılıyor: jest ${args.join(' ')}`);

        const jestProcess = spawn('npx', ['jest', ...args], {
            stdio: 'pipe',
            shell: true
        });

        let stdout = '';
        let stderr = '';

        jestProcess.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            process.stdout.write(output);
        });

        jestProcess.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            process.stderr.write(output);
        });

        jestProcess.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, stdout, stderr });
            } else {
                reject({ success: false, stdout, stderr, code });
            }
        });

        jestProcess.on('error', (error) => {
            reject({ success: false, error: error.message });
        });
    });
}

/**
 * Test dosyalarını kontrol eder
 */
function checkTestFiles() {
    const testDir = path.join(__dirname);
    const testFiles = fs.readdirSync(testDir)
        .filter(file => file.endsWith('.test.js'))
        .map(file => path.join(testDir, file));

    logSection('Test Dosyaları Kontrol Ediliyor');
    
    const requiredTests = [
        'keywordChecker.test.js',
        'imapListener.test.js',
        'smtpSender.test.js',
        'logger.test.js',
        'mailRedirector.test.js',
        'logService.test.js',
        'reportService.test.js',
        'schedulerService.test.js',
        'integration.test.js'
    ];

    const missingTests = [];
    const existingTests = [];

    requiredTests.forEach(testFile => {
        const fullPath = path.join(testDir, testFile);
        if (fs.existsSync(fullPath)) {
            existingTests.push(testFile);
            logSuccess(`${testFile} bulundu`);
        } else {
            missingTests.push(testFile);
            logError(`${testFile} bulunamadı`);
        }
    });

    if (missingTests.length > 0) {
        logWarning(`${missingTests.length} test dosyası eksik`);
    } else {
        logSuccess('Tüm test dosyaları mevcut');
    }

    return { existingTests, missingTests };
}

/**
 * Test sonuçlarını analiz eder
 */
function analyzeTestResults(stdout) {
    const lines = stdout.split('\n');
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    let testSuites = 0;
    let passedSuites = 0;
    let failedSuites = 0;

    for (const line of lines) {
        // Test sayısı
        const testMatch = line.match(/(\d+) tests?/);
        if (testMatch) {
            totalTests = parseInt(testMatch[1]);
        }

        // Geçen test sayısı
        const passedMatch = line.match(/(\d+) passed/);
        if (passedMatch) {
            passedTests = parseInt(passedMatch[1]);
        }

        // Başarısız test sayısı
        const failedMatch = line.match(/(\d+) failed/);
        if (failedMatch) {
            failedTests = parseInt(failedMatch[1]);
        }

        // Test suite sayısı
        const suiteMatch = line.match(/(\d+) test suites?/);
        if (suiteMatch) {
            testSuites = parseInt(suiteMatch[1]);
        }

        // Geçen test suite sayısı
        const passedSuiteMatch = line.match(/(\d+) passed/);
        if (passedSuiteMatch && line.includes('test suites')) {
            passedSuites = parseInt(passedSuiteMatch[1]);
        }

        // Başarısız test suite sayısı
        const failedSuiteMatch = line.match(/(\d+) failed/);
        if (failedSuiteMatch && line.includes('test suites')) {
            failedSuites = parseInt(failedSuiteMatch[1]);
        }
    }

    return {
        totalTests,
        passedTests,
        failedTests,
        testSuites,
        passedSuites,
        failedSuites,
        success: failedTests === 0 && failedSuites === 0
    };
}

/**
 * Test raporu oluşturur
 */
function generateTestReport(results) {
    logSection('Test Raporu');
    
    const totalRuns = results.length;
    const successfulRuns = results.filter(r => r.success).length;
    const failedRuns = totalRuns - successfulRuns;

    log(`Toplam Test Çalıştırması: ${totalRuns}`, 'bright');
    log(`Başarılı: ${successfulRuns}`, 'green');
    log(`Başarısız: ${failedRuns}`, failedRuns > 0 ? 'red' : 'green');

    results.forEach((result, index) => {
        const status = result.success ? '✅' : '❌';
        const color = result.success ? 'green' : 'red';
        log(`${status} ${result.config.description}`, color);
        
        if (result.analysis) {
            const { totalTests, passedTests, failedTests, testSuites } = result.analysis;
            log(`   Test Suites: ${testSuites}, Tests: ${totalTests} (${passedTests} passed, ${failedTests} failed)`, 'blue');
        }
    });

    if (failedRuns > 0) {
        logWarning('Bazı testler başarısız oldu. Detayları yukarıda görebilirsiniz.');
    } else {
        logSuccess('Tüm testler başarıyla tamamlandı!');
    }
}

/**
 * Ana test runner fonksiyonu
 */
async function runTests(testType = 'all') {
    logHeader('Mail Redirector Test Runner');
    
    // Test dosyalarını kontrol et
    const { existingTests, missingTests } = checkTestFiles();
    
    if (missingTests.length > 0) {
        logWarning('Eksik test dosyaları var. Test çalıştırmaya devam ediliyor...');
    }

    // Test konfigürasyonunu seç
    const config = testConfigs[testType];
    if (!config) {
        logError(`Geçersiz test tipi: ${testType}`);
        logInfo('Kullanılabilir test tipleri: unit, integration, all, coverage');
        process.exit(1);
    }

    logSection(`${config.description} Çalıştırılıyor`);

    try {
        const result = await runJest(config);
        const analysis = analyzeTestResults(result.stdout);
        
        if (result.success) {
            logSuccess(`${config.description} başarıyla tamamlandı`);
        } else {
            logError(`${config.description} başarısız oldu`);
        }

        return {
            success: result.success,
            config: config,
            analysis: analysis,
            stdout: result.stdout,
            stderr: result.stderr
        };

    } catch (error) {
        logError(`${config.description} çalıştırılırken hata oluştu: ${error.message}`);
        return {
            success: false,
            config: config,
            error: error.message
        };
    }
}

/**
 * Tüm test tiplerini çalıştırır
 */
async function runAllTestTypes() {
    const results = [];
    
    for (const [testType, config] of Object.entries(testConfigs)) {
        if (testType === 'all') continue; // 'all' tipini ayrı çalıştır
        
        logSection(`${config.description} Çalıştırılıyor`);
        
        try {
            const result = await runJest(config);
            const analysis = analyzeTestResults(result.stdout);
            
            results.push({
                success: result.success,
                config: config,
                analysis: analysis,
                stdout: result.stdout,
                stderr: result.stderr
            });

            if (result.success) {
                logSuccess(`${config.description} tamamlandı`);
            } else {
                logError(`${config.description} başarısız`);
            }

        } catch (error) {
            logError(`${config.description} hatası: ${error.message}`);
            results.push({
                success: false,
                config: config,
                error: error.message
            });
        }
    }

    return results;
}

/**
 * Ana fonksiyon
 */
async function main() {
    const args = process.argv.slice(2);
    const testType = args[0] || 'all';

    try {
        if (testType === 'all') {
            // Tüm test tiplerini çalıştır
            const results = await runAllTestTypes();
            generateTestReport(results);
        } else {
            // Tek test tipini çalıştır
            const result = await runTests(testType);
            generateTestReport([result]);
        }

        logHeader('Test Runner Tamamlandı');
        
    } catch (error) {
        logError(`Test runner hatası: ${error.message}`);
        process.exit(1);
    }
}

// Script doğrudan çalıştırılırsa
if (require.main === module) {
    main().catch(error => {
        logError(`Beklenmeyen hata: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    runTests,
    runAllTestTypes,
    checkTestFiles,
    analyzeTestResults,
    generateTestReport
}; 