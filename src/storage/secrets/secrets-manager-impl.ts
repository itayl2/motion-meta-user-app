import 'reflect-metadata';
import SecretsManager from './secrets-manager.js';
import { inject, injectable } from 'inversify';
import TYPES from '../../config/types.js';
import { EnvironmentConfig } from '../../config/models/environment-config.js';
import logger from '../../utils/logger.js';


/**
 * This is a mock implementation of SecretsManager. It is used for testing purposes.
 * In a production scenario, this would be replaced with aws-sdk and AWS Secrets Manager.
 * For now, it is populated (populateSecret()) on application startup with the token provided via environment variables.
 *
 * Should ideally include more refined error handling in getByPath(), depending on actual needs of Motion.
 */
@injectable()
export default class SecretsManagerImpl implements SecretsManager {
    private secrets: Map<string, string> = new Map<string, string>();
    private readonly stage: string;

    constructor(@inject(TYPES.EnvironmentConfig) config: EnvironmentConfig) {
        this.stage = config.stage;
    }

    private realPath(path: string): string {
        return `${this.stage}/${path}`;
    }

    public populateSecret(path: string, secret: string): void {
        logger.info(`Populating dummy secret at: ${path}`);
        this.secrets.set(this.realPath(path), secret);
    }

    public async getByPath(path: string): Promise<string> {
        const realPath = this.realPath(path);
        if (this.secrets.has(realPath)) {
            logger.info(`Found secret at ${realPath}`);
            return Promise.resolve(this.secrets.get(realPath)!);
        }

        throw new Error(`Secret not found for path: ${realPath}`);
    }
}