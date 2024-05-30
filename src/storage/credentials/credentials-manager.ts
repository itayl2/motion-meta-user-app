import { inject, injectable } from 'inversify';
import TYPES from '../../config/types.js';
import CacheStorage from '../../storage/redis/cache-storage.js';
import SecretsManager from '../../storage/secrets/secrets-manager.js';
import logger from '../../utils/logger.js';

/**
 * Store and manage credentials for the application.
 * Fetch from Secrets Manager if a token is missing / expired, and store it locally (controlled by Redis cache).
 * This allows us to add / expire / rotate tokens without redeploying the application, which in turn allows us to:
 * - Have the token generation / rotation happen in a separate service in a microservices architecture
 * - Expire / remove tokens of customers remotely
 */
@injectable()
export default class CredentialsManager {
    private readonly name: string = 'CredentialsManager';

    private store: Map<string, string> = new Map<string, string>();

    constructor(
        @inject(TYPES.CacheStorage) private readonly cache: CacheStorage,
        @inject(TYPES.SecretsManager) private readonly secrets: SecretsManager,
    ) {
    }

    private async tokenExpired(customerName: string): Promise<boolean> {
        const result = await this.cache.accessTokenValidationKeyExists(customerName);
        if (!result) {
            logger.info(`Token for ${customerName} is expired`);
        }
        return !result;
    }

    private async populateToken(customerName: string): Promise<void> {
        let fetchToken = !this.store.has(customerName);
        if (!fetchToken) {
            fetchToken = await this.tokenExpired(customerName);
        }

        if (fetchToken) {
            const token = await this.secrets.getByPath(customerName);
            await this.cache.setAccessTokenValidationKey(customerName);
            this.store.set(customerName, token);
        }
    }

    public async getAccessToken(customerName: string): Promise<string> {
        await this.populateToken(customerName);
        return this.store.get(customerName)!;
    }
}