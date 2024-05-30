import RequestManager from './request-manager';
import { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosResponseHeaders, Method } from 'axios';
import { EndpointConfig, RetryConfig, MetaConfig } from '../../config/models/environment-config.js';
import MetaErrorHandler from '../response/error/meta-error-handler.js';
import { sleepMs } from '../../utils/index.js';
import logger from '../../utils/logger.js';
import CacheStorage from '../../storage/redis/cache-storage.js';
import CredentialsManager from '../../storage/credentials/credentials-manager.js';
import { MetaAxiosError } from '../../errors/axios/meta.js';
import { inspect } from 'util';
import { AppUsage } from '../../models/http/response/throttling.js';


export type MetaRequestPayload = {
    method: Method;
    customerName: string;
    endpointConfig: EndpointConfig;
    config: MetaConfig;
    params?: any;
    body?: any;
    headers?: any;
};

export type ResponsePayload = {
    response?: AxiosResponse;
    error?: MetaAxiosError;
    isRecovery: boolean;
}

/**
 * The MetaRequestManager is responsible for executing requests to the Meta API.
 * It (joint with Redis) plays the main role in handling the response from Meta and moderating our rate
 * in response to throttling.
 */
export default class MetaRequestManager implements RequestManager {
    private readonly name: string = 'MetaRequestManager';
    private attemptsCount: number = 0;
    private readonly requestConfig: AxiosRequestConfig;

    // TODO perhaps find a better way to create an instance. We can use a factory pattern combined with the inversify
    //  container to create instances, but presents challenges in testing (less control over the cache & creds
    //  manager of the request manager)
    constructor(
        private readonly taskId: string,
        private data: MetaRequestPayload,
        private readonly axiosInstance: AxiosInstance,
        private readonly cache: CacheStorage,
        private readonly credentialsManager: CredentialsManager,
    ) {
        this.requestConfig = {
            method: this.data.method,
            url: this.data.endpointConfig.endpoint,
            data: this.data.body,
            params: this.data.params,
            headers: this.data.headers,
        };
    }

    get attempts() {
        return this.attemptsCount;
    }

    /**
     * TODO Consult Motion: is there only one type of usage across the entire app or is it per customer / per api / per app?
     * Inspect the response from Meta to see if we are getting close to rate limits.
     * The consequences of being close to it are business-logic oriented, but the analysis happens here.
     *
     * It depends if the usage is per app, customer or anything else, and how aggressive we want to be.
     * For now, this method only serves to analyze and report the received information.
     *
     * @param response
     * @private
     */
    private closeToRateLimit(response: AxiosResponse): boolean {
        const headers = response.headers;
        if (!headers) {
            logger.info(`${this.name} missing headers from response: ${inspect(response)}`);
            return false;
        }

        const rawHeaders = response.headers as AxiosResponseHeaders;
        const appUsage = rawHeaders.get('x-app-usage');
        if (!appUsage || typeof appUsage !== 'string') {
            logger.info(`${this.name} missing x-app-usage header from response: ${inspect(response)}`);
            return false;
        }

        try {
            // TODO nice to have: Joi schema validation
            const parsed: AppUsage = JSON.parse(appUsage);
            if (parsed.total_cputime >= this.data.config.responseTotalCpuTimeWarningThreshold) {
                return true;
            }

            // TODO their docs @ https://developers.facebook.com/docs/graph-api/overview/rate-limiting/ say 100 but sounds weird for time, to confirm with Motion
            if (parsed.total_time >= this.data.config.responseTotalTimeWarningThreshold) {
                return true;
            }

            return parsed.call_count >= this.data.config.maxCallCount * this.data.config.maxCallCountFactor;
        } catch (error) {
            logger.error(`${this.name} failed to parse app usage header: ${inspect(response)}`);
            return false;
        }
    }

    private getErrorHandler(error: MetaAxiosError): MetaErrorHandler {
        return new MetaErrorHandler(this.attempts, this.data.config, this.data.endpointConfig.retry as RetryConfig, error);
    }

    /**
     * If you are the instance which first set the throttling lock, the recoveryTaskId will be identical to your
     * own taskId, so you only wait for the throttling to expire and then you retry.
     *
     * Otherwise, you wait for both locks to expire i.e until the instance checking for recovery has confirmed
     * throttling is not in place anymore.
     *
     * @private
     */
    private async awaitThrottlingLocks(): Promise<boolean> {
        const throttleLockId = this.cache.getCustomerThrottleLockId(this.data.customerName);
        const waited = await this.cache.awaitLockExpiration(throttleLockId);

        if (waited) {
            logger.info(`Done waiting for throttling lock for ${this.data.customerName}, check for instance selection for recovery`);
            const recoveryLockId = this.cache.getCustomerThrottleCheckLockId(this.data.customerName);
            const recoveryTaskId = await this.cache.getLockValue(recoveryLockId);
            if (recoveryTaskId === this.taskId) {
                logger.info(`${this.taskId} now checking if throttling is still in effect`);
                return true; // other instances are waiting for the lock while this current instance checks if still throttled
            }

            logger.info(`Instance ${recoveryTaskId} is checking for throttling and not me (${this.taskId}), waiting for it to finish`);
            await this.cache.awaitLockExpiration(recoveryLockId);
        }
        return false;
    }

    /**
     * Get a validated-fresh token each time we attempt the request
     *
     * @private
     */
    private async populateAccessToken(): Promise<void> {
        if (!this.requestConfig.params) {
            this.requestConfig.params = {};
        }
        this.requestConfig.params.access_token = await this.credentialsManager.getAccessToken(this.data.customerName);
    }

    /**
     * If you are the one who set the throttling lock, you are the one to check back after it expires,
     * while the other continue waiting.
     *
     * This is controlled by two locks, one for the throttling (AAA) and one for the recovery check (BBB).
     * You await AAA and then starting checking for recovery, while other instances await both AAA and BBB,
     * which is why BBB is longer and both are re-set each time recovery fails.
     *
     * // TODO add a background scheduled task which polls for all values of taskId of all instances, and removes any locks assigned to dead taskIds
     * @param waitTime
     * @param overwrite
     * @private
     */
    private async handleNewThrottling(waitTime: number, overwrite: boolean): Promise<void> {
        const throttleLockId = this.cache.getCustomerThrottleLockId(this.data.customerName);
        const firstSet = await this.cache.setLock(throttleLockId, waitTime, undefined, overwrite);

        if (firstSet) {
            logger.info(`Throttling detected by ${this.taskId} for ${this.data.customerName}, have set a lock for ${waitTime / 1000}s`);
            const checkLockId = this.cache.getCustomerThrottleCheckLockId(this.data.customerName);
            await this.cache.setLock(checkLockId, waitTime * 5, this.taskId, false);
        } else {
            logger.info(`Throttling detected by ${this.taskId} for ${this.data.customerName}, lock already set by another instance`);
        }
    }

    /**
     * Release throttling-related locks but only if the current instance is the one who placed them there, since that
     * is the instance responsible for confirming whether throttling is still in place or not.
     *
     * @private
     */
    private async releaseThrottlingLocks(): Promise<void> {
        logger.info(`${this.taskId} releasing throttling locks`);
        const checkLockId = this.cache.getCustomerThrottleCheckLockId(this.data.customerName);
        const recoveryTaskId = await this.cache.getLockValue(checkLockId);
        if (this.taskId !== recoveryTaskId) {
            logger.warn(`${this.name} almost released locks which I (${this.taskId}) didn't set. Skipping`);
            return;
        }

        const throttleLockId = this.cache.getCustomerThrottleLockId(this.data.customerName);
        await Promise.all([
            this.cache.releaseLock(throttleLockId),
            this.cache.releaseLock(checkLockId),
        ]);
        logger.info(`${this.taskId} throttling locks released`);
    }

    /**
     * Helper method to make sure we always:
     * - release any locks if we were the ones who set them
     * - throw any errors found
     * - analyze a non-error response to see if throttling is getting close
     *
     * @param payload
     * @private
     */
    private async handleResponse(payload: ResponsePayload): Promise<AxiosResponse> {
        if (payload.isRecovery) {
            await this.releaseThrottlingLocks();
        }

        if (payload.error) {
            throw payload.error;
        }

        if (!payload.response) {
            throw new Error('Response is unexpectedly undefined'); // TODO custom error class
        }

        if (this.closeToRateLimit(payload.response)) {
            // TODO alert / report / adjust locks according to Motion's business logic
        }

        return payload.response;
    }

    /**
     * Execute the request unless throttling is in place.
     *
     * If throttling is in place, and you are the instance in charge of checking for recovery, you will retry after
     * X interval has passed and update the locks accordingly so that other instances could either continue
     * or keep waiting.
     */
    public async execute(): Promise<AxiosResponse> {
        const isRecovery = await this.awaitThrottlingLocks();
        const responsePayload: ResponsePayload = {isRecovery};
        let retry = false;
        do {
            this.attemptsCount++;
            await this.populateAccessToken();
            try {
                responsePayload.response = await this.axiosInstance.request(this.requestConfig);
                break;
            } catch (error) {
                const parsedError = new MetaAxiosError(error as AxiosError);
                logger.error(`${this.name} #${this.attempts}: ${parsedError.getMessage()}`);

                if (this.data.method !== 'GET') { // safety, only retry GET calls for now
                    responsePayload.error = parsedError;
                    return this.handleResponse(responsePayload);
                }

                const errorHandler = this.getErrorHandler(parsedError);
                errorHandler.report(this.data.method, this.data.endpointConfig.endpoint);
                retry = errorHandler.shouldRetry();
                if (!retry) {
                    responsePayload.error = parsedError;
                    return this.handleResponse(responsePayload);
                }

                const waitTime = errorHandler.getRetryWaitTime();
                if (!waitTime) {
                    continue;
                }

                if (errorHandler.isThrottling()) {
                    await this.handleNewThrottling(waitTime, isRecovery);
                    return await this.execute();
                }
                await sleepMs(waitTime);
            }
        } while (retry);

        return this.handleResponse(responsePayload);
    }
}