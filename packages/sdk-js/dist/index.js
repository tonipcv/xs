'use strict';

var crypto = require('crypto');
var os = require('os');

// src/types.ts
var XaseError = class _XaseError extends Error {
  constructor(message, code, statusCode, details) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.name = "XaseError";
    Object.setPrototypeOf(this, _XaseError.prototype);
  }
};

// src/http.ts
var HttpClient = class {
  constructor(apiKey, baseUrl, timeout, retryConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.timeout = timeout;
    this.retryConfig = retryConfig;
  }
  async post(endpoint, body, headers = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    let lastError = null;
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
            ...headers
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          return await response.json();
        }
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const delay = retryAfter ? parseInt(retryAfter) * 1e3 : this.getBackoffDelay(attempt);
          if (attempt < this.retryConfig.maxRetries) {
            await this.sleep(delay);
            continue;
          }
        }
        if (response.status >= 500) {
          if (attempt < this.retryConfig.maxRetries) {
            await this.sleep(this.getBackoffDelay(attempt));
            continue;
          }
        }
        const errorData = await response.json().catch(() => ({}));
        throw new XaseError(
          errorData.error || "Request failed",
          errorData.code || "REQUEST_FAILED",
          response.status,
          errorData.details
        );
      } catch (error) {
        lastError = error;
        if (error.name === "AbortError" || error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
          if (attempt < this.retryConfig.maxRetries) {
            await this.sleep(this.getBackoffDelay(attempt));
            continue;
          }
        }
        if (error instanceof XaseError) {
          throw error;
        }
        throw new XaseError(
          error.message || "Unknown error",
          "UNKNOWN_ERROR",
          void 0,
          error
        );
      }
    }
    throw lastError || new XaseError("Max retries exceeded", "MAX_RETRIES");
  }
  /**
   * Exponential backoff with jitter
   */
  getBackoffDelay(attempt) {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(2, attempt),
      this.retryConfig.maxDelay
    );
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.floor(delay + jitter);
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/queue.ts
var Queue = class {
  constructor(httpClient, maxSize, onError, onSuccess) {
    this.httpClient = httpClient;
    this.maxSize = maxSize;
    this.onError = onError;
    this.onSuccess = onSuccess;
    this.queue = [];
    this.processing = false;
    this.closed = false;
    this.workerInterval = null;
    this.startWorker();
  }
  /**
   * Enqueue a record for async processing
   */
  enqueue(payload, options) {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new XaseError("Queue is closed", "QUEUE_CLOSED"));
        return;
      }
      if (this.queue.length >= this.maxSize) {
        const dropped = this.queue.shift();
        if (dropped) {
          const error = new XaseError("Queue full, item dropped", "QUEUE_FULL");
          this.onError?.(error);
          dropped.reject(error);
        }
      }
      this.queue.push({ payload, options, resolve, reject });
    });
  }
  /**
   * Start background worker
   */
  startWorker() {
    this.workerInterval = setInterval(() => {
      this.processQueue().catch(console.error);
    }, 100);
  }
  /**
   * Process queue items
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (!item) break;
        try {
          const result = await this.sendRecord(item.payload, item.options);
          this.onSuccess?.(result);
          item.resolve();
        } catch (error) {
          const xaseError = error instanceof XaseError ? error : new XaseError(error.message, "QUEUE_ERROR", void 0, error);
          this.onError?.(xaseError);
          item.reject(xaseError);
        }
      }
    } finally {
      this.processing = false;
    }
  }
  /**
   * Send record to API
   */
  async sendRecord(payload, options) {
    const headers = {};
    if (options?.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }
    const body = {
      input: payload.input,
      output: payload.output,
      context: payload.context,
      policyId: payload.policy,
      policyVersion: payload.policyVersion,
      decisionType: payload.decisionType,
      confidence: payload.confidence,
      processingTime: payload.processingTime,
      storePayload: payload.storePayload
    };
    return await this.httpClient.post("/records", body, headers);
  }
  /**
   * Flush all pending items
   */
  async flush(timeoutMs = 5e3) {
    const start = Date.now();
    while (this.queue.length > 0 || this.processing) {
      if (Date.now() - start > timeoutMs) {
        throw new XaseError(
          `Flush timeout: ${this.queue.length} items remaining`,
          "FLUSH_TIMEOUT"
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  /**
   * Close queue and stop worker
   */
  close() {
    this.closed = true;
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
  }
  /**
   * Get queue stats
   */
  getStats() {
    return {
      size: this.queue.length,
      processing: this.processing,
      closed: this.closed
    };
  }
};
function captureContext() {
  return {
    runtime: `node@${process.version}`,
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    pid: process.pid,
    libVersion: "0.1.0",
    // TODO: Read from package.json
    env: process.env.NODE_ENV || "development",
    timestamp: Date.now()
  };
}
function generateIdempotencyKey(data) {
  const hash = crypto.createHash("sha256");
  hash.update(data);
  return hash.digest("hex").substring(0, 32);
}
function isValidIdempotencyKey(key) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(key)) {
    return true;
  }
  const alphanumericRegex = /^[a-zA-Z0-9_-]{16,64}$/;
  return alphanumericRegex.test(key);
}

// src/client.ts
var XaseClient = class {
  constructor(config) {
    this.exitHandlersRegistered = false;
    if (!config.apiKey) {
      throw new XaseError("API key is required", "MISSING_API_KEY");
    }
    this.config = {
      baseUrl: config.baseUrl || process.env.XASE_BASE_URL || "http://localhost:3000/api/xase/v1",
      timeout: config.timeout || 3e3,
      fireAndForget: config.fireAndForget ?? true,
      maxRetries: config.maxRetries || 3,
      queueMaxSize: config.queueMaxSize || 1e4,
      onError: config.onError || (() => {
      }),
      onSuccess: config.onSuccess || (() => {
      }),
      apiKey: config.apiKey
    };
    this.httpClient = new HttpClient(
      this.config.apiKey,
      this.config.baseUrl,
      this.config.timeout,
      {
        maxRetries: this.config.maxRetries,
        baseDelay: 100,
        maxDelay: 5e3
      }
    );
    if (this.config.fireAndForget) {
      this.queue = new Queue(
        this.httpClient,
        this.config.queueMaxSize,
        this.config.onError,
        this.config.onSuccess
      );
      this.registerExitHandlers();
    }
  }
  /**
   * Record an AI decision as immutable evidence
   * 
   * @param payload - Decision data (policy, input, output, etc.)
   * @param options - Optional settings (idempotency, timeout, etc.)
   * @returns Promise<RecordResult | void> - Result if sync, void if fire-and-forget
   */
  async record(payload, options) {
    this.validatePayload(payload);
    const enrichedPayload = {
      ...payload,
      context: {
        ...captureContext(),
        ...payload.context
      }
    };
    let finalOptions = options;
    if (!options?.idempotencyKey && payload.transactionId) {
      const key = generateIdempotencyKey(payload.transactionId);
      finalOptions = {
        ...options,
        idempotencyKey: key
      };
    }
    if (finalOptions?.idempotencyKey && !isValidIdempotencyKey(finalOptions.idempotencyKey)) {
      throw new XaseError(
        "Invalid idempotency key format. Use UUID v4 or alphanumeric 16-64 chars",
        "INVALID_IDEMPOTENCY_KEY"
      );
    }
    if (this.config.fireAndForget && !options?.skipQueue && this.queue) {
      await this.queue.enqueue(enrichedPayload, finalOptions);
      return;
    }
    return await this.sendRecord(enrichedPayload, finalOptions);
  }
  /**
   * Send record synchronously
   */
  async sendRecord(payload, options) {
    const headers = {};
    if (options?.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }
    const body = {
      input: payload.input,
      output: payload.output,
      context: payload.context,
      policyId: payload.policy,
      policyVersion: payload.policyVersion,
      decisionType: payload.decisionType,
      confidence: payload.confidence,
      processingTime: payload.processingTime,
      storePayload: payload.storePayload
    };
    return await this.httpClient.post("/records", body, headers);
  }
  /**
   * Validate record payload
   */
  validatePayload(payload) {
    if (!payload.policy) {
      throw new XaseError("Policy is required", "MISSING_POLICY");
    }
    if (!payload.input || typeof payload.input !== "object") {
      throw new XaseError("Input must be an object", "INVALID_INPUT");
    }
    if (!payload.output || typeof payload.output !== "object") {
      throw new XaseError("Output must be an object", "INVALID_OUTPUT");
    }
    if (payload.confidence !== void 0) {
      if (typeof payload.confidence !== "number" || payload.confidence < 0 || payload.confidence > 1) {
        throw new XaseError("Confidence must be a number between 0 and 1", "INVALID_CONFIDENCE");
      }
    }
  }
  /**
   * Flush pending queue items
   * 
   * @param timeoutMs - Maximum time to wait (default: 5000ms)
   */
  async flush(timeoutMs = 5e3) {
    if (this.queue) {
      await this.queue.flush(timeoutMs);
    }
  }
  /**
   * Close client and flush queue
   */
  async close() {
    try {
      await this.flush(2e3);
    } finally {
      this.queue?.close();
    }
  }
  /**
   * Get queue statistics (if fire-and-forget enabled)
   */
  getStats() {
    if (!this.queue) {
      return null;
    }
    return this.queue.getStats();
  }
  /**
   * Register process exit handlers
   */
  registerExitHandlers() {
    if (this.exitHandlersRegistered) return;
    const handleExit = async () => {
      try {
        await this.flush(2e3);
      } catch (error) {
        console.error("Error flushing queue on exit:", error);
      }
    };
    process.on("beforeExit", handleExit);
    process.on("SIGINT", () => {
      handleExit().finally(() => process.exit(0));
    });
    process.on("SIGTERM", () => {
      handleExit().finally(() => process.exit(0));
    });
    this.exitHandlersRegistered = true;
  }
};

exports.XaseClient = XaseClient;
exports.XaseError = XaseError;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map