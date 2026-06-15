/**
 * LakeQL Bug Reproduction - @lakeql/logger
 *
 * This package provides structured logging with sensitive data redaction.
 * Replace the code below with your reproduction.
 *
 * Note: Set LOG_LEVEL env var (default: "info").
 */

// Set env before importing logger
process.env.LOG_LEVEL = "debug"

import { createLogger } from "@lakeql/logger"

const logger = createLogger()

// Basic logging at different levels
logger.info("Application started")
logger.debug("Debug information", { port: 3000, host: "localhost" })
logger.warn("Deprecation warning", { feature: "oldEndpoint" })

// Logging with context
logger
  .withContext({ requestId: "abc-123", userId: "user-42" })
  .info("Request received")

// Logging with metadata
logger.withMetadata({ duration: 150, status: 200 }).info("Request completed")

// Sensitive data is automatically redacted
logger.info("User login", {
  username: "alice", // Will be redacted
  password: "secret123", // Will be redacted
  token: "jwt-abc", // Will be redacted
  action: "login", // Will NOT be redacted
})

// Error logging
try {
  throw new Error("Something went wrong")
} catch (err) {
  logger.withError(err as Error).error("Operation failed")
}
