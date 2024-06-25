export interface StatisticsProps {
    progress: number
    estimate: number
    iterations: number
    efficiency: number
    placed: number
    total: number
    isWorking: boolean
}

export type TimeItem = { key: string; seconds: number }
