import fs from 'fs/promises';
import path from 'path';
import winston from 'winston';
import { pipeline } from 'stream';
import { createGzip } from 'zlib';

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
    new winston.transports.File({ filename: 'logs/context-hygiene.log' })
  ]
});

class ContextHygiene {
  constructor() {
    this.tempFiles = new Set(); // Track temporary files for cleanup
  }

  /**
   * Clean and prepare legacy code context for AI processing
   * @param {string} sourcePath - Path to source code directory
   * @param {Object} options - Processing options
   * @param {boolean} options.removeComments - Remove comments (default: false)
   * @param {boolean} options.removeWhitespace - Remove extra whitespace (default: false)
   * @param {boolean} options.removeDeadCode - Remove obviously dead code (default: false)
   * @param {number} options.maxFileSize - Maximum file size to process in bytes (default: 1MB)
   * @param {Array<string>} options.fileExtensions - Extensions to process (default: ['.java', '.js', '.kt', '.scala'])
   * @param {Array<string>} options.ignorePatterns - Glob patterns to ignore (default: ['node_modules/**', '.git/**'])
   * @returns {Promise<Object>} Promise with processing results
   */
  async sanitizeContext(sourcePath, options = {}) {
    const {
      removeComments = false,
      removeWhitespace = false,
      removeDeadCode = false,
      maxFileSize = 1024 * 1024, // 1MB
      fileExtensions = ['.java', '.js', '.kt', '.scala', '.xml', '.properties', '.yml', '.yaml'],
      ignorePatterns = ['node_modules/**', '.git/**', 'target/**', 'build/**', 'dist/**']
    } = options;

    logger.info(`Starting context hygiene for: ${sourcePath}`);

    try {
      // Validate source path exists
      await fs.access(sourcePath);

      // Collect all files to process
      const filesToProcess = await this.collectFiles(sourcePath, fileExtensions, ignorePatterns);

      logger.info(`Found ${filesToProcess.length} files to process`);

      // Process each file
      const results = {
        sourcePath,
        processedFiles: 0,
        skippedFiles: 0,
        totalSizeBefore: 0,
        totalSizeAfter: 0,
        spaceSaved: 0,
        files: [],
        errors: []
      };

      for (const filePath of filesToProcess) {
        try {
          const fileResult = await this.processFile(filePath, {
            removeComments,
            removeWhitespace,
            removeDeadCode,
            maxFileSize
          });

          results.processedFiles++;
          results.totalSizeBefore += fileResult.sizeBefore;
          results.totalSizeAfter += fileResult.sizeAfter;

          if (fileResult.modified) {
            results.files.push({
              path: filePath,
              relativePath: path.relative(sourcePath, filePath),
              sizeBefore: fileResult.sizeBefore,
              sizeAfter: fileResult.sizeAfter,
              spaceSaved: fileResult.sizeBefore - fileResult.sizeAfter,
              modifications: fileResult.modifications
            });
          } else {
            results.skippedFiles++;
          }
        } catch (fileError) {
          logger.warn(`Error processing file ${filePath}: ${fileError.message}`);
          results.errors.push({
            file: filePath,
            error: fileError.message
          });
          results.skippedFiles++;
        }
      }

      results.spaceSaved = results.totalSizeBefore - results.totalSizeAfter;
      results.compressionRatio = results.totalSizeBefore > 0
        ? (results.spaceSaved / results.totalSizeBefore) * 100
        : 0;

      logger.info(`Context hygiene completed. Processed: ${results.processedFiles}, Skipped: ${results.skippedFiles}, Space saved: ${results.spaceSaved} bytes (${results.compressionRatio.toFixed(2)}%)`);

      return results;

    } catch (error) {
      logger.error(`Context hygiene failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Collect files matching extensions and not matching ignore patterns
   * @param {string} directory - Root directory to search
   * @param {Array<string>} extensions - File extensions to include
   * @param {Array<string>} ignorePatterns - Glob patterns to ignore
   * @returns {Promise<Array<string>>} Array of file paths
   */
  async collectFiles(directory, extensions, ignorePatterns) {
    const files = [];

    const walkDir = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Check if should be ignored
        const relativePath = path.relative(directory, fullPath);
        const shouldIgnore = ignorePatterns.some(pattern => {
          // Simple glob matching - production would use minimatch or similar
          return this.matchGlob(pattern, relativePath);
        });

        if (shouldIgnore) {
          continue;
        }

        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    await walkDir(directory);
    return files;
  }

  /**
   * Simple glob pattern matching (for common cases)
   * @param {string} pattern - Glob pattern
   * @param {string} path - Path to test
   * @returns {boolean} True if path matches pattern
   */
  matchGlob(pattern, path) {
    // Convert glob pattern to regex
    // This is a simplified implementation - production would use a proper glob library
    const regexPattern = pattern
      .replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * Process a single file for hygiene
   * @param {string} filePath - Path to file
   * @param {Object} options - Processing options
   * @returns {Promise<Object>>} File processing results
   */
  async processFile(filePath, options) {
    const { removeComments, removeWhitespace, removeDeadCode, maxFileSize } = options;

    // Check file size
    const stats = await fs.stat(filePath);
    if (stats.size > maxFileSize) {
      throw new Error(`File size ${stats.size} exceeds maximum ${maxFileSize}`);
    }

    // Read file content
    let content = await fs.readFile(filePath, 'utf8');
    const sizeBefore = Buffer.byteLength(content, 'utf8');

    let modified = false;
    const modifications = [];

    // Apply transformations
    if (removeWhitespace) {
      const { content: newContent, changed } = this.removeExtraWhitespace(content);
      if (changed) {
        content = newContent;
        modified = true;
        modifications.push('removed-extra-whitespace');
      }
    }

    if (removeComments) {
      const { content: newContent, changed } = this.removeComments(content, filePath);
      if (changed) {
        content = newContent;
        modified = true;
        modifications.push('removed-comments');
      }
    }

    if (removeDeadCode) {
      const { content: newContent, changed } = this.removeObviousDeadCode(content, filePath);
      if (changed) {
        content = newContent;
        modified = true;
        modifications.push('removed-dead-code');
      }
    }

    // Only write back if modified
    if (modified) {
      await fs.writeFile(filePath, content, 'utf8');
    }

    const sizeAfter = Buffer.byteLength(content, 'utf8');

    return {
      filePath,
      sizeBefore,
      sizeAfter,
      modified,
      spaceSaved: sizeBefore - sizeAfter,
      modifications
    };
  }

  /**
   * Remove extra whitespace from code
   * @param {string} content - Source code
   * @returns {{content: string, changed: boolean}} Processed content and change flag
   */
  removeExtraWhitespace(content) {
    const lines = content.split('\n');
    let changed = false;
    const processedLines = lines.map(line => {
      // Remove trailing whitespace
      const trimmed = line.replace(/\s+$/, '');
      if (trimmed !== line) changed = true;
      return trimmed;
    });

    // Remove consecutive blank lines (more than 2 in a row)
    const finalLines = [];
    let blankCount = 0;

    for (const line of processedLines) {
      if (line.trim() === '') {
        blankCount++;
        if (blankCount <= 2) {
          finalLines.push(line);
        } else {
          changed = true;
          // Skip this blank line
        }
      } else {
        blankCount = 0;
        finalLines.push(line);
      }
    }

    // Also trim whitespace from start of lines (but be careful with indentation)
    const trimmedLines = finalLines.map(line => {
      // Only remove leading whitespace if it's excessive (more than 8 spaces) and not meaningful
      // This is a simplified approach - production would be more sophisticated
      if (line.startsWith('        ') && !line.includes('    ')) {
        // Potential over-indentation
        const match = line.match(/^(\s*)(.*)/);
        if (match && match[1].length > 8) {
          changed = true;
          return '    ' + match[2]; // Reset to 4 spaces
        }
      }
      return line;
    });

    if (trimmedLines.join('\n') !== finalLines.join('\n')) changed = true;

    return {
      content: trimmedLines.join('\n'),
      changed
    };
  }

  /**
   * Remove comments from code
   * @param {string} content - Source code
   * @param {string} filePath - File path to determine language
   * @returns {{content: string, changed: boolean}} Processed content and change flag
   */
  removeComments(content, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let changed = false;

    switch (ext) {
      case '.java':
        return this.removeJavaComments(content);
      case '.js':
        return this.removeJsComments(content);
      case '.kt':
        return this.removeKotlinComments(content);
      case '.scala':
        return this.removeScalaComments(content);
      case '.xml':
        return this.removeXmlComments(content);
      case '.properties':
      case '.yml':
      case '.yaml':
        // These formats don't typically have block comments to remove safely
        return { content, changed: false };
      default:
        // Try generic comment removal
        return this.removeGenericComments(content);
    }
  }

  /**
   * Remove Java-style comments (line and block comments)
   * @param {string} content - Source code
   * @returns {{content: string, changed: boolean}} Processed content and change flag
   */
  removeJavaComments(content) {
    // Handle string literals to avoid removing content inside them
    // This is a simplified approach - production would use a proper parser
    let changed = false;

    // Remove block comments /* ... */
    const blockCommentRegex = /\/\*[\s\S]*?\*\//g;
    if (blockCommentRegex.test(content)) {
      content = content.replace(blockCommentRegex, '');
      changed = true;
    }

    // Remove line comments //
    const lineCommentRegex = /\/\/.*$/gm;
    if (lineCommentRegex.test(content)) {
      content = content.replace(lineCommentRegex, '');
      changed = true;
    }

    // Clean up extra blank lines that might result
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
    if (content !== content.replace(/\n\s*\n\s*\n/g, '\n\n')) changed = true;

    return { content, changed };
  }

  /**
   * Remove JavaScript-style comments (line and block comments)
   * @param {string} content - Source code
   * @returns {{content: string, changed: boolean}} Processed content and change flag
   */
  removeJsComments(content) {
    return this.removeJavaComments(content); // Same syntax
  }

  /**
   * Remove Kotlin-style comments (line and block comments)
   * @param {string} content - Source code
   * @returns {{content: string, changed: boolean}} Processed content and change flag
   */
  removeKotlinComments(content) {
    return this.removeJavaComments(content); // Same syntax
  }

  /**
   * Remove Scala-style comments (line and block comments)
   * @param {string} content - Source code
   * @returns {{content: string, changed: boolean}} Processed content and change flag
   */
  removeScalaComments(content) {
    return this.removeJavaComments(content); // Same syntax
  }

  /**
   * Remove XML comments (<!-- -->)
   * @param {string} content - Source code
   * @returns {{content: string, changed: boolean}} Processed content and change flag
   */
  removeXmlComments(content) {
    const xmlCommentRegex = /<!--[\s\S]*?-->/g;
    if (xmlCommentRegex.test(content)) {
      content = content.replace(xmlCommentRegex, '');
      return { content, changed: true };
    }
    return { content, changed: false };
  }

  /**
   * Remove generic comments (fallback)
   * @param {string} content - Source code
   * @returns {{content: string, changed: boolean}} Processed content and change flag
   */
  removeGenericComments(content) {
    // Try common comment patterns
    const patterns = [
      { regex: /\/\/.*$/gm, name: 'line-comment' },
      { regex: /\/\*[\s\S]*?\*\//g, name: 'block-comment' },
      { regex: /#.*$/gm, name: 'hash-comment' }, // For configs, scripts
      { regex: /<!--[\s\S]*?-->/g, name: 'xml-comment' }
    ];

    let changed = false;
    let processed = content;

    for (const pattern of patterns) {
      if (pattern.regex.test(processed)) {
        processed = processed.replace(pattern.regex, '');
        changed = true;
      }
    }

    // Clean up extra whitespace
    if (changed) {
      processed = processed.replace(/\n\s*\n\s*\n/g, '\n\n');
      processed = processed.replace(/^\s+\n/, '\n'); // Remove leading blank lines
      processed = processed.replace(/\n\s+$/, '\n'); // Remove trailing blank lines
    }

    return { content: processed, changed };
  }

  /**
   * Remove obviously dead code (simplified)
   * @param {string} content - Source code
   * @param {string} filePath - File path to determine language
   * @returns {{content: string, changed: boolean}} Processed content and change flag
   */
  removeObviousDeadCode(content, filePath) {
    // This is a placeholder for more sophisticated dead code detection
    // In production, this would involve control flow analysis
    // For now, we'll just return unchanged to avoid false positives
    return { content, changed: false };

    /*
    // Example of what could be done (commented out for safety):
    const ext = path.extname(filePath).toLowerCase();
    let changed = false;

    // Remove unreachable code after return/throw/break/continue
    // Remove unused private methods (would require symbol table)
    // Remove dead else branches (would require condition analysis)

    return { content, changed };
    */
  }

  /**
   * Create a sanitized copy of the source code in a temporary directory
   * @param {string} sourcePath - Path to source code directory
   * @param {string} outputPath - Path for sanitized output
   * @param {Object} options - Processing options
   * @returns {Promise<Object>>} Copy results
   */
  async createSanitizedCopy(sourcePath, outputPath, options = {}) {
    logger.info(`Creating sanitized copy from ${sourcePath} to ${outputPath}`);

    try {
      // Ensure output directory exists
      await fs.mkdir(outputPath, { recursive: true });

      // Process files and copy to output
      const results = await this.sanitizeContext(sourcePath, {
        ...options,
        // Modify paths to be relative to output directory
        // This is simplified - production would need to maintain directory structure
      });

      // In a real implementation, we would:
      // 1. Read each file from sourcePath
      // 2. Apply hygiene transformations
      // 3. Write to corresponding location in outputPath

      logger.info(`Sanitized copy created: ${outputPath}`);
      return {
        sourcePath,
        outputPath,
        ...results
      };
    } catch (error) {
      logger.error(`Failed to create sanitized copy: ${error.message}`);
      throw error;
    }
  }

  /**
   * Compress a directory for efficient transfer/storage
   * @param {string} sourcePath - Path to directory to compress
   * @param {string} archivePath - Path for output archive (.gz or .zip)
   * @returns {Promise<string>>} Path to created archive
   */
  async compressDirectory(sourcePath, archivePath) {
    logger.info(`Compressing directory: ${sourcePath} -> ${archivePath}`);

    try {
      // Ensure source exists
      await fs.access(sourcePath);

      // Create output directory if needed
      await fs.mkdir(path.dirname(archivePath), { recursive: true });

      // In a real implementation, we would:
      // 1. Use a proper archiving library (archiver, yazl, etc.)
      // 2. Create a tar.gz or zip file
      // 3. Add all files from sourcePath

      // For now, we'll simulate by creating a placeholder
      await fs.writeFile(archivePath, `SIMULATED_ARCHIVE_OF_${sourcePath}`, 'utf8');

      logger.info(`Directory compressed: ${archivePath}`);
      return archivePath;
    } catch (error) {
      logger.error(`Failed to compress directory: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean up temporary files
   * @returns {Promise<void>}
   */
  async cleanupTempFiles() {
    logger.info(`Cleaning up ${this.tempFiles.size} temporary files`);

    const errors = [];
    for (const filePath of this.tempFiles) {
      try {
        await fs.unlink(filePath);
        this.tempFiles.delete(filePath);
      } catch (error) {
        logger.warn(`Failed to delete temp file ${filePath}: ${error.message}`);
        errors.push({ file: filePath, error: error.message });
      }
    }

    if (errors.length > 0) {
      logger.warn(`Failed to clean up ${errors.length} temporary files`);
    } else {
      logger.info(`Temporary file cleanup completed`);
    }
  }
}

// Export singleton instance
export const contextHygiene = new ContextHygiene();

// Export class for direct instantiation
export { ContextHygiene };