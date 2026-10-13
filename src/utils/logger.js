export const log = Object.fromEntries(
  ['info', 'warn', 'error'].map((level) => [
    level,
    (message, error) => {
      // Never serialize Discord requests: they can contain authorization headers.
      console[level === 'info' ? 'log' : level](
        `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${error ? ` (${error.name || 'Error'}: ${error.message || 'unknown'})` : ''}`,
      );
    },
  ]),
);
