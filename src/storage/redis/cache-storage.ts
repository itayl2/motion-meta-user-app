import { RedisValue } from '../../models/storage/index.js';


export default interface CacheStorage {
    init(): Promise<void>;

    endConnection(): Promise<void>;

    getClient(): unknown;

    accessTokenValidationKeyExists(customerName: string): Promise<boolean>;

    setAccessTokenValidationKey(customerName: string): Promise<boolean>;

    getServiceLockId(serviceName: string): string;

    getCustomerThrottleLockId(customerName: string): string;

    getCustomerThrottleCheckLockId(customerName: string): string;

    getLockTimestamp(lockId: string): Promise<number | undefined>;

    exists(key: string): Promise<boolean>;

    setLock(lockId: string, durationMs: number, value?: string, overwrite?: boolean): Promise<boolean>;

    getLockValue(lockId: string): Promise<string | undefined>;

    releaseLock(lockId: string): Promise<void>;

    awaitLockExpiration(lockId: string): Promise<boolean>;

    lockExists(lockId: string): Promise<boolean>;

    getData(): Map<string, RedisValue>;

    setData(data: Map<string, RedisValue>): void;

    unlockAll(): Promise<void>;
}