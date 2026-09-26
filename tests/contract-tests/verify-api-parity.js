// Bob-generated Consumer-Driven Contract tests
// Ensures new microservices return the exact same JSON as legacy system

const axios = require('axios');
const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(
      ({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/contract-tests.log' })
  ]
});

class ContractTester {
  constructor() {
    this.testResults = [];
  }

  /**
   * Run contract tests comparing legacy and modernized API responses
   * @param {Object} config - Test configuration
   * @param {string} config.legacyBaseUrl - Base URL of legacy system
   * @param {string} config.modernBaseUrl - Base URL of modernized system
   * @param {Array<Object>} config.endpoints - Endpoints to test
   * @param {Object} options - Test options
   * @returns {Promise<Object>>} Test results
   */
  async runContractTests(config, options = {}) {
    const {
      legacyBaseUrl,
      modernBaseUrl,
      endpoints = [],
      headers = {},
      timeout = 5000,
      ignoreFields = ['timestamp', 'version', 'requestId'] // Fields to ignore in comparison
    } = config;

    logger.info(`Starting contract tests: ${endpoints.length} endpoints`);

    const results = {
      totalTests: endpoints.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      startTime: new Date().toISOString(),
      tests: []
    };

    for (const endpoint of endpoints) {
      const testResult = await this.testEndpoint(
        endpoint,
        { legacyBaseUrl, modernBaseUrl, headers, timeout, ignoreFields }
      );

      results.tests.push(testResult);

      if (testResult.status === 'skipped') {
        results.skipped++;
      } else if (testResult.status === 'passed') {
        results.passed++;
      } else {
        results.failed++;
      }
    }

    results.endTime = new Date().toISOString();
    results.durationMs = new Date(results.endTime) - new Date(results.startTime);
    results.successRate = results.totalTests > 0
      ? (results.passed / results.totalTests) * 100
      : 0;

    logger.info(`Contract tests completed: ${results.passed}/${results.totalTests} passed (${results.successRate.toFixed(2)}%)`);

    return results;
  }

  /**
   * Test a single endpoint
   * @param {Object} endpoint - Endpoint configuration
   * @param {Object} config - Test configuration
   * @returns {Promise<Object>>} Test result
   */
  async testEndpoint(endpoint, config) {
    const {
      method = 'GET',
      path,
      headers = {},
      query = {},
      body = null,
      legacyBaseUrl,
      modernBaseUrl,
      timeout = 5000,
      ignoreFields = []
    } = { ...endpoint, ...config };

    const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    logger.info(`Testing endpoint: ${method} ${path}`);

    try {
      // Call legacy system
      const legacyResponse = await this.callEndpoint(
        `${legacyBaseUrl}${path}`,
        { method, headers, query, body, timeout }
      );

      // Call modernized system
      const modernResponse = await this.callEndpoint(
        `${modernBaseUrl}${path}`,
        { method, headers, query, body, timeout }
      );

      // Compare responses
      const comparison = this.compareResponses(
        legacyResponse.data,
        modernResponse.data,
        ignoreFields
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      if (comparison.equal) {
        return {
          testId,
          endpoint: `${method} ${path}`,
          status: 'passed',
          durationMs: duration,
          legacyResponse: {
            statusCode: legacyResponse.status,
            responseTime: legacyResponse.responseTime
          },
          modernResponse: {
            statusCode: modernResponse.status,
            responseTime: modernResponse.responseTime
          },
          comparison: {
            equal: true,
            differences: []
          },
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          testId,
          endpoint: `${method} ${path}`,
          status: 'failed',
          durationMs: duration,
          legacyResponse: {
            statusCode: legacyResponse.status,
            responseTime: legacyResponse.responseTime
          },
          modernResponse: {
            statusCode: modernResponse.status,
            responseTime: modernResponse.responseTime
          },
          comparison: {
            equal: false,
            differences: comparison.differences
          },
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      logger.error(`Contract test failed for ${method} ${path}: ${error.message}`);

      return {
        testId,
        endpoint: `${method} ${path}`,
        status: 'error',
        durationMs: duration,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Call HTTP endpoint
   * @param {string} url - URL to call
   * @param {Object} options - Request options
   * @returns {Promise<Object>>} Response object
   */
  async callEndpoint(url, options = {}) {
    const {
      method = 'GET',
      headers = {},
      query = {},
      body = null,
      timeout = 5000
    } = options;

    // Build URL with query parameters
    let fullUrl = url;
    if (query && Object.keys(query).length > 0) {
      const queryString = new URLSearchParams(query).toString();
      fullUrl += `${url.includes('?') ? '&' : '?'}${queryString}`;
    }

    const axiosConfig = {
      method,
      url: fullUrl,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout,
      validateStatus: (status) => status >= 200 && status < 600 // Accept all status codes
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      axiosConfig.data = body;
    }

    const startTime = Date.now();
    const response = await axios(axiosConfig);
    const endTime = Date.now();

    return {
      status: response.status,
      data: response.data,
      headers: response.headers,
      responseTime: endTime - startTime
    };
  }

  /**
   * Compare two objects, ignoring specified fields
   * @param {*} obj1 - First object
   * @param {*} obj2 - Second object
   * @param {Array<string>} ignoreFields - Fields to ignore in comparison
   * @returns {Object} Comparison result
   */
  static compareResponses(obj1, obj2, ignoreFields = []) {
    const differences = [];

    const compare = (a, b, path = '') => {
      // Handle null/undefined
      if (a === null && b === null) return true;
      if (a === null || b === null) return a === b;

      // Handle primitives
      if (typeof a !== 'object' || typeof b !== 'object') {
        if (a !== b) {
          differences.push({
            path: path || '(root)',
            expected: a,
            actual: b
          });
          return false;
        }
        return true;
      }

      // Handle arrays
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
          differences.push({
            path: path || '(root)',
            expected: `Array length ${a.length}`,
            actual: `Array length ${b.length}`
          });
          return false;
        }

        let equal = true;
        for (let i = 0; i < a.length; i++) {
          if (!compare(a[i], b[i], `${path}[${i}]`)) {
            equal = false;
          }
        }
        return equal;
      }

      // Handle objects
      if (Array.isArray(a) !== Array.isArray(b)) {
        differences.push({
          path: path || '(root)',
          expected: Array.isArray(a) ? 'Array' : 'Object',
          actual: Array.isArray(b) ? 'Array' : 'Object'
        });
        return false;
      }

      const allKeys = new Set([
        ...Object.keys(a),
        ...Object.keys(b)
      ].filter(key => !ignoreFields.includes(key)));

      let equal = true;
      for (const key of allKeys) {
        const newPath = path ? `${path}.${key}` : key;
        if (!compare(a[key], b[key], newPath)) {
          equal = false;
        }
      }

      return equal;
    };

    const equal = compare(obj1, obj2);

    return {
      equal,
      differences
    };
  }

  /**
   * Generate test report
   * @param {Object} results - Test results from runContractTests
   * @returns {Object} Formatted report
   */
  static generateReport(results) {
    return {
      summary: {
        total: results.totalTests,
        passed: results.passed,
        failed: results.failed,
        skipped: results.skipped,
        successRate: `${results.successRate.toFixed(2)}%`,
        durationMs: results.durationMs
      },
      passedTests: results.tests
        .filter(t => t.status === 'passed')
        .map(t => t.endpoint),
      failedTests: results.tests
        .filter(t => t.status === 'failed' || t.status === 'error')
        .map(t => ({
          endpoint: t.endpoint,
          reason: t.status === 'error' ? t.error : `Mismatch in ${t.comparison.differences.length} field(s)`
        })),
      skippedTests: results.tests
        .filter(t => t.status === 'skipped')
        .map(t => t.endpoint)
    };
  }
}

module.exports = ContractTester;