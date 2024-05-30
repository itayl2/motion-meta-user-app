import { v4 } from 'uuid';
import logger from './logger.js';

export const sleepMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns a unique identifier for the running container / instance.
 * Mocked for the purpose of the demo. Would normally be replaced by something like getting the last part
 * of TaskARN from ${ECS_CONTAINER_METADATA_URI_V4}/task when running in ECS.
 */
export const getTaskId = async () => Promise.resolve(v4());

export const setLoggerTaskId = (taskId: string) => logger.defaultMeta = {taskId};