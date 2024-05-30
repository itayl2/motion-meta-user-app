import ProcessConfigLoader from "./config/process-config-loader";
import ContainerConfigLoader from "./config/container-config-loader";
ProcessConfigLoader.load('.env');
import EnvConfig from "./config/env-config";
if (require.main === module) {
    const container = ContainerConfigLoader.getInstance(EnvConfig.getInstance().getConfig());
}
