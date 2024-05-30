// Imports this first so that the .env could affect winston before it is imported
import ProcessConfigLoader from '../config/process-config-loader.js';

ProcessConfigLoader.load('.env'); // to make sure the LOG_LEVEL in .env is loaded before winston

import * as winston from 'winston';


/**
 * Easy singleton logger.
 * Would normally be further adjusted and formatted to fit the needs of the project: sticky params, custom formatters, etc.
 */
const logger = function () {
    const format = winston.format.printf((info) => {
        info.service = process.env.SERVICE_NAME;
        return JSON.stringify(info);
    });

    return winston.createLogger({
        exitOnError: false,
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
            }),
            format,
            winston.format.splat(),
            winston.format.errors({stack: true}),
        ),
        level: process.env.LOG_LEVEL || 'info',
        transports: [new winston.transports.Console({handleExceptions: true})],
    });
}();

export default logger;