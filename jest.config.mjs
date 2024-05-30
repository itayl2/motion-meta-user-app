export default {
    preset: 'ts-jest/presets/default-esm', // Use ESM preset
    testEnvironment: 'node',
    globals: {
        'ts-jest': {
            useESM: true,
            tsconfig: 'tsconfig.json'
        }
    },
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1', // Strip .js extensions for ESM compatibility
        '^@/(.*)$': '<rootDir>/$1'
    },
    transform: {
        '^.+\\.(t|j)sx?$': 'ts-jest',
    },
    extensionsToTreatAsEsm: ['.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    collectCoverage: true,
    collectCoverageFrom: [
        '<rootDir>/spec/**/*.ts'
    ],
    coverageDirectory: '<rootDir>/coverage/',
    coverageReporters: ['text', 'lcov'],
    verbose: true
};
