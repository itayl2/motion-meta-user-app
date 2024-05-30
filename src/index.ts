import ProcessConfigLoader from './config/process-config-loader.js';

ProcessConfigLoader.load('.env');

import TYPES from './config/types.js';
import ContainerConfigLoader from './config/container-config-loader.js';
import EnvConfig from './config/env-config.js';
import { Container } from 'inversify';
import logger from './utils/logger.js';
import AppHandler from './app-handler.js';
import { inspect } from 'util';
import { Context } from 'aws-lambda';
import { CustomerEvent } from './models/events/index.js';

// TODO if we go the Lambda route, we would need a few things:
// - Change container initialization to better support statelessness and cold starts
// - Handle throttling in a non-blocking way. For example:
//      - setup the redis lock
//      - if happens rarely, add a db task to a table being polled by another Lambda on an interval until throttling is done
//      - if happens often, use SQS so that every X events a Lambda spins up and handles it, clearing it from the queue only once throttling is gone
export const lambdaHandler = async (event: CustomerEvent, context: Context): Promise<any> => {
    try {
        await container.get<AppHandler>(TYPES.AppHandler).handleRequest(event, context);
        return {
            statusCode: 200,
            body: JSON.stringify({success: true}),
        };
    } catch (error) {
        logger.error(`Failed to handle request: ${inspect(error)}`);
        return {
            statusCode: 500,
            body: JSON.stringify({success: false}),
        };
    }
};

export const start = async (container: Container) => {
    logger.info('starting main application');
    const appHandler = container.get<AppHandler>(TYPES.AppHandler);
    try {
        await appHandler.start();
    } catch (error) {
        logger.error(`Failed to start appHandler: ${inspect(error)}`);
        throw error;
    }
};

const container = ContainerConfigLoader.getInstance(EnvConfig.getInstance().getConfig());
start(container).catch((error) => {
    logger.error(`Failed to start app: ${inspect(error)}`);
    process.exit(1);
});