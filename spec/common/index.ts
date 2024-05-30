import ContainerConfigLoader from '../../src/config/container-config-loader';
import { Container } from 'inversify';
import {
    jest, describe, expect, it,
} from '@jest/globals';
import TYPES from '../../src/config/types.js';
import EnvConfig from '../../src/config/env-config';
import CredentialsManager from '../../src/storage/credentials/credentials-manager';
import axios from 'axios';
import MetaUserAgent from '../../src/agents/meta/user';
import { v4 } from 'uuid';
import { setLoggerTaskId } from '../../src/utils';
import { MetaError } from '../../src/models/http/response/errors';
import { UserDetails } from '../../src/models/http/response/meta/me';

export enum MetaAxiosResponseType {
    THROTTLING = 'THROTTLING',
    GENERIC_ERROR = 'GENERIC_ERROR',
    OK = 'OK',
    CONNECTIVITY_ERROR = 'CONNECTIVITY_ERROR',
}

export const mockedValues = {
    MOCKED_ACCESS_TOKEN: 'mock_access_token',
    MOCKED_META_USER_RESPONSE: {
        id: '111',
        name: 'test name',
        last_name: 'test last name',
    },
};

export type TestSetupPayload = {
    credentials?: boolean;
    retryTime?: number;
    noRetry?: boolean;
    taskId?: string;
};

export const getMetaAxiosResponse = (responseType: MetaAxiosResponseType): any => {
    let error: MetaError;
    let okResponse: UserDetails;
    const headers = {
        get: (v: string) => `dummy_value_for_${v}`,
    };
    switch (responseType) {
        case MetaAxiosResponseType.THROTTLING:
            error = {
                message: 'dummy throttling: request limit reached',
                code: 32,
                type: 'OAuthException',
                fbtrace_id: 'dummy_fbtrace_id'
            };
            return {
                response: {
                    data: {
                        error,
                    },
                    status: 403,
                    statusText: 'Unauthorized',
                    headers,
                },
                toString: () => 'dummy throttling: request limit reached'
            };
        case MetaAxiosResponseType.GENERIC_ERROR:
            error = {
                message: 'generic meta error',
                code: 111,
                type: 'Unknown',
                fbtrace_id: 'dummy_fbtrace_id'
            };
            return {
                response: {
                    data: {error},
                    status: 500,
                    statusText: 'Internal Server Error',
                    headers,
                },
                toString: () => 'dummy internal server error'
            };
        case MetaAxiosResponseType.OK:
            okResponse = {
                id: '111',
                name: 'test name',
                last_name: 'test last name',
            };
            return {
                data: okResponse,
                status: 200,
                statusText: 'OK',
                headers,
                toString: () => '200 OK'
            };
        case MetaAxiosResponseType.CONNECTIVITY_ERROR:
            return {
                response: undefined,
                toString: () => 'Dummy connectivity error',
            };
    }
};

export const setMetaAxiosResponseTo = (
    container: Container,
    responseType: MetaAxiosResponseType,
    mockedAxios: jest.Mocked<typeof axios>,
): jest.Mocked<typeof axios> => {
    const mockResponse = getMetaAxiosResponse(responseType);
    mockedAxios.create.mockReturnThis();
    if (responseType === MetaAxiosResponseType.OK) {
        mockedAxios.request.mockResolvedValue(mockResponse);
    } else {
        mockedAxios.request.mockRejectedValue(mockResponse);
    }
    rebindMetaUserAgent(container);
    return mockedAxios;
};

export const rebindMetaUserAgent = (container: Container): void => {
    container.rebind<MetaUserAgent>(TYPES.MetaUserAgent).toConstantValue(new MetaUserAgent(
        container.get(TYPES.EnvironmentConfig),
        container.get(TYPES.CacheStorage),
        container.get(TYPES.CredentialsManager),
    ));
};

export async function testSetup(payload: TestSetupPayload): Promise<Container> {
    const config = EnvConfig.getInstance().getConfig();
    config.taskId = payload.taskId ?? v4();
    setLoggerTaskId(config.taskId);
    const container = ContainerConfigLoader.getInstance(EnvConfig.getInstance().getConfig());

    if (payload.credentials) {
        const mockedCredentialsManager: any = {
            getAccessToken: jest.fn().mockImplementation(() => Promise.resolve(mockedValues.MOCKED_ACCESS_TOKEN))
        };

        container.rebind<CredentialsManager>(TYPES.CredentialsManager).toConstantValue(mockedCredentialsManager);
    }

    return container;
}

export const getMetaUserAgent = (container: Container): any => {
    return new MetaUserAgent(
        container.get(TYPES.EnvironmentConfig),
        container.get(TYPES.CacheStorage),
        container.get(TYPES.CredentialsManager),
    );
};