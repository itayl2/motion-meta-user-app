import { MetaEndpoints } from '../../models/agents/index.js';

export type RetryConfig = {
    maxAttempts: number;
    startingDelay: number;
    multiplier: number;
    maxDelay: number;
};

export type EndpointConfig = {
    endpoint: string;
    retry: Partial<RetryConfig>;
    fields?: string;
};

export type MetaConfig = {
    baseUrl: string;
    graphQLVersion: string;
    maxCallCount: number;
    maxCallCountFactor: number;
    throttlingErrorCodes: number[];
    throttlingErrorCodePairs: any;
    throttlingMessageSubstrings: string[];
    responseTotalCpuTimeWarningThreshold: number;
    responseTotalTimeWarningThreshold: number;
    retry: RetryConfig;
    endpoints: {
        [MetaEndpoints.SELF_FETCH]: EndpointConfig;
    };
};

export type MetaUserServiceConfig = {
    intervalInMs: number;
    accessTokenValidationTtl: number;
    runOnInit: boolean;
    concurrentRequests: number;
};

export type MetaServicesConfig = {
    user: MetaUserServiceConfig;
};

export type ServicesConfig = {
    meta: MetaServicesConfig;
};

export type RedisConfig = {
    maxLockWaitTime?: number;
};

export type PlatformsConfig = {
    meta: MetaConfig;
};

export type EnvironmentConfig = {
    platforms: PlatformsConfig;
    services: ServicesConfig;
    taskId: string;
    stage: string;
    redis: RedisConfig;
};