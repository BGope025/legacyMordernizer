import winston from 'winston';
import fs from 'fs/promises';
import path from 'path';

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
    new winston.transports.File({ filename: 'logs/bobalytics.log' })
  ]
});

class BobalyticsParser {
  constructor() {
    this.metrics = new Map(); // jobId => metrics data
  }

  /**
   * Parse Bob CLI output to extract token usage and performance metrics
   * @param {string} rawOutput - Raw output from Bob CLI
   * @param {string} jobId - Associated job ID
   * @param {Object} context - Additional context (operation type, timestamps, etc.)
   * @returns {Object} Parsed metrics
   */
  parseBobOutput(rawOutput, jobId, context = {}) {
    const { operationType = 'unknown', startTime = Date.now() } = context;
    const endTime = Date.now();

    logger.info(`Parsing Bobalytics for job ${jobId}, operation: ${operationType}`);

    // Initialize metrics structure
    const metrics = {
      jobId,
      operationType,
      timestamp: new Date().toISOString(),
      durationMs: endTime - startTime,
      durationSeconds: ((endTime - startTime) / 1000).toFixed(2),
      rawOutputLength: rawOutput.length,
      tokens: {
        input: 0,
        output: 0,
        total: 0,
        estimatedCost: 0
      },
      performance: {
        throughput: 0, // tokens per second
        latency: 0,
        peakMemory: 0,
        cpuUsage: 0
      },
      operations: {
        filesProcessed: 0,
        linesOfCode: 0,
        classes: 0,
        methods: 0,
        apiEndpoints: 0
      },
      cost: {
        usd: 0,
        credits: 0
      },
      quality: {
        codeReduction: 0,
        duplicationRemoved: 0,
        complexityReduction: 0
      },
      rawOutput: rawOutput.substring(0, 1000) // Store first 1000 chars for debugging
    };

    try {
      // Extract token usage from Bob output
      const tokenMatches = this.extractTokenUsage(rawOutput);
      if (tokenMatches) {
        metrics.tokens.input = tokenMatches.input || 0;
        metrics.tokens.output = tokenMatches.output || 0;
        metrics.tokens.total = tokenMatches.total || (tokenMatches.input + tokenMatches.output);
        metrics.tokens.estimatedCost = this.calculateTokenCost(tokenMatches.input, tokenMatches.output);
      }

      // Extract performance metrics
      const perfMatches = this.extractPerformanceMetrics(rawOutput);
      if (perfMatches) {
        metrics.performance.throughput = perfMatches.throughput || 0;
        metrics.performance.latency = perfMatches.latency || 0;
        metrics.performance.peakMemory = perfMatches.peakMemory || 0;
        metrics.performance.cpuUsage = perfMatches.cpuUsage || 0;
      }

      // Extract operational metrics
      const opsMatches = this.extractOperationalMetrics(rawOutput);
      if (opsMatches) {
        metrics.operations.filesProcessed = opsMatches.filesProcessed || 0;
        metrics.operations.linesOfCode = opsMatches.linesOfCode || 0;
        metrics.operations.classes = opsMatches.classes || 0;
        metrics.operations.methods = opsMatches.methods || 0;
        metrics.operations.apiEndpoints = opsMatches.apiEndpoints || 0;
      }

      // Extract cost information
      const costMatches = this.extractCostInfo(rawOutput);
      if (costMatches) {
        metrics.cost.usd = costMatches.usd || 0;
        metrics.cost.credits = costMatches.credits || 0;
      }

      // Extract quality improvements
      const qualityMatches = this.extractQualityMetrics(rawOutput);
      if (qualityMatches) {
        metrics.quality.codeReduction = qualityMatches.codeReduction || 0;
        metrics.quality.duplicationRemoved = qualityMatches.duplicationRemoved || 0;
        metrics.quality.complexityReduction = qualityMatches.complexityReduction || 0;
      }

      // Calculate derived metrics
      if (metrics.durationSeconds > 0 && metrics.tokens.total > 0) {
        metrics.performance.throughput = Math.round(metrics.tokens.total / parseFloat(metrics.durationSeconds));
      }

      // Store metrics
      this.metrics.set(jobId, metrics);

      logger.info(`Bobalytics parsed for job ${jobId}: ${metrics.tokens.total} tokens, ${metrics.durationSeconds}s`);

      return metrics;

    } catch (error) {
      logger.error(`Error parsing Bobalytics output: ${error.message}`);
      // Return basic metrics even if parsing fails
      metrics.error = error.message;
      this.metrics.set(jobId, metrics);
      return metrics;
    }
  }

  /**
   * Extract token usage from Bob output
   * @param {string} output - Bob CLI output
   * @returns {Object|null} Token metrics or null if not found
   */
  extractTokenUsage(output) {
    // Patterns for token usage in Bob output
    const patterns = [
      // Pattern: "Tokens used: 1,234 (input: 800, output: 434)"
      {
        regex: /Tokens\s+used:\s*([\d,]+)\s*\(input:\s*([\d,]+),\s*output:\s*([\d,]+)\)/i,
        handler: (matches) => ({
          input: parseInt(matches[2].replace(/,/g, ''), 10),
          output: parseInt(matches[3].replace(/,/g, ''), 10),
          total: parseInt(matches[1].replace(/,/g, ''), 10)
        })
      },
      // Pattern: "Input tokens: 800, Output tokens: 434"
      {
        regex: /Input\s+tokens:\s*([\d,]+).*?Output\s+tokens:\s*([\d,]+)/i,
        handler: (matches) => ({
          input: parseInt(matches[1].replace(/,/g, ''), 10),
          output: parseInt(matches[2].replace(/,/g, ''), 10),
          total: parseInt(matches[1].replace(/,/g, ''), 10) + parseInt(matches[2].replace(/,/g, ''), 10)
        })
      },
      // Pattern: "Total tokens: 1,234"
      {
        regex: /Total\s+tokens:\s*([\d,]+)/i,
        handler: (matches) => ({
          total: parseInt(matches[1].replace(/,/g, ''), 10),
          input: 0, // Would need to estimate
          output: 0
        })
      }
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern.regex);
      if (match) {
        try {
          return pattern.handler(match);
        } catch (error) {
          logger.debug(`Token pattern match failed: ${error.message}`);
          continue;
        }
      }
    }

    // Fallback: estimate based on output length and operation type
    // Rough estimate: ~4 characters per token
    const estimatedTokens = Math.round(output.length / 4);
    return {
      input: Math.round(estimatedTokens * 0.7), // Assume 70% input
      output: Math.round(estimatedTokens * 0.3), // Assume 30% output
      total: estimatedTokens
    };
  }

  /**
   * Calculate estimated cost based on token usage
   * @param {number} inputTokens - Number of input tokens
   * @param {number} outputTokens - Number of output tokens
   * @returns {number} Estimated cost in USD
   */
  calculateTokenCost(inputTokens, outputTokens) {
    // IBM Watsonx.ai pricing (approximate, as of 2024)
    // These would be configurable based on actual model and tier
    const INPUT_COST_PER_1K_TOKENS = 0.0008;  // $0.0008 per 1K input tokens
    const OUTPUT_COST_PER_1K_TOKENS = 0.0016; // $0.0016 per 1K output tokens

    const inputCost = (inputTokens / 1000) * INPUT_COST_PER_1K_TOKENS;
    const outputCost = (outputTokens / 1000) * OUTPUT_COST_PER_1K_TOKENS;

    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  /**
   * Extract performance metrics from Bob output
   * @param {string} output - Bob CLI output
   * @returns {Object|null} Performance metrics or null if not found
   */
  extractPerformanceMetrics(output) {
    const patterns = [
      // Pattern: "Throughput: 45.2 tokens/sec"
      {
        regex: /Throughput:\s*([\d.]+)\s*tokens\/sec/i,
        handler: (matches) => ({ throughput: parseFloat(matches[1]) })
      },
      // Pattern: "Latency: 120ms"
      {
        regex: /Latency:\s*([\d.]+)\s*ms/i,
        handler: (matches) => ({ latency: parseFloat(matches[1]) })
      },
      // Pattern: "Peak memory: 256 MB"
      {
        regex: /Peak\s+memory:\s*([\d.]+)\s*MB/i,
        handler: (matches) => ({ peakMemory: parseFloat(matches[1]) })
      },
      // Pattern: "CPU usage: 45%"
      {
        regex: /CPU\s+usage:\s*([\d.]+)\s*%/i,
        handler: (matches) => ({ cpuUsage: parseFloat(matches[1]) })
      }
    ];

    const result = {};
    let found = false;

    for (const pattern of patterns) {
      const match = output.match(pattern.regex);
      if (match) {
        try {
          Object.assign(result, pattern.handler(match));
          found = true;
        } catch (error) {
          logger.debug(`Performance pattern match failed: ${error.message}`);
        }
      }
    }

    return found ? result : null;
  }

  /**
   * Extract operational metrics from Bob output
   * @param {string} output - Bob CLI output
   * @returns {Object|null} Operational metrics or null if not found
   */
  extractOperationalMetrics(output) {
    const patterns = [
      // Pattern: "Processed 15 files"
      {
        regex: /Processed\s+([\d,]+)\s*files/i,
        handler: (matches) => ({ filesProcessed: parseInt(matches[1].replace(/,/g, ''), 10) })
      },
      // Pattern: "Lines of code: 2,500"
      {
        regex: /Lines\s+of\s+code:\s*([\d,]+)/i,
        handler: (matches) => ({ linesOfCode: parseInt(matches[1].replace(/,/g, ''), 10) })
      },
      // Pattern: "Classes: 25"
      {
        regex: /Classes:\s*([\d,]+)/i,
        handler: (matches) => ({ classes: parseInt(matches[1].replace(/,/g, ''), 10) })
      },
      // Pattern: "Methods: 150"
      {
        regex: /Methods:\s*([\d,]+)/i,
        handler: (matches) => ({ methods: parseInt(matches[1].replace(/,/g, ''), 10) })
      },
      // Pattern: "API endpoints: 8"
      {
        regex: /API\s+endpoints:\s*([\d,]+)/i,
        handler: (matches) => ({ apiEndpoints: parseInt(matches[1].replace(/,/g, ''), 10) })
      }
    ];

    const result = {};
    let found = false;

    for (const pattern of patterns) {
      const match = output.match(pattern.regex);
      if (match) {
        try {
          Object.assign(result, pattern.handler(match));
          found = true;
        } catch (error) {
          logger.debug(`Operational pattern match failed: ${error.message}`);
        }
      }
    }

    return found ? result : null;
  }

  /**
   * Extract cost information from Bob output
   * @param {string} output - Bob CLI output
   * @returns {Object|null} Cost metrics or null if not found
   */
  extractCostInfo(output) {
    const patterns = [
      // Pattern: "Estimated cost: $0.0234"
      {
        regex: /Estimated\s+cost:\s*\$?([\d.]+)/i,
        handler: (matches) => ({ usd: parseFloat(matches[1]) })
      },
      // Pattern: "Credits used: 25"
      {
        regex: /Credits\s+used:\s*([\d,]+)/i,
        handler: (matches) => ({ credits: parseInt(matches[1].replace(/,/g, ''), 10) })
      },
      // Pattern: "Cost: $1.23"
      {
        regex: /Cost:\s*\$?([\d.]+)/i,
        handler: (matches) => ({ usd: parseFloat(matches[1]) })
      }
    ];

    const result = {};
    let found = false;

    for (const pattern of patterns) {
      const match = output.match(pattern.regex);
      if (match) {
        try {
          Object.assign(result, pattern.handler(match));
          found = true;
        } catch (error) {
          logger.debug(`Cost pattern match failed: ${error.message}`);
        }
      }
    }

    return found ? result : null;
  }

  /**
   * Extract quality improvement metrics from Bob output
   * @param {string} output - Bob CLI output
   * @returns {Object|null} Quality metrics or null if not found
   */
  extractQualityMetrics(output) {
    const patterns = [
      // Pattern: "Code reduction: 25%"
      {
        regex: /Code\s+reduction:\s*([\d.]+)\s*%/i,
        handler: (matches) => ({ codeReduction: parseFloat(matches[1]) })
      },
      // Pattern: "Duplication removed: 15%"
      {
        regex: /Duplication\s+removed:\s*([\d.]+)\s*%/i,
        handler: (matches) => ({ duplicationRemoved: parseFloat(matches[1]) })
      },
      // Pattern: "Complexity reduction: 30%"
      {
        regex: /Complexity\s+reduction:\s*([\d.]+)\s*%/i,
        handler: (matches) => ({ complexityReduction: parseFloat(matches[1]) })
      }
    ];

    const result = {};
    let found = false;

    for (const pattern of patterns) {
      const match = output.match(pattern.regex);
      if (match) {
        try {
          Object.assign(result, pattern.handler(match));
          found = true;
        } catch (error) {
          logger.debug(`Quality pattern match failed: ${error.message}`);
        }
      }
    }

    return found ? result : null;
  }

  /**
   * Get metrics for a job
   * @param {string} jobId - The job ID
   * @returns {Object|null} Metrics or null if not found
   */
  getMetrics(jobId) {
    return this.metrics.get(jobId) || null;
  }

  /**
   * Get all metrics
   * @returns {Array} Array of [jobId, metrics] entries
   */
  getAllMetrics() {
    return Array.from(this.metrics.entries());
  }

  /**
   * Clear metrics for a job
   * @param {string} jobId - The job ID
   * @returns {boolean} True if cleared, false if not found
   */
  clearMetrics(jobId) {
    return this.metrics.delete(jobId);
  }

  /**
   * Clear all metrics
   */
  clearAllMetrics() {
    this.metrics.clear();
  }

  /**
   * Export metrics as JSON string
   * @param {string} jobId - The job ID (optional, if not provided exports all)
   * @returns {string} JSON string
   */
  exportMetrics(jobId) {
    if (jobId) {
      const metrics = this.getMetrics(jobId);
      return metrics ? JSON.stringify(metrics, null, 2) : '{}';
    } else {
      const allMetrics = Object.fromEntries(this.metrics);
      return JSON.stringify(allMetrics, null, 2);
    }
  }

  /**
   * Import metrics from JSON string
   * @param {string} jsonStr - JSON string to import
   * @returns {number} Number of metrics imported
   */
  importMetrics(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      let count = 0;

      if (data.jobId && data.tokens) {
        // Single metrics object
        this.metrics.set(data.jobId, data);
        count = 1;
      } else {
        // Object of metrics
        for (const [jobId, metrics] of Object.entries(data)) {
          this.metrics.set(jobId, metrics);
          count++;
        }
      }

      logger.info(`Imported ${count} metrics entries`);
      return count;
    } catch (error) {
      logger.error(`Failed to import metrics: ${error.message}`);
      return 0;
    }
  }
}

// Export singleton instance
export const bobalyticsParser = new BobalyticsParser();

// Export class for direct instantiation
export { BobalyticsParser };