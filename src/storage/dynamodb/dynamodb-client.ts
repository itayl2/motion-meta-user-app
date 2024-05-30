import { StoredCustomer } from '../../models/storage';
import { StoredUserDetails } from '../../models/storage/meta/user';

export default interface DynamoDBClient {
    getCustomersByUpdatedTimestamp(timestamp: number): Promise<StoredCustomer[]>;

    getCustomers(): Promise<StoredCustomer[]>;

    updateUserDetails(storedUser: StoredUserDetails): Promise<void>;
}