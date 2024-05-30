import { AxiosError, AxiosResponseHeaders } from 'axios';
import { ErrorType, MetaErrorResponse } from '../../models/http/response/errors.js';
import { ErrorDetails } from '../../models/agents/index.js';

type AxiosHeaders = {
    [key: string]: string;
};

export type ParsedAxiosError = {
    status?: number;
    statusText?: string;
    data?: any;
    headers?: AxiosHeaders;
    type?: ErrorType;
};

export class MetaAxiosError extends Error {
    private readonly raw: AxiosError;
    private readonly parsed: ParsedAxiosError;
    private readonly parsedMessage: string;

    constructor(axiosError: AxiosError) {
        const parsedMessage = MetaAxiosError.getMsgPartsFromError(axiosError).join(', ');
        super(parsedMessage);
        this.parsedMessage = parsedMessage;
        this.raw = axiosError;
        this.parsed = MetaAxiosError.getParsedError(axiosError);
        this.name = 'MetaAxiosError';
        Object.setPrototypeOf(this, new.target.prototype);
    }

    static getParsedError(axiosError: AxiosError): ParsedAxiosError {
        const {response} = axiosError;
        if (!response) {
            return {};
        }

        const rawHeaders = response.headers as AxiosResponseHeaders;
        const headers = Object.keys(rawHeaders).reduce((acc: any, key: string) => {
            if (key.toLowerCase() !== 'proxy-status') {
                acc[key] = rawHeaders.get(key);
            }
            return acc;
        }, {});

        return {
            status: response.status,
            statusText: response.statusText,
            data: response.data,
            headers,
        };
    }

    static getMsgPartsFromError(axiosError: AxiosError): string[] {
        const msgParts = [axiosError.toString()];
        const {response} = axiosError;
        if (!response) {
            return msgParts;
        }

        if (response.status) {
            msgParts.push(`HTTP ${response.status}`);
        } else if (response.statusText) {
            msgParts.push(response.statusText);
        }
        const data = response.data;
        if (!data) {
            return msgParts;
        }

        const metaErrorResponse = data as MetaErrorResponse;
        if (metaErrorResponse.error) {
            msgParts.push(JSON.stringify(metaErrorResponse.error));
        }
        return msgParts;
    }

    public getParsed(): ParsedAxiosError {
        return this.parsed;
    }

    public getRawError(): AxiosError {
        return this.raw;
    }

    public getMessage(): string {
        return this.parsedMessage;
    }

    public setErrorType(errorType: ErrorType): void {
        this.parsed.type = errorType;
    }

    public getAsErrorDetails(): ErrorDetails {
        return {
            raw: this,
            parsed: this.getParsed(),
            msg: this.getMessage(),
        };
    }
}