import CacheStorage from './cache-storage.js';
import { sleepMs } from '../../utils/index.js';
import logger from '../../utils/logger.js';
import { v4 } from 'uuid';
import { inject, injectable } from 'inversify';
import TYPES from '../../config/types.js';
import { EnvironmentConfig } from '../../config/models/environment-config.js';
import LockMaxedOut from '../../errors/redis/lock-maxed-out.js';
import { RedisValue } from '../../models/storage/index.js';


/**
 * This is a mock implementation of Redis. It is used for testing purposes.
 * Mocked without `redis-mock` due to its specific implementation and capabilities, and without redis-memory-server
 * due to its limitations on Windows (which may be the target machine of the Motion developer).
 *
 * The locks would be replaced by the Redlock library.
 */
@injectable()
export default class CacheStorageImpl implements CacheStorage {
    private readonly name: string = 'CacheStorageImpl';
    private readonly accessTokenValidationTtl: number;
    private readonly maxLockWaitTime: number | undefined;
    private readonly client: any;
    private readonly keyPrefix: string;
    private data: Map<string, RedisValue> = new Map<string, RedisValue>();
    private locks: Set<string> = new Set<string>();

    constructor(@inject(TYPES.EnvironmentConfig) config: EnvironmentConfig) {
        this.accessTokenValidationTtl = config.services.meta.user.accessTokenValidationTtl;
        this.maxLockWaitTime = config.redis.maxLockWaitTime;
        this.client = {};
        this.keyPrefix = `${this.name}`;
    }

    public getData(): Map<string, RedisValue> {
        return this.data;
    }

    public setData(data: Map<string, RedisValue>): void {
        this.data = data;
    }

    public init(): Promise<void> {
        logger.info('Initializing Redis connection');
        return Promise.resolve();
    }

    public endConnection(): Promise<void> {
        logger.info('Ending Redis connection');
        return Promise.resolve();
    }

    public getClient(): unknown {
        return this.client;
    }

    private getKey(key: string): string {
        return `${this.keyPrefix}::${key}`;
    }

    private getLockKeyId(lockSuffix: string) {
        return this.getKey(`lock::${lockSuffix}`);
    }

    private async get(key: string): Promise<RedisValue | undefined> {
        logger.debug(`Getting key at: ${key}`);
        return Promise.resolve(this.data.get(key));
    }

    /**
     * Uses NX to control whether a key should be set in cases where it is already set, or not.
     * This helps the moderation of rate limiting, to allow a single instance to check for recovery while others wait.
     *
     * @param key
     * @param value
     * @param ttl
     * @param only_if_not_set
     * @private
     */
    private async set(key: string, value: string, ttl: number, only_if_not_set?: boolean): Promise<boolean> {
        logger.info(`Setting key at: ${key}, ttl: ${ttl}, only_if_not_set: ${only_if_not_set}`);
        const options = {PX: ttl, NX: false};
        if (typeof only_if_not_set === 'boolean') {
            options.NX = only_if_not_set;
        }

        // return await this.client.set(key, value, options) === 'OK'; // to be uncommented for a real Redis instance
        if (only_if_not_set === true) {
            if (this.data.has(key)) {
                return Promise.resolve(false);
            }
        }

        this.data.set(key, {value, timestamp: Date.now() + ttl});
        return Promise.resolve(true);
    }

    public async getLockValue(lockId: string): Promise<string | undefined> {
        const value = await this.get(lockId);
        return value?.value;
    }

    public async exists(key: string): Promise<boolean> {
        const value = await this.get(key);
        return !!value && value.timestamp > Date.now();
    }

    private getAccessTokenValidationKey(customerName: string): string {
        return this.getKey(`token-validation::customer::${customerName}`);
    }

    public accessTokenValidationKeyExists(customerName: string): Promise<boolean> {
        return this.exists(this.getAccessTokenValidationKey(customerName));
    }

    public setAccessTokenValidationKey(customerName: string): Promise<boolean> {
        return this.set(this.getAccessTokenValidationKey(customerName), 'true', this.accessTokenValidationTtl);
    }

    public getServiceLockId(serviceName: string): string {
        return this.getLockKeyId(`service::${serviceName}`);
    }

    public getCustomerThrottleLockId(customerName: string): string {
        return this.getLockKeyId(`customer::${customerName}`);
    }

    public getCustomerThrottleCheckLockId(customerName: string): string {
        return this.getLockKeyId(`customer-check::${customerName}`);
    }

    // to be replaced with the real ttl of a given key in Redis when using a real Redis
    public async getLockTimestamp(lockId: string): Promise<number | undefined> {
        const value = await this.get(lockId);
        if (!value) {
            return value;
        }

        return value.timestamp;
    }

    public async lockExists(lockId: string): Promise<boolean> {
        const timestamp = await this.getLockTimestamp(lockId);
        return !!timestamp && timestamp > Date.now();
    }

    public async awaitLockExpiration(lockId: string): Promise<boolean> {
        let timestamp = await this.getLockTimestamp(lockId);
        if (timestamp) {
            logger.info(`Will await lock at ${lockId} until ${new Date(timestamp).toISOString()}`);
        }

        let totalWaited: number = 0;
        const sleepIntervalMs = 500;
        while (timestamp && timestamp > Date.now()) {
            if (this.maxLockWaitTime! && totalWaited > this.maxLockWaitTime) {
                throw new LockMaxedOut(lockId, totalWaited, this.maxLockWaitTime!);
            }

            await sleepMs(sleepIntervalMs);
            totalWaited += sleepIntervalMs;
            timestamp = await this.getLockTimestamp(lockId);
        }
        if (this.locks.has(lockId)) {
            this.locks.delete(lockId);
        }
        return totalWaited > 0;
    }

    public async setLock(lockId: string, durationMs: number, value?: string, overwrite?: boolean): Promise<boolean> {
        await this.awaitLockExpiration(lockId);
        logger.info(`Setting lock ${lockId} for ${durationMs}ms`);
        const result = await this.set(lockId, value || v4(), durationMs, overwrite);
        if (result) {
            this.locks.add(lockId);
        }
        return result;
    }

    public async releaseLock(lockId: string): Promise<void> {
        logger.info(`Releasing lock ${lockId}`);
        this.data.delete(lockId);
        if (this.locks.has(lockId)) {
            this.locks.delete(lockId);
        }
        return Promise.resolve();
    }

    public async unlockAll(): Promise<void> {
        logger.info(`Releasing all ${this.locks.size} locks`);
        await Promise.all(Array.from(this.locks).map(lockId => this.releaseLock(lockId)));
        logger.info('All locks released');
    }
}