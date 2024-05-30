export enum ErrorType {
    THROTTLING = 'THROTTLING',
    GENERIC = 'GENERIC',
    CONNECTIVITY = 'CONNECTIVITY',
}

export type MetaErrorResponse = {
    error: MetaError;
}

export type MetaError = {
    message: string;
    code: number;
    type: string;
    fbtrace_id: string
};
