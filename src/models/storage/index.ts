export type StoredCustomer = {
    name: string;
    updated: number;
};

export type RedisValue = {
    value: string;
    timestamp: number;
}