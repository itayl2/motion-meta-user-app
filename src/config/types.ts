/**
 * May not be necessary in small, single-developer applications, but useful in production applications to be more descriptive and avoid naming collisions.
 */

const helperSymbols = {
    AxiosInstance: Symbol('AxiosInstance'),
    MetaAxios: Symbol('MetaAxios'),
};

const storageSymbols = {
    DynamoDBClient: Symbol('DynamoDBClient'),
    CacheStorage: Symbol('CacheStorage'),
    SecretsManager: Symbol('SecretsManager'),
    CredentialsManager: Symbol('CredentialsManager'),
};

const metaServicesSymbols = {
    MetaUserService: Symbol('MetaUserService'),
};

const internalServicesSymbols = {
    AppHandler: Symbol('AppHandler'),
};

const metaAgentsSymbols = {
    MetaUserAgent: Symbol('MetaUserAgent'),
};

export default {
    ...helperSymbols,
    ...storageSymbols,
    ...metaServicesSymbols,
    ...metaAgentsSymbols,
    ...internalServicesSymbols,
    Container: Symbol('Container'),
    EnvironmentConfig: Symbol('EnvironmentConfig'),
};