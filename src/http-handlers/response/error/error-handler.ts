import { Method } from 'axios';
import { ErrorType } from '../../../models/http/response/errors.js';

export default interface ErrorHandler {
    report(method: Method, endpoint: string): void;

    isThrottling(): boolean;

    getError(): any;

    getStatusCode(): number;

    getMessage(): string;

    getRaw(): any;

    getRetryWaitTime(): number | undefined;

    shouldRetry(): boolean;

    getErrorType(): ErrorType;

    toString(): string;
}