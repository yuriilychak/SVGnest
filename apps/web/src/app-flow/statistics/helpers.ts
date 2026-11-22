import { TFunction } from 'i18next';

import { TIME_ITEMS } from './constants';
import { TIME_KEY, TimeItem } from './types';

export function millisecondsToStr(milliseconds: number, t: TFunction): string {
    const seconds = Math.floor(milliseconds / 1000);
    const itemCount = TIME_ITEMS.length;
    let item: TimeItem = null;
    let count: number = 0;
    let i: number = 0;
    let timeKey: TIME_KEY = TIME_KEY.MILISECOND;

    for (i = 0; i < itemCount; ++i) {
        item = TIME_ITEMS[i];
        count = Math.floor(seconds / item.seconds);

        if (count !== 0) {
            timeKey = item.key;
            break;
        }
    }

    return t(`appFlow.statistics.progress.counter.${timeKey}`, { count });
}
