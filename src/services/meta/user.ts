import 'reflect-metadata';
import { inject, injectable } from 'inversify';
import TYPES from '../../config/types.js';
import { Service } from '../../services/service.js';
import { EnvironmentConfig } from '../../config/models/environment-config.js';
import CacheStorage from '../../storage/redis/cache-storage.js';
import DynamoDBClient from '../../storage/dynamodb/dynamodb-client.js';
import logger from '../../utils/logger.js';
import { inspect } from 'util';

/**
 * This is the service which triggers the fetching of data on interval / on demand from the Meta API.
 * It is the main service of the application, utilized by the app handler directly.
 */
@injectable()
export class MetaUserService implements Service {
    private readonly name = 'MetaUserService';
    private enabled: boolean = false;
    private spamRunEnabled: boolean = false;
    private task: any;
    private readonly intervalInMs: number;
    private readonly runOnInit: boolean;
    private customerName: string | undefined;

    constructor(
        @inject(TYPES.MetaUserAgent) private readonly agent: any,
        @inject(TYPES.EnvironmentConfig) private readonly config: EnvironmentConfig,
        @inject(TYPES.CacheStorage) private readonly cache: CacheStorage,
        @inject(TYPES.DynamoDBClient) private readonly storage: DynamoDBClient,
    ) {
        this.setupMetrics();
        this.intervalInMs = this.config.services.meta.user.intervalInMs;
        this.runOnInit = this.config.services.meta.user.runOnInit;
        this.spamRunEnabled = this.config.services.meta.user.concurrentRequests > 1;
    }

    private setupMetrics(): void {
        // TODO prometheus metrics
    }

    private setNextTask(): void {
        if (!this.enabled) {
            logger.info(`${this.name} is disabled so skipping setting the next task`);
            return;
        }

        const method = this.run.bind(this);
        this.task = setTimeout(
            async () => await method(),
            this.intervalInMs
        );
    }

    public async init(): Promise<void> {
        const [customer] = await this.storage.getCustomers();
        this.customerName = customer.name;
        this.enabled = true;
        if (this.runOnInit) {
            logger.info(`Running ${this.name}:${this.customerName} on init`);
            await this.run();
        } else {
            this.setNextTask();
        }
        logger.info(`Finished initializing ${this.name} for: ${this.customerName}`);
    }

    // IMPORTANT: should not run in production, this is only for demo purposes to demonstrate rate limitting handling
    private async spamRun(): Promise<void> {
        try {
            logger.info(`Running ${this.name} spamRun for: ${this.customerName}, concurrentRequests: ${this.config.services.meta.user.concurrentRequests}`);
            const arrayLike = {length: this.config.services.meta.user.concurrentRequests};
            const promises = Array.from(arrayLike, () => this.agent.getUserInfo(this.customerName));
            await Promise.all(promises);
        } catch (error) {
            logger.error(`${this.name} Error in spamRun: ${inspect(error)}`);
        }
    }

    public async runOnce(customerName: string): Promise<void> {
        if (!this.enabled) {
            logger.info(`${this.name} is disabled so skipping the run`);
            return;
        }

        if (this.spamRunEnabled) {
            return this.spamRun();
        }

        logger.info(`Running ${this.name} for: ${customerName}`);
        // await this.spamRun();
        const result = await this.agent.getUserInfo(customerName);
        if (result.success) {
            // TODO increment counter with labels (service, customer)
            // TODO add builder class to convert raw data to stored user
            // TODO update redis first and only update dynamodb if found change in redis?
            await this.storage.updateUserDetails({
                id: result.data.id,
                name: result.data.name,
                lastName: result.data.last_name,
                updated: Date.now(),
            });
        } else {
            logger.error(`${this.name} Received error result for ${customerName}: ${inspect(result, true, 5)}`);
            // TODO increment error counter with relevant labels (service, customer)
        }

        // TODO update heartbeat metric with labels (service, customer)
        logger.info(`Finished ${this.name} for: ${customerName}`);
    }

    public async run(): Promise<void> {
        await this.runOnce(this.customerName!);
        this.setNextTask();
    }

    public async stop(): Promise<void> {
        this.enabled = false;
        if (this.task) {
            logger.info(`Stopping ${this.name}`);
            clearTimeout(this.task);
        }
    }
}