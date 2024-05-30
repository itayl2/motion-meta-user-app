import ErrorHandler from './error-handler.js';
import { Method } from 'axios';
import logger from '../../../utils/logger.js';
import { RetryConfig, MetaConfig } from '../../../config/models/environment-config.js';
import { StatusCodes } from 'http-status-codes';
import { MetaAxiosError, ParsedAxiosError } from '../../../errors/axios/meta.js';
import { ErrorType } from '../../../models/http/response/errors.js';

/**
 * This class is responsible for handling errors from the Meta API.
 * It classifies and analyzes the received error, and according to business needs and the config submitted,
 * it determines retries and wait times.
 */
export default class MetaErrorHandler implements ErrorHandler {
    private readonly name: string = 'MetaErrorWrapper';
    private isThrottlingError: boolean = false;
    private readonly error: ParsedAxiosError;
    private readonly errorData: any;
    private readonly code: number | undefined;
    private readonly subCode: number | undefined;
    private readonly message: string | undefined;
    private readonly httpCode: StatusCodes | undefined;

    constructor(
        private attempt: number,
        private metaConfig: MetaConfig,
        private retryConfig: RetryConfig,
        private axiosError: MetaAxiosError,
    ) {
        this.error = axiosError.getParsed();
        this.errorData = this.error.data?.error;
        this.httpCode = this.getHttpCode();
        this.code = this.getErrorCode();
        this.subCode = this.getErrorSubCode();
        this.message = this.getErrorMessage();
        this.checkIfThrottling();
        axiosError.setErrorType(this.getErrorType());
    }

    /**
     * TODO: metrics and counters, with labels like httpCode, source (meta, etc.), method, endpoint, isThrottlingError, code, subCode
     * @param method
     * @param endpoint
     */
    public report(method: Method, endpoint: string): void {
        if (typeof this.httpCode === 'number') {
            if (this.message === undefined || this.code === undefined) {
            }
        } else {
        }
    }

    private getHttpCode(): StatusCodes | undefined {
        return this.error.status;
    }

    private getErrorCode(): number | undefined {
        return this.errorData?.code;
    }

    private getErrorSubCode(): number {
        return this.errorData?.subCode;
    }

    private getErrorMessage(): string {
        return this.errorData?.message || this.error.statusText || this.axiosError.getRawError().toString();
    }

    public isThrottling(): boolean {
        return this.isThrottlingError;
    }

    checkIfThrottling(): boolean {
        if (this.httpCode === StatusCodes.TOO_MANY_REQUESTS) {
            this.isThrottlingError = true;
            return this.isThrottlingError;
        }

        if (!this.errorData) {
            return this.isThrottlingError;
        }

        if (typeof this.code === 'number') {
            if (this.metaConfig.throttlingErrorCodes.includes(this.code)) {
                this.isThrottlingError = true;
                return this.isThrottlingError;
            }

            if (typeof this.subCode === 'number' && this.metaConfig.throttlingErrorCodePairs[this.code.toString()] === this.subCode) {
                this.isThrottlingError = true;
                return this.isThrottlingError;
            }
        }

        if (typeof this.message === 'string') {
            let msg = this.message.toLowerCase();
            if (this.metaConfig.throttlingMessageSubstrings.some(substring => msg.includes(substring))) {
                this.isThrottlingError = true;
                return this.isThrottlingError;
            }
        }

        return this.isThrottlingError;
    }

    getError(): any {
        return this.error.data;
    }

    getStatusCode(): number {
        return this.error.status || -1;
    }

    getMessage(): string {
        return this.axiosError.getRawError().toString();
    }

    getRaw(): any {
        return this.axiosError.getRawError();
    }

    private getBackoffFromConfig(): number | undefined {
        let finalDelay = this.retryConfig.startingDelay;
        if (this.attempt === 0) {
            logger.error(`${this.name} Attempt should start at 1`);
            return finalDelay;
        }

        if (this.attempt >= this.retryConfig.maxAttempts && !this.isThrottlingError) {
            return undefined;
        }

        for (let i = 0; i < this.attempt; i++) { // TODO improve the calc, use power()
            finalDelay *= this.retryConfig.multiplier;
            if (finalDelay > this.retryConfig.maxDelay) {
                return this.retryConfig.maxDelay;
            }
        }
        return finalDelay;
    }

    private getBackoffFromHeader(headerKey: string, headerValue: string): number | undefined {
        const headers = this.error.headers;
        if (!headers) {
            return undefined;
        }

        const header = headers[headerKey];
        if (!header) {
            return undefined;
        }

        try {
            const parsed = JSON.parse(header);
            if (typeof parsed[headerValue] === 'number') {
                return parsed[headerValue] * 1000;
            }
        } catch (error) {
            logger.error(`${this.name} Error parsing ${headerKey} header: ${error}`);
            // TODO report error metric
        }
        return undefined;
    }

    private getBackoffFromStabilityCodes(): number | undefined { // TODO consult Motion about the docs and whether it is relevant for them
        return undefined;
    }

    private getBusinessUseCaseBackoff(): number | undefined {
        return this.getBackoffFromHeader('x-business-use-case', 'estimated_time_to_regain_access');
    }

    private getAdAccountUsageBackoff(): number | undefined {
        return this.getBackoffFromHeader('x-ad-account-usage', 'reset_time_duration');
    }

    private getThrottlingBackoff(): number | undefined {
        const throttlingBackoffLookups = [
            this.getBackoffFromStabilityCodes.bind(this),
            this.getBusinessUseCaseBackoff.bind(this),
            this.getAdAccountUsageBackoff.bind(this),
        ];
        let throttlingWaitTime: number | undefined;
        while (throttlingBackoffLookups.length > 0 && throttlingWaitTime === undefined) {
            throttlingWaitTime = throttlingBackoffLookups.pop()!();
        }
        return throttlingWaitTime;
    }

    getRetryWaitTime(): number | undefined {
        let throttlingWaitTime: number | undefined;
        if (this.isThrottlingError) {
            throttlingWaitTime = this.getThrottlingBackoff();
        }

        if (typeof throttlingWaitTime === 'number') {
            return throttlingWaitTime;
        }

        return this.getBackoffFromConfig();
    }

    getErrorType(): ErrorType {
        if (this.isThrottlingError) {
            return ErrorType.THROTTLING;
        }

        if (this.httpCode !== undefined) {
            return ErrorType.GENERIC;
        }

        return ErrorType.CONNECTIVITY;
    }

    // we always want to retry a throttling error, since we await locks related to it
    shouldRetry(): boolean {
        return this.isThrottlingError || this.attempt < this.retryConfig.maxAttempts;
    }

    toString(): string {
        return `MetaErrorWrapper: ${this.axiosError.message}`;
    }
}