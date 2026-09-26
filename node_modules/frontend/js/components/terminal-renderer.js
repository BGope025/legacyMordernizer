// Renders Bob-Shell CLI output visually in the browser
class TerminalRenderer {
    constructor(containerId = 'terminalOutput') {
        this.container = document.getElementById(containerId);
        this.maxLines = 1000; // Maximum lines to keep in terminal
        this.lineCount = 0;
        this.isPaused = false;
        this.buffer = [];
    }

    // Add a line to the terminal
    addLine(text, options = {}) {
        if (this.isPaused) {
            this.buffer.push({ text, options, timestamp: Date.now() });
            return;
        }

        const { type = 'info', timestamp = true } = options;
        
        // Create line element
        const lineDiv = document.createElement('div');
        lineDiv.className = `terminal-line line-${type}`;
        
        // Add timestamp if requested
        if (timestamp) {
            const timeSpan = document.createElement('span');
            timeSpan.className = 'timestamp';
            timeSpan.textContent = new Date().toLocaleTimeString();
            lineDiv.appendChild(timeSpan);
        }
        
        // Add text content
        const textSpan = document.createElement('span');
        textSpan.textContent = ` ${text}`;
        lineDiv.appendChild(textSpan);
        
        // Add to container
        this.container.appendChild(lineDiv);
        this.lineCount++;
        
        // Limit lines to prevent memory issues
        if (this.lineCount > this.maxLines) {
            const firstLine = this.container.firstElementChild;
            if (firstLine) {
                firstLine.remove();
                this.lineCount--;
            }
        }
        
        // Auto-scroll to bottom
        this.scrollToBottom();
        
        // Process buffered lines if we were paused
        if (this.isPaused && this.buffer.length > 0) {
            this.flushBuffer();
        }
    }

    // Add multiple lines at once
    addLines(lines) {
        lines.forEach(line => {
            if (typeof line === 'string') {
                this.addLine(line);
            } else {
                this.addLine(line.text, line);
            }
        });
    }

    // Clear the terminal
    clear() {
        this.container.innerHTML = '';
        this.lineCount = 0;
        this.buffer = [];
    }

    // Pause rendering (buffer incoming lines)
    pause() {
        this.isPaused = true;
    }

    // Resume rendering and flush buffer
    resume() {
        this.isPaused = false;
        this.flushBuffer();
    }

    // Flush buffered lines
    flushBuffer() {
        if (!this.isPaused && this.buffer.length > 0) {
            this.addLines(this.buffer);
            this.buffer = [];
        }
    }

    // Scroll to bottom of terminal
    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }

    // Get current line count
    getLineCount() {
        return this.lineCount;
    }

    // Set maximum lines
    setMaxLines(max) {
        this.maxLines = max;
        // Trim existing lines if needed
        while (this.lineCount > this.maxLines && this.container.firstElementChild) {
            this.container.firstElementChild.remove();
            this.lineCount--;
        }
    }
}

// Export singleton instance
export const terminalRenderer = new TerminalRenderer();
