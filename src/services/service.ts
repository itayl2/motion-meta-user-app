export interface Service {
    init(): Promise<void>;

    run(): Promise<void>;

    runOnce(customerName?: string): Promise<void>;

    stop(): Promise<void>;
}