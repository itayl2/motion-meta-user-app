import 'reflect-metadata';
import { EnvironmentConfig } from './models/environment-config.js';
import { MetaEndpoints } from '../models/agents/index.js';
import { envIntOrUndefined, envToArray, envToBoolean, envToFloat, envToInt, parseIntOrDie } from '../utils/env.js';

export default class EnvConfig {
    private static instance: EnvConfig;

    private readonly environmentConfig: EnvironmentConfig;

    private constructor() {
        this.environmentConfig = {
            platforms: {
                meta: {
                    baseUrl: process.env.META_BASE_URL || 'graph.facebook.com',
                    graphQLVersion: process.env.META_GRAPHQL_VERSION || 'v18.0',
                    endpoints: {
                        [MetaEndpoints.SELF_FETCH]: {
                            endpoint: process.env.META_SELF_FETCH_ENDPOINT || '/me',
                            retry: {
                                maxAttempts: envIntOrUndefined('META_SELF_FETCH_ENDPOINT_MAX_ATTEMPTS'),
                                startingDelay: envIntOrUndefined('META_SELF_FETCH_ENDPOINT_STARTING_DELAY'),
                                multiplier: envIntOrUndefined('META_SELF_FETCH_ENDPOINT_MULTIPLIER'),
                                maxDelay: envIntOrUndefined('META_SELF_FETCH_ENDPOINT_MAX_DELAY'),
                            },
                            fields: envToArray('META_FIELDS_USER_FETCH', ['id', 'name', 'last_name']).join(','),
                        },
                    },
                    maxCallCount: envToInt('META_MAX_CALL_COUNT', 100), // TODO confirm whether this is relevant for Motion. If so, this should be re-calculated / re-fetched periodically
                    maxCallCountFactor: envToFloat('META_MAX_CALL_COUNT_FACTOR', 0.8), // TODO confirm whether this is relevant for Motion
                    responseTotalCpuTimeWarningThreshold: envToInt('META_RESPONSE_TOTAL_CPU_TIME_WARNING_THRESHOLD', 80),
                    responseTotalTimeWarningThreshold: envToInt('META_RESPONSE_TOTAL_TIME_WARNING_THRESHOLD', 80),
                    retry: {
                        maxAttempts: envToInt('META_RETRY_MAX_ATTEMPTS', 5),
                        startingDelay: envToInt('META_RETRY_STARTING_DELAY', 1000),
                        multiplier: envToFloat('env.META_RETRY_MULTIPLIER', 1.5),
                        maxDelay: envToInt('META_RETRY_MAX_DELAY', 10000),
                    },
                    throttlingErrorCodes: envToArray('META_THROTTLING_ERROR_CODES', ['4', '17', '32', '613', '32', '80001', '80002', '80005', '80006', '80008', '80009', '80014']).map((i) => parseIntOrDie(i)),
                    throttlingErrorCodePairs: EnvConfig.safeJsonParse(process.env.META_THROTTLING_ERROR_CODE_PAIRS || '', '{"80000": 2446079, "80004": 2446079, "80003": 2446079}'),
                    throttlingMessageSubstrings: envToArray('META_THROTTLING_MESSAGE_SUBSTRINGS', ['request limit reached']).map((i) => i.toLowerCase()),
                },
            },
            redis: {
                maxLockWaitTime: envIntOrUndefined('REDIS_MAX_LOCK_WAIT_TIME_MS'),
            },
            services: {
                meta: {
                    user: {
                        accessTokenValidationTtl: envToInt('SERVICES_META_USER_ACCESS_TOKEN_VALIDATION_TTL', 2 * 60 * 60 * 1000),
                        concurrentRequests: envToInt('SERVICES_META_USER_CONCURRENT_REQUESTS', 1),
                        intervalInMs: envToInt('SERVICES_META_USER_INTERVAL_MS', 2000),
                        runOnInit: envToBoolean('SERVICES_META_USER_RUN_ON_INIT', 'false'),
                    },
                },
            },
            stage: process.env.STAGE || 'dev',
            taskId: '', // populated during application startup
        };

        this.mergeRetryConfigs();
    };

    private mergeRetryConfigs(): void {
        Object.keys(this.environmentConfig.platforms).forEach((platform) => {
            const platformKey = platform as keyof typeof this.environmentConfig.platforms;
            const platformConfig = this.environmentConfig.platforms[platformKey];
            const fallbackConfig = platformConfig.retry;

            Object.keys(this.environmentConfig.platforms[platformKey].endpoints).forEach((endpoint) => {
                const endpointKey = endpoint as keyof typeof platformConfig.endpoints;
                const endpointConfig = platformConfig.endpoints[endpointKey];

                endpointConfig.retry = {
                    maxAttempts: endpointConfig.retry?.maxAttempts ?? fallbackConfig.maxAttempts,
                    startingDelay: endpointConfig.retry?.startingDelay ?? fallbackConfig.startingDelay,
                    multiplier: endpointConfig.retry?.multiplier ?? fallbackConfig.multiplier,
                    maxDelay: endpointConfig.retry?.maxDelay ?? fallbackConfig.maxDelay,
                };
            });
        });
    }

    static getInstance(): EnvConfig {
        if (!EnvConfig.instance) {
            EnvConfig.instance = new EnvConfig();
        }

        return EnvConfig.instance;
    }

    public getConfig(): EnvironmentConfig {
        return this.environmentConfig;
    }

    static safeJsonParse(value: string, defaultValue: string) {
        try {
            return JSON.parse(value);
        } catch (error) {
            return JSON.parse(defaultValue);
        }
    }

    public setTaskId(taskId: string): void {
        this.environmentConfig.taskId = taskId;
    }
}