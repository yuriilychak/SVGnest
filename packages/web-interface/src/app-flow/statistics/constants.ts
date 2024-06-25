import { TimeItem } from './types'

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
}

export const TIME_ITEMS: TimeItem[] = [
    { key: 'year', seconds: 31536000 },
    { key: 'day', seconds: 86400 },
    { key: 'hour', seconds: 3600 },
    { key: 'minute', seconds: 60 },
    { key: 'second', seconds: 1 }
]
