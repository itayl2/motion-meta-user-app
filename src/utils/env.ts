export const stringToBoolean = (value: string): boolean => value.toLowerCase() === 'true';

export const envToBoolean = (varName: string, defaultValue: string): boolean => {
    const value = process.env[varName];
    if (value === undefined) {
        return stringToBoolean(defaultValue);
    }

    return stringToBoolean(value);
};

export const envToArray = (varName: string, defaultValue: string[]): string[] => {
    const value = process.env[varName];
    if (value === undefined) {
        return defaultValue;
    }

    return value.split(',');
};

export const envIntOrUndefined = (varName: string): number | undefined => {
    const value = process.env[varName];
    if (value === undefined) {
        return undefined;
    }

    return parseInt(value);
};

export const parseIntOrDie = (value: string): number => {
    const parsed = parseInt(value);
    if (isNaN(parsed)) {
        throw new Error(`Invalid value for int: ${value}`);
    }

    return parsed;
};

export const parseFloatOrDie = (value: string): number => {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
        throw new Error(`Invalid value for float: ${value}`);
    }

    return parsed;
};

export const envToInt = (varName: string, defaultValue: number): number => {
    const value = process.env[varName];
    if (value === undefined) {
        return defaultValue;
    }

    try {
        return parseIntOrDie(value);
    } catch (error) {
        throw new Error(`Invalid int value for ${varName}: ${value}`);
    }
};

export const envToFloat = (varName: string, defaultValue: number): number => {
    const value = process.env[varName];
    if (value === undefined) {
        return defaultValue;
    }

    try {
        return parseFloatOrDie(value);
    } catch (error) {
        throw new Error(`Invalid float value for ${varName}: ${value}`);
    }
};