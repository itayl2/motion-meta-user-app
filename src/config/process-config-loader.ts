import { config } from 'dotenv';
import { join } from 'path';

export default class ProcessConfigLoader {
    public static load(envRelativePath: string): void {
        const currentPath: string = process.cwd();
        const path: string = join(currentPath, envRelativePath);
        config({ path });
    }
}
