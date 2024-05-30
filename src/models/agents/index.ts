import { ParsedAxiosError } from '../../errors/axios/meta.js';

export enum Source {
    META = 'META',
}

export type ErrorDetails = {
    raw: Error;
    parsed: ParsedAxiosError | string;
    msg: string;
};

export type ApiResult<T> = {
    data?: T;
    source: Source;
    success: boolean;
    error?: ErrorDetails;
    attempts: number;
};

export enum MetaEndpoints {
    SELF_FETCH = 'SELF_FETCH',
}