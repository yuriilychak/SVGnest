import { TIME_KEY, TimeItem } from './types';

export const TIME_ITEMS: TimeItem[] = [
    { key: TIME_KEY.YEAR, seconds: 31536000 },
    { key: TIME_KEY.DAY, seconds: 86400 },
    { key: TIME_KEY.HOUR, seconds: 3600 },
    { key: TIME_KEY.MINUTE, seconds: 60 },
    { key: TIME_KEY.SECOND, seconds: 1 }
];
