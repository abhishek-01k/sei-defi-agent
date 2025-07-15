import { logger } from './logger';

/**
 * Generic polling function with state monitoring
 */
export async function poll<T>(
  pollFn: () => Promise<boolean>,
  getStateFn: () => Promise<T | undefined>,
  isCompleteFn: (state?: T) => boolean,
  interval: number,
  logger: any
): Promise<void> {
  let isRunning = true;
  let pollCount = 0;

  while (isRunning) {
    try {
      pollCount++;
      logger.info(`[Poll ${pollCount}] Starting polling iteration...`);

      // Check if workflow is complete
      const state = await getStateFn();
      if (isCompleteFn(state)) {
        logger.info('Workflow completed, stopping polling');
        break;
      }

      // Execute polling function
      const shouldContinue = await pollFn();
      if (!shouldContinue) {
        logger.warn('Polling function returned false, stopping');
        break;
      }

      // Wait for next iteration
      logger.info(`Waiting ${interval}ms before next poll...`);
      await new Promise(resolve => setTimeout(resolve, interval));
    } catch (error) {
      logger.error(`Error in polling iteration ${pollCount}:`, error);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  logger.info('Polling completed');
}

/**
 * Simple polling function without state monitoring
 */
export async function simplePoll(
  pollFn: () => Promise<boolean>,
  interval: number,
  maxIterations?: number
): Promise<void> {
  let iteration = 0;
  const maxIter = maxIterations || Infinity;

  while (iteration < maxIter) {
    try {
      iteration++;
      
      const shouldContinue = await pollFn();
      if (!shouldContinue) {
        break;
      }

      if (iteration < maxIter) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    } catch (error) {
      logger.error(`Error in polling iteration ${iteration}:`, error);
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
}

/**
 * Polling with exponential backoff
 */
export async function pollWithBackoff(
  pollFn: () => Promise<boolean>,
  initialInterval: number,
  maxInterval: number = 60000,
  backoffMultiplier: number = 2,
  maxRetries?: number
): Promise<void> {
  let currentInterval = initialInterval;
  let retries = 0;
  const maxRetryCount = maxRetries || Infinity;

  while (retries < maxRetryCount) {
    try {
      const shouldContinue = await pollFn();
      if (!shouldContinue) {
        break;
      }

      // Reset interval on success
      currentInterval = initialInterval;
      retries = 0;

      await new Promise(resolve => setTimeout(resolve, currentInterval));
    } catch (error) {
      retries++;
      logger.error(`Error in polling (retry ${retries}):`, error);

      if (retries >= maxRetryCount) {
        throw new Error(`Max retries (${maxRetryCount}) exceeded`);
      }

      // Exponential backoff
      currentInterval = Math.min(currentInterval * backoffMultiplier, maxInterval);
      await new Promise(resolve => setTimeout(resolve, currentInterval));
    }
  }
} 