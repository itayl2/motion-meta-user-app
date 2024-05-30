import { Container } from 'inversify';
import TYPES from './types.js';
import { EnvironmentConfig } from './models/environment-config.js';
import MetaUserAgent from '../agents/meta/user.js';
import { MetaUserService } from '../services/meta/user.js';
import CacheStorageImpl from '../storage/redis/cache-storage-impl.js';
import CacheStorage from '../storage/redis/cache-storage.js';
import SecretsManagerImpl from '../storage/secrets/secrets-manager-impl.js';
import SecretsManager from '../storage/secrets/secrets-manager.js';
import CredentialsManager from '../storage/credentials/credentials-manager.js';
import DynamodbClientImpl from '../storage/dynamodb/dynamodb-client-impl.js';
import DynamodbClient from '../storage/dynamodb/dynamodb-client.js';
import AppHandler from '../app-handler.js';

/**
 * Enables seamless dependency injection and management of singletons.
 * Central place to manage the various components of the application, which makes it easier to manage and test.
 */
export default class ContainerConfigLoader {
    private static instance: Container;

    public static getInstance(config: EnvironmentConfig): Container {
        if (!ContainerConfigLoader.instance) {
            ContainerConfigLoader.instance = ContainerConfigLoader.load(config);
        }

        return ContainerConfigLoader.instance;
    }

    private static load(config: EnvironmentConfig): Container {
        const container = new Container();
        container.bind<EnvironmentConfig>(TYPES.EnvironmentConfig).toConstantValue(config);
        container.bind<Container>(TYPES.Container).toConstantValue(container);

        this.bindStorage(container);
        this.bindAgents(container);
        this.bindServices(container);
        this.bindInternalServices(container);

        return container;
    }

    private static bindAgents(container: Container): void {
        container.bind<MetaUserAgent>(TYPES.MetaUserAgent).to(MetaUserAgent).inSingletonScope();
    }

    private static bindServices(container: Container): void {
        container.bind<MetaUserService>(TYPES.MetaUserService).to(MetaUserService).inSingletonScope();
    }

    private static bindInternalServices(container: Container): void {
        container.bind<AppHandler>(TYPES.AppHandler).to(AppHandler).inSingletonScope();
    }

    private static bindStorage(container: Container): void {
        container.bind<CacheStorage>(TYPES.CacheStorage).to(CacheStorageImpl).inSingletonScope();
        container.bind<SecretsManager>(TYPES.SecretsManager).to(SecretsManagerImpl).inSingletonScope();
        container.bind<CredentialsManager>(TYPES.CredentialsManager).to(CredentialsManager).inSingletonScope();
        container.bind<DynamodbClient>(TYPES.DynamoDBClient).to(DynamodbClientImpl).inSingletonScope();
    }
}