import { AxiosResponse } from 'axios';

export default interface RequestManager {
    execute(): Promise<AxiosResponse>;
}