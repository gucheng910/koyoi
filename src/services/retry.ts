// ============================================================
//  重试工具
//  为任意 async 函数提供指数退避重试
// ============================================================

export interface RetryOptions {
  maxRetries?: number;     // 最大重试次数，默认 2
  baseDelay?: number;      // 基础延迟 ms，默认 1000
  onRetry?: (attempt: number, error: any) => void;
}

/**
 * 包装异步函数，失败时自动重试
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 2, baseDelay = 1000, onRetry } = options;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) {
        onRetry?.(attempt + 1, e);
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError;
}

/**
 * 静默重试：失败后返回默认值，不抛异常
 */
export async function withSilentRetry<T>(
  fn: () => Promise<T>,
  fallback: T,
  options: RetryOptions = {}
): Promise<T> {
  try {
    return await withRetry(fn, options);
  } catch {
    return fallback;
  }
}
