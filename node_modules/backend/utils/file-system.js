import fs from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream';
import { createGzip, createGunzip } from 'zlib';
import { exec } from 'child_process';
import util from 'util';
import winston from 'winston';

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
    new winston.transports.File({ filename: 'logs/file-system.log' })
  ]
});

const execPromise = util.promisify(exec);

class FileSystem {
  /**
   * Ensure directory exists, creating it if necessary
   * @param {string} dirPath - Directory path
   * @returns {Promise<void>}
   */
  static async ensureDir(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      logger.debug(`Directory ensured: ${dirPath}`);
    } catch (error) {
      logger.error(`Failed to ensure directory ${dirPath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Copy file or directory
   * @param {string} source - Source path
   * @param {string} destination - Destination path
   * @param {Object} options - Copy options
   * @returns {Promise<void>}
   */
  static async copy(source, destination, options = {}) {
    const { overwrite = false, preserveTimestamps = true } = options;

    try {
      // Check if source exists
      await fs.access(source);

      const stats = await fs.stat(source);

      if (stats.isDirectory()) {
        await this.copyDirectory(source, destination, { overwrite, preserveTimestamps });
      } else {
        await this.copyFile(source, destination, { overwrite, preserveTimestamps });
      }

      logger.info(`Copied ${source} to ${destination}`);
    } catch (error) {
      logger.error(`Failed to copy ${source} to ${destination}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Copy file
   * @param {string} source - Source file path
   * @param {string} destination - Destination file path
   * @param {Object} options - Copy options
   * @returns {Promise<void>}
   */
  static async copyFile(source, destination, options = {}) {
    const { overwrite = false, preserveTimestamps = true } = options;

    // Check if destination exists and whether we can overwrite
    if (!overwrite) {
      try {
        await fs.access(destination);
        throw new Error(`Destination already exists: ${destination}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // ENOENT means file doesn't exist, which is what we want
      }
    }

    // Ensure destination directory exists
    await this.ensureDir(path.dirname(destination));

    // Copy the file
    await fs.copyFile(source, destination);

    // Preserve timestamps if requested
    if (preserveTimestamps) {
      const stats = await fs.stat(source);
      await fs.utimes(destination, stats.atime, stats.mtime);
    }
  }

  /**
   * Copy directory recursively
   * @param {string} source - Source directory path
   * @param {string} destination - Destination directory path
   * @param {Object} options - Copy options
   * @returns {Promise<void>}
   */
  static async copyDirectory(source, destination, options = {}) {
    const { overwrite = false, preserveTimestamps = true } = options;

    // Ensure source exists
    await fs.access(source);

    // Ensure destination directory exists
    await this.ensureDir(destination);

    // Read source directory
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath, { overwrite, preserveTimestamps });
      } else if (entry.isFile()) {
        await this.copyFile(sourcePath, destPath, { overwrite, preserveTimestamps });
      }
    }

    // Preserve directory timestamps if requested
    if (preserveTimestamps) {
      const stats = await fs.stat(source);
      await fs.utimes(destination, stats.atime, stats.mtime);
    }
  }

  /**
   * Move file or directory
   * @param {string} source - Source path
   * @param {string} destination - Destination path
   * @returns {Promise<void>}
   */
  static async move(source, destination) {
    try {
      // Ensure destination directory exists
      await this.ensureDir(path.dirname(destination));

      // Move/rename the file or directory
      await fs.rename(source, destination);

      logger.info(`Moved ${source} to ${destination}`);
    } catch (error) {
      logger.error(`Failed to move ${source} to ${destination}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete file or directory
   * @param {string} target - Path to delete
   * @param {Object} options - Delete options
   * @returns {Promise<void>}
   */
  static async remove(target, options = {}) {
    const { recursive = false, force = false } = options;

    try {
      // Check if target exists
      await fs.access(target);

      const stats = await fs.stat(target);

      if (stats.isDirectory()) {
        if (!recursive) {
          // Check if directory is empty
          const entries = await fs.readdir(target);
          if (entries.length > 0 && !force) {
            throw new Error(`Directory is not empty: ${target}. Use recursive:true to delete contents.`);
          }
        }
        await this.removeDirectory(target, { recursive, force });
      } else {
        await fs.unlink(target);
      }

      logger.info(`Removed ${target}`);
    } catch (error) {
      if (error.code === 'ENOENT' && !force) {
        // File doesn't exist, which is okay if not forcing
        logger.debug(`File not found (okay): ${target}`);
        return;
      }
      logger.error(`Failed to remove ${target}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove directory recursively
   * @param {string} dirPath - Directory path to remove
   * @param {Object} options - Remove options
   * @returns {Promise<void>}
   */
  static async removeDirectory(dirPath, options = {}) {
    const { recursive = false } = options;

    if (!recursive) {
      // Just remove empty directory
      await fs.rmdir(dirPath);
      return;
    }

    // Recursive removal
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await this.removeDirectory(fullPath, { recursive: true });
      } else {
        await fs.unlink(fullPath);
      }
    }

    // Finally remove the directory itself
    await fs.rmdir(dirPath);
  }

  /**
   * Read file contents
   * @param {string} filePath - Path to file
   * @param {Object} options - Read options
   * @returns {Promise<string|Buffer>} File contents
   */
  static async readFile(filePath, options = {}) {
    const { encoding = 'utf8' } = options;

    try {
      const data = await fs.readFile(filePath, encoding);
      logger.debug(`Read file: ${filePath} (${data.length} chars)`);
      return data;
    } catch (error) {
      logger.error(`Failed to read file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Write file contents
   * @param {string} filePath - Path to file
   * @param {string|Buffer} data - Data to write
   * @param {Object} options - Write options
   * @returns {Promise<void>}
   */
  static async writeFile(filePath, data, options = {}) {
    const { encoding = 'utf8', mode = 0o644, flag = 'w' } = options;

    try {
      // Ensure directory exists
      await this.ensureDir(path.dirname(filePath));

      await fs.writeFile(filePath, data, { encoding, mode, flag });
      logger.debug(`Wrote file: ${filePath} (${Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data, encoding)} chars)`);
    } catch (error) {
      logger.error(`Failed to write file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Append to file
   * @param {string} filePath - Path to file
   * @param {string|Buffer} data - Data to append
   * @param {Object} options - Append options
   * @returns {Promise<void>}
   */
  static async appendFile(filePath, data, options = {}) {
    const { encoding = 'utf8', mode = 0o644 } = options;

    try {
      // Ensure directory exists
      await this.ensureDir(path.dirname(filePath));

      await fs.appendFile(filePath, data, { encoding, mode });
      logger.debug(`Appended to file: ${filePath}`);
    } catch (error) {
      logger.error(`Failed to append to file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if file or directory exists
   * @param {string} target - Path to check
   * @returns {Promise<boolean>} True if exists
   */
  static async exists(target) {
    try {
      await fs.access(target);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file or directory stats
   * @param {string} target - Path to check
   * @returns {Promise<fs.Stats>} File stats
   */
  static async stat(target) {
    try {
      return await fs.stat(target);
    } catch (error) {
      logger.error(`Failed to stat ${target}: ${error.message}`);
      throw error;
    }
  }

  /**
   * List directory contents
   * @param {string} dirPath - Directory path
   * @param {Object} options - List options
   * @returns {Promise<Array>} Array of file information
   */
  static async listDir(dirPath, options = {}) {
    const { recursive = false, includeDirectories = true, includeFiles = true } = options;

    try {
      // Check if directory exists
      await fs.access(dirPath);

      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const results = [];

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory() && includeDirectories) {
          results.push({
            name: entry.name,
            path: fullPath,
            type: 'directory'
          });

          if (recursive) {
            const subItems = await this.listDir(fullPath, { recursive, includeDirectories, includeFiles });
            results.push(...subItems.map(item => ({
              ...item,
              path: path.join(entry.name, item.path)
            })));
          }
        } else if (entry.isFile() && includeFiles) {
          results.push({
            name: entry.name,
            path: fullPath,
            type: 'file'
          });
        }
      }

      return results;
    } catch (error) {
      logger.error(`Failed to list directory ${dirPath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find files matching pattern
   * @param {string} dirPath - Directory to search
   * @param {Object} options - Find options
   * @returns {Promise<Array<string>>} Array of matching file paths
   */
  static async findFiles(dirPath, options = {}) {
    const { pattern = '*', recursive = false } = options;

    try {
      // Check if directory exists
      await fs.access(dirPath);

      const results = [];

      const searchDir = async (currentDir) => {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);

          if (entry.isDirectory() && recursive) {
            await searchDir(fullPath);
          } else if (entry.isFile()) {
            // Simple pattern matching - production would use minimatch or similar
            if (this.matchPattern(entry.name, pattern)) {
              results.push(fullPath);
            }
          }
        }
      };

      await searchDir(dirPath);
      return results;
    } catch (error) {
      logger.error(`Failed to find files in ${dirPath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Simple pattern matching (supports * and ?)
   * @param {string} str - String to test
   * @param {string} pattern - Pattern to match against
   * @returns {boolean} True if matches
   */
  static matchPattern(str, pattern) {
    // Escape special regex characters except * and ?
    const escapedPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      // Convert * to .* and ? to .
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${escapedPattern}$`);
    return regex.test(str);
  }

  /**
   * Create temporary file
   * @param {Object} options - Temp file options
   * @returns {Promise<string>>} Path to temporary file
   */
  static async createTempFile(options = {}) {
    const { prefix = 'tmp', suffix = '', dir = process.env.TMPDIR || '/tmp' } = options;

    try {
      await this.ensureDir(dir);

      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000000);
      const filename = `${prefix}-${timestamp}-${random}${suffix}`;
      const filePath = path.join(dir, filename);

      // Create empty file
      await fs.writeFile(filePath, '');

      logger.debug(`Created temporary file: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error(`Failed to create temporary file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create temporary directory
   * @param {Object} options - Temp directory options
   * @returns {Promise<string>>} Path to temporary directory
   */
  static async createTempDir(options = {}) {
    const { prefix = 'tmp', suffix = '', dir = process.env.TMPDIR || '/tmp' } = options;

    try {
      await this.ensureDir(dir);

      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000000);
      const dirname = `${prefix}-${timestamp}-${random}${suffix}`;
      const dirPath = path.join(dir, dirname);

      await fs.mkdir(dirPath);

      logger.debug(`Created temporary directory: ${dirPath}`);
      return dirPath;
    } catch (error) {
      logger.error(`Failed to create temporary directory: ${error.message}`);
      throw error;
    }
  }

  /**
   * Compress file using gzip
   * @param {string} sourcePath - Path to file to compress
   * @param {string} outputPath - Path for output (.gz file)
   * @returns {Promise<void>}
   */
  static async gzip(sourcePath, outputPath) {
    try {
      await this.ensureDir(path.dirname(outputPath));

      const source = fs.createReadStream(sourcePath);
      const destination = fs.createWriteStream(outputPath);
      const gzip = createGzip();

      await new Promise((resolve, reject) => {
        pipeline(source, gzip, destination, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      logger.info(`Compressed ${sourcePath} to ${outputPath} using gzip`);
    } catch (error) {
      logger.error(`Failed to gzip ${sourcePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Decompress gzip file
   * @param {string} sourcePath - Path to .gz file
   * @param {string} outputPath - Path for decompressed output
   * @returns {Promise<void>}
   */
  static async gunzip(sourcePath, outputPath) {
    try {
      await this.ensureDir(path.dirname(outputPath));
      const source = fs.createReadStream(sourcePath);
      const destination = fs.createWriteStream(outputPath);
      const gunzip = createGunzip();

      await new Promise((resolve, reject) => {
        pipeline(source, gunzip, destination, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      logger.info(`Decompressed ${sourcePath} to ${outputPath} using gunzip`);
    } catch (error) {
      logger.error(`Failed to gunzip ${sourcePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate directory size
   * @param {string} dirPath - Directory path
   * @returns {Promise<number>>} Size in bytes
   */
  static async getDirSize(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      let size = 0;

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          size += await this.getDirSize(fullPath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          size += stats.size;
        }
      }

      return size;
    } catch (error) {
      logger.error(`Failed to calculate directory size for ${dirPath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get free disk space
   * @returns {Promise<number>>} Free space in bytes
   */
  static async getFreeDiskSpace() {
    try {
      // This is platform-specific - using df command on Unix-like systems
      // Production would use os module or platform-appropriate method
      const { stdout } = await execPromise('df -k .');
      const lines = stdout.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        const availableKb = parseInt(parts[3], 10);
        return availableKb * 1024; // Convert KB to bytes
      }
      return 0;
    } catch (error) {
      logger.warn(`Failed to get free disk space: ${error.message}`);
      return 0;
    }
  }
}

export default FileSystem;