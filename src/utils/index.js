export const stringToBoolean = (value) => value.toLowerCase() === 'true';
export const envToBoolean = (varName, defaultValue) => {
    const value = process.env[varName];
    if (value === undefined) {
        return stringToBoolean(defaultValue);
    }
    return stringToBoolean(value);
};
export const envToArray = (varName, defaultValue) => {
    const value = process.env[varName];
    if (value === undefined) {
        return defaultValue.split(',');
    }
    return value.split(',');
};
