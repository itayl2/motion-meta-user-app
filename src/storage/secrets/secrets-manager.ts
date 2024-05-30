export default interface SecretsManager {
    getByPath(path: string): Promise<string>;

    populateSecret(path: string, secret: string): void;
}