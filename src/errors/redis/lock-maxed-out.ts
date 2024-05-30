export default class LockMaxedOut extends Error {
    constructor(lockId: string, timeItTook: number, maxTime: number) {
        super(`Lock ${lockId} maxed out after ${timeItTook}ms, max time is ${maxTime}ms`);
        this.name = 'LockMaxedOut';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}