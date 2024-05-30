import { Container, inject, injectable } from 'inversify';
import { MetaUserService } from './services/meta/user.js';
import TYPES from './config/types.js';
import { getTaskId, setLoggerTaskId } from './utils/index.js';
import CacheStorage from './storage/redis/cache-storage.js';
import EnvConfig from './config/env-config.js';
import SecretsManager from './storage/secrets/secrets-manager.js';
import DynamoDBClient from './storage/dynamodb/dynamodb-client.js';
import logger from './utils/logger.js';
import { inspect } from 'util';
import { CustomerEvent } from './models/events/index.js';
import { Context } from 'aws-lambda';

/**
 * The main entry point of the entire application.
 * Initializes the components required for operation and then starts the main service responsible for data fetching.
 * Listens for shutdown signals to gracefully terminate.
 */
@injectable()
export default class AppHandler {
    private readonly name: string = 'AppHandler';

    constructor(@inject(TYPES.Container) private readonly container: Container) {}

    private async signalsHandler(signal: string): Promise<void> {
        logger.info(`${this.name} The service is about to shut down: ${signal}`);

        await this.container.get<MetaUserService>(TYPES.MetaUserService).stop();

        // TODO if there is a polling process for work tasks, stop the polling

        const cache = this.container.get<CacheStorage>(TYPES.CacheStorage);
        await cache.unlockAll()
            .catch((error) => logger.error(`${this.name} Failed to unlock all redis locks during ${signal} shutdown: ${inspect(error)}`));
        await cache.endConnection()
            .catch((error) => logger.error(`${this.name} Failed to disconnect from redis during ${signal} shutdown: ${inspect(error)}`));
    }

    private setupSignalsHandler(): void {
        logger.info('Setting up signals handler');
        const handler = this.signalsHandler.bind(this);
        process.on('SIGTERM', () => handler('SIGTERM'));
        process.on('SIGINT', () => handler('SIGINT'));
    }

    public async start() {
        logger.info('Starting app');
        const taskId = await getTaskId();
        EnvConfig.getInstance().setTaskId(taskId);
        setLoggerTaskId(taskId);

        await this.container.get<CacheStorage>(TYPES.CacheStorage).init();

        const [customer] = await this.container.get<DynamoDBClient>(TYPES.DynamoDBClient).getCustomers();
        const {name} = customer;
        const submittedAccessToken = process.env.META_ACCESS_TOKEN;
        if (!submittedAccessToken) {
            throw new Error('Missing environment var META_ACCESS_TOKEN');
        }

        this.container.get<SecretsManager>(TYPES.SecretsManager).populateSecret(name, submittedAccessToken);

        this.setupSignalsHandler();
        await this.container.get<MetaUserService>(TYPES.MetaUserService).init();
    }

    public async handleRequest(event: CustomerEvent, context: Context): Promise<void> {
        const {customerName} = event;
        await this.container.get<MetaUserService>(TYPES.MetaUserService).runOnce(customerName);
    }
}
