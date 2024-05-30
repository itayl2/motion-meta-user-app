import { config } from 'dotenv';
import { join } from 'path';
export default class ProcessConfigLoader {
    static load(envRelativePath) {
        const currentPath = process.cwd();
        const path = join(currentPath, envRelativePath);
        config({ path });
    }
}
