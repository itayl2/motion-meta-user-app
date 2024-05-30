import 'reflect-metadata';
import { inject, injectable } from 'inversify';
import TYPES from '../../config/types.js';
import { EnvironmentConfig, MetaConfig } from '../../config/models/environment-config.js';
import { ApiResult, ErrorDetails, MetaEndpoints, Source } from '../../models/agents/index.js';
import axios, { AxiosInstance } from 'axios';
import logger from '../../utils/logger.js';
import { inspect } from 'util';
import { UserDetails } from '../../models/http/response/meta/me.js';
import MetaRequestManager, { MetaRequestPayload } from '../../http-handlers/request/meta-request-manager.js';
import { AxiosError, Method } from 'axios';
import CacheStorage from '../../storage/redis/cache-storage.js';
import CredentialsManager from '../../storage/credentials/credentials-manager.js';
import { MetaAxiosError } from '../../errors/axios/meta.js';

/**
 * The MetaUserAgent handles the business-logic involved with Meta endpoints.
 * It utilizes a request manager to handle the HTTP requests and rate limiting, while it only cares about the end result.
 *
 * It creates its own Axios instance so that we have one instance for all of Meta's requests.
 * In the future we may find we want a more varied approach depending on our needs.
 */
@injectable()
export default class MetaUserAgent {
    private readonly name: string = 'MetaUserAgent';
    private readonly metaConfig: MetaConfig;
    private readonly taskId: string;
    private readonly axiosInstance: AxiosInstance;

    constructor(
        @inject(TYPES.EnvironmentConfig) config: EnvironmentConfig,
        @inject(TYPES.CacheStorage) private readonly cache: CacheStorage,
        @inject(TYPES.CredentialsManager) private readonly credentialsManager: CredentialsManager,
    ) {
        this.taskId = config.taskId;
        this.metaConfig = config.platforms.meta;
        this.axiosInstance = axios.create({
            baseURL: `https://${config.platforms.meta.baseUrl}/${config.platforms.meta.graphQLVersion}`,
            headers: {
                'Content-Type': 'application/json',
            },
            validateStatus: (status) => status >= 200 && status < 300,
        });
    }

    private getPayload(customerName: string, endpoint: MetaEndpoints): MetaRequestPayload {
        const endpointConfig = this.metaConfig.endpoints[endpoint];
        return {
            method: 'GET' as Method,
            endpointConfig,
            config: this.metaConfig,
            customerName,
            params: {
                fields: endpointConfig.fields
            },
        };
    }

    private getRequest(customerName: string, endpoint: MetaEndpoints): MetaRequestManager {
        return new MetaRequestManager(
            this.taskId,
            this.getPayload(customerName, endpoint),
            this.axiosInstance,
            this.cache,
            this.credentialsManager,
        );
    }

    private unpackError(error: Error): ErrorDetails {
        if (error instanceof MetaAxiosError) {
            return error.getAsErrorDetails();
        }

        if (error instanceof AxiosError) {
            const msg = (error as AxiosError).toString();
            return {
                raw: error as Error,
                parsed: msg,
                msg,
            };
        }

        return {
            raw: error as Error,
            parsed: inspect(error),
            msg: (error as Error).toString(),
        };
    }

    public async getUserInfo(customerName: string): Promise<ApiResult<UserDetails>> {
        let result: ApiResult<UserDetails> = {
            source: Source.META,
            attempts: 0,
            success: false,
        };

        const request = this.getRequest(customerName, MetaEndpoints.SELF_FETCH);
        try {
            const response = await request.execute();
            logger.debug(`${this.name}: Received response: ${inspect(response.data)}`);
            result.data = response.data as UserDetails;
            result.success = true;
        } catch (error) {
            // TODO metrics, alerts
            result.error = this.unpackError(error as Error);
            logger.error(`${this.name}: Failed fetching user: ${result.error.msg}`);
        }

        result.attempts = request.attempts;
        return result;
    }
}