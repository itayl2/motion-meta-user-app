import sinon from 'sinon';
import {
    jest, describe, expect, it, afterEach, beforeEach, afterAll, beforeAll,
} from '@jest/globals';
import TYPES from '../../../src/config/types.js';
import {
    getMetaUserAgent, MetaAxiosResponseType, mockedValues, setMetaAxiosResponseTo,
    testSetup
} from '../../common';
import MetaUserAgent from '../../../src/agents/meta/user';
import MetaErrorHandler from '../../../src/http-handlers/response/error/meta-error-handler.js';
import { ErrorType } from '../../../src/models/http/response/errors';
import { Container } from 'inversify';
import { setLoggerTaskId, sleepMs } from '../../../src/utils';
import { ApiResult, ErrorDetails } from '../../../src/models/agents';
import { UserDetails } from '../../../src/models/http/response/meta/me';
import CacheStorage from '../../../src/storage/redis/cache-storage';
import CacheStorageImpl from '../../../src/storage/redis/cache-storage-impl';
import { EnvironmentConfig } from '../../../src/config/models/environment-config';
import { v4 } from 'uuid';
import LockMaxedOut from '../../../src/errors/redis/lock-maxed-out';
import axios from 'axios';
import { MetaAxiosError, ParsedAxiosError } from '../../../src/errors/axios/meta';


jest.mock('axios');

const stubs = {
    getRetryWaitTime: undefined,
    shouldRetry: undefined,
} as any;

const mockedAxios: jest.Mocked<typeof axios> = axios as any;

describe('Meta HTTP Response Handling', () => {
    // avoid unnecessary retries (unless that is what is being tested)
    beforeAll(() => {
        stubs.getRetryWaitTime = sinon.stub(MetaErrorHandler.prototype, 'getRetryWaitTime').returns(1);
        stubs.shouldRetry = sinon.stub(MetaErrorHandler.prototype, 'shouldRetry').returns(false);
    });

    let container: Container;

    // fresh start for each test
    beforeEach(async () => {
        jest.clearAllMocks();
        stubs.shouldRetry.resetHistory();
        stubs.getRetryWaitTime.resetHistory();
        container = await testSetup({credentials: true});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(() => {
        Object.keys(stubs).map((stubName) => stubs[stubName].restore()); // since sandbox.restore() isn't working
    });

    it('Throttled response identified properly', async () => {
        setMetaAxiosResponseTo(container, MetaAxiosResponseType.THROTTLING, mockedAxios);
        const agent: MetaUserAgent = getMetaUserAgent(container);
        const result = await agent.getUserInfo('dummy_customer_name');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();

        const error = result.error as ErrorDetails;
        expect(error.raw).toBeInstanceOf(MetaAxiosError);

        const parsed = error.parsed as ParsedAxiosError;
        expect(parsed.type).toEqual(ErrorType.THROTTLING);
        expect(result.data).toBeUndefined();
        expect(stubs.shouldRetry.callCount).toEqual(1);
        expect(stubs.getRetryWaitTime.callCount).toEqual(0);
        expect(mockedAxios.request.mock.calls.length).toEqual(1);
    });

    it('Generic error response identified properly', async () => {
        setMetaAxiosResponseTo(container, MetaAxiosResponseType.GENERIC_ERROR, mockedAxios);
        const agent: MetaUserAgent = getMetaUserAgent(container);
        const result = await agent.getUserInfo('dummy_customer_name');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();

        const error = result.error as ErrorDetails;
        expect(error.raw).toBeInstanceOf(MetaAxiosError);

        const parsed = error.parsed as ParsedAxiosError;
        expect(parsed.type).toEqual(ErrorType.GENERIC);
        expect(stubs.shouldRetry.callCount).toEqual(1);
        expect(stubs.getRetryWaitTime.callCount).toEqual(0);
        expect(mockedAxios.request.mock.calls.length).toEqual(1);
    });

    it('Connectivity error response identified properly', async () => {
        setMetaAxiosResponseTo(container, MetaAxiosResponseType.CONNECTIVITY_ERROR, mockedAxios);
        const agent: MetaUserAgent = getMetaUserAgent(container);
        const result = await agent.getUserInfo('dummy_customer_name');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();

        const error = result.error as ErrorDetails;
        expect(error.raw).toBeInstanceOf(MetaAxiosError);

        const parsed = error.parsed as ParsedAxiosError;
        expect(parsed.type).toEqual(ErrorType.CONNECTIVITY);
        expect(result.data).toBeUndefined();
        expect(stubs.shouldRetry.callCount).toEqual(1);
        expect(stubs.getRetryWaitTime.callCount).toEqual(0);
        expect(mockedAxios.request.mock.calls.length).toEqual(1);
    });

    it('Good response not retried', async () => {
        stubs.shouldRetry.resetBehavior();
        stubs.getRetryWaitTime.resetBehavior();

        setMetaAxiosResponseTo(container, MetaAxiosResponseType.OK, mockedAxios);
        const agent: MetaUserAgent = getMetaUserAgent(container);
        const result = await agent.getUserInfo('dummy_customer_name');

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.data).toEqual(mockedValues.MOCKED_META_USER_RESPONSE);
        expect(stubs.shouldRetry.callCount).toEqual(0);
        expect(stubs.getRetryWaitTime.callCount).toEqual(0);
        expect(mockedAxios.request.mock.calls.length).toEqual(1);
    });
});

describe('Meta Throttling work management', () => {
    const waitTime = 2000;
    const retries = 2;
    // here we do want retries and wait times because we specifically want to see what happens when multiple instances attempt a throttled endpoint
    beforeAll(() => {
        Object.keys(stubs).map((stubName) => stubs[stubName] && stubs[stubName].restore()); // since sandbox.restore() isn't working
        process.env.META_RETRY_MAX_ATTEMPTS = retries.toString();
        stubs.getRetryWaitTime = sinon.stub(MetaErrorHandler.prototype, 'getRetryWaitTime').returns(waitTime);
        stubs.shouldRetry = sinon.stub(MetaErrorHandler.prototype, 'shouldRetry').returns(true);
    });

    let container: Container;

    // fresh start for each test
    beforeEach(async () => {
        jest.clearAllMocks();
        stubs.shouldRetry.resetHistory();
        stubs.getRetryWaitTime.resetHistory();
        container = await testSetup({credentials: true});
    });

    it('Throttling disables concurrency', async () => {
        const expectedConcurrency = 1;
        const customerName = 'dummy_customer_name';
        setMetaAxiosResponseTo(container, MetaAxiosResponseType.THROTTLING, mockedAxios);

        const concurrentCalls = async (): Promise<ApiResult<UserDetails>[]> => {
            // the first call will find the throttling and set the locks, so that is the only instance which
            // should be sending requests while the second instance awaits the locks.
            // wait a bit in-between the first & second instance to avoid race conditions (which would not happen
            // with a real / local Redis)

            // first instance
            const agent: MetaUserAgent = getMetaUserAgent(container);
            const firstCall = agent.getUserInfo(customerName);
            await sleepMs(500);

            // second instance prep
            if (stubs.shouldRetry) {
                stubs.shouldRetry.restore();
            }
            stubs.shouldRetry = sinon.stub(MetaErrorHandler.prototype, 'shouldRetry').returns(false);
            const config = container.get<EnvironmentConfig>(TYPES.EnvironmentConfig);
            config.redis.maxLockWaitTime = 1;
            config.taskId = `${v4()}-second`;
            setLoggerTaskId(config.taskId);

            // we are creating a new cache impl to max out on the lock time, but we want the same data (we can skip
            // this with a real / local Redis)
            const newStorage = new CacheStorageImpl(config);
            newStorage.setData(container.get<CacheStorage>(TYPES.CacheStorage).getData());
            container.rebind<CacheStorage>(TYPES.CacheStorage).toConstantValue(newStorage);

            // second instance
            const secondAgent = new MetaUserAgent(
                config,
                container.get(TYPES.CacheStorage),
                container.get(TYPES.CredentialsManager),
            );
            return Promise.all([
                firstCall,
                secondAgent.getUserInfo(customerName),
            ]);
        };
        const [firstResult, secondResult] = await concurrentCalls();

        // first instance validation
        expect(firstResult.success).toBe(false);
        expect(firstResult.error).toBeDefined();
        const firstError = firstResult.error as ErrorDetails;
        expect(firstError.raw).toBeInstanceOf(MetaAxiosError);
        const parsed = firstResult.error?.parsed as ParsedAxiosError;
        expect(parsed.type).toEqual(ErrorType.THROTTLING);
        expect(stubs.shouldRetry.callCount).toEqual(retries - 1); // it is recreated after the first instance already tried once (1), and the second instance is not supposed to try at all

        // second instance validation
        expect(secondResult.success).toBe(false);
        expect(secondResult.error).toBeDefined();
        const secondError = secondResult.error as ErrorDetails;
        expect(secondError.raw).toBeInstanceOf(LockMaxedOut);
        expect(mockedAxios.request.mock.calls.length).toEqual(retries * expectedConcurrency);
    }, 20000);
});
