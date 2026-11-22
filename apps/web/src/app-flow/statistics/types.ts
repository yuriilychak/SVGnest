export interface StatisticsProps {
    progress: number
    estimate: number
    iterations: number
    efficiency: number
    placed: number
    total: number
    isWorking: boolean
}

export enum TIME_KEY {
    YEAR = 'year',
    DAY = 'day',
    HOUR = 'hour',
    MINUTE = 'minute',
    SECOND = 'second',
    MILISECOND = 'milisecond'
}

export type TimeItem = { key: TIME_KEY; seconds: number }
