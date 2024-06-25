import { TIME_KEY, TimeItem } from './types';

export const STYLES = {
    progressItem: { minWidth: { xs: 158, sm: 200 }, maxWidth: { xs: 158, sm: 200 }, overflow: 'hidden', gap: 1 },
    progressWrapper: { position: 'relative', display: 'inline-flex' },
    progressLabel: {
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    progressContent: { overflow: 'hidden' }
};

export const TIME_ITEMS: TimeItem[] = [
    { key: TIME_KEY.YEAR, seconds: 31536000 },
    { key: TIME_KEY.DAY, seconds: 86400 },
    { key: TIME_KEY.HOUR, seconds: 3600 },
    { key: TIME_KEY.MINUTE, seconds: 60 },
    { key: TIME_KEY.SECOND, seconds: 1 }
];
