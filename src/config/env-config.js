var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EnvConfig_1;
import { injectable } from 'inversify';
import { envToArray, envToBoolean } from '../utils';
let EnvConfig = class EnvConfig {
    static { EnvConfig_1 = this; }
    static instance;
    environmentConfig;
    constructor() {
        this.environmentConfig = {
            meta: {
                baseUrl: process.env.META_BASE_URL || 'graph.facebook.com',
                accessToken: process.env.META_ACCESS_TOKEN || '',
                graphQLVersion: process.env.META_GRAPHQL_VERSION || 'v18.0',
                endpoints: {
                    me: process.env.META_ENDPOINT_ME || '/me',
                },
                fields: {
                    userFetch: envToArray('META_FIELDS_USER_FETCH', 'id,name,last_name').join(','),
                },
            },
            services: {
                meta: {
                    user: {
                        intervalInMs: parseInt(process.env.SERVICES_META_USER_INTERVAL_MS || '2000'),
                        runOnInit: envToBoolean('SERVICES_META_USER_RUN_ON_INIT', 'false'),
                    },
                },
            },
        };
    }
    ;
    static getInstance() {
        if (!EnvConfig_1.instance) {
            EnvConfig_1.instance = new EnvConfig_1();
        }
        return EnvConfig_1.instance;
    }
    getConfig() {
        return this.environmentConfig;
    }
};
EnvConfig = EnvConfig_1 = __decorate([
    injectable(),
    __metadata("design:paramtypes", [])
], EnvConfig);
export default EnvConfig;
