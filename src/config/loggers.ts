import pino from 'pino';
import { env } from './env';

function createPinoLogger(service: 'app' | 'analytics'): pino.Logger {
  const options: pino.LoggerOptions = {
    level: env.LOG_LEVEL,
    base: { service },
  };

  // LOG_FILE applies only to app logs; analytics events go to stdout (DLT-004 MVP).
  if (service === 'app' && env.LOG_FILE) {
    return pino(
      options,
      pino.multistream([
        { stream: process.stdout },
        {
          stream: pino.destination({
            dest: env.LOG_FILE,
            mkdir: true,
            sync: false,
          }),
        },
      ]),
    );
  }

  return pino(options);
}

export const appLogger = createPinoLogger('app');
export const analyticsLogger = createPinoLogger('analytics');
