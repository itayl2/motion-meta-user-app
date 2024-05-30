import DynamoDBClient from './dynamodb-client.js';
import { StoredCustomer } from '../../models/storage/index.js';
import { StoredUserDetails } from '../../models/storage/meta/user.js';
import { injectable } from 'inversify';
import logger from '../../utils/logger.js';

/**
 * This class is a mock implementation of the DynamoDB client.
 * It is used for testing and development purposes.
 * For a real-live scenario, we would use the actual DynamoDB client via aws-sdk and local-stack for local development.
 */
@injectable()
export default class DynamodbClientImpl implements DynamoDBClient {
    private readonly name: string = 'DynamodbClientImpl';

    public async getCustomers(): Promise<StoredCustomer[]> {
        logger.info(`${this.name} Getting all customers`);
        return Promise.resolve([
            {
                name: 'motion_test_user',
                updated: 0
            }
        ]);
    }

    public async getCustomersByUpdatedTimestamp(timestamp: number): Promise<StoredCustomer[]> {
        logger.info(`${this.name} Getting customers by timestamp: ${timestamp}`);
        return Promise.resolve([
            {
                name: 'motion_test_user',
                updated: 0
            }
        ]);
    }

    public async updateUserDetails(storedUser: StoredUserDetails): Promise<void> {
        logger.debug(`${this.name} Updating user details for user id: ${storedUser.id}`);
        return Promise.resolve();
    }
}