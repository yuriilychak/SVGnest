import { FC } from 'react'

import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

import { millisecondsToStr } from './helpers'
import { MesureItem } from './mesure-item'
import { STYLES } from './constants'
import { toPercents } from '../helpers'

interface StatisticsProps {
    progress: number
    estimate: number
    iterations: number
    efficiency: number
    placed: number
    total: number
    isWorking: boolean
}

const Statistics: FC<StatisticsProps> = ({ progress, estimate, iterations, placed, total, efficiency, isWorking }) => (
    <Stack direction='row' gap={1} alignItems='center'>
        {(isWorking || !!progress) && (
            <Stack direction='row' sx={STYLES.progressItem}>
                <Box sx={STYLES.progressWrapper}>
                    <CircularProgress variant='determinate' value={progress} />
                    <Box sx={STYLES.progressLabel}>
                        <Typography variant='caption' component='div' color='text.secondary'>{`${progress}%`}</Typography>
                    </Box>
                </Box>
                <Stack sx={STYLES.progressContent}>
                    <Typography variant='caption' component='div' color='text.secondary'>
                        Placemeent progress
                    </Typography>
                    <Typography variant='caption' component='div' color='text.secondary' noWrap>
                        {`${millisecondsToStr(estimate)} remaining`}
                    </Typography>
                </Stack>
            </Stack>
        )}
        <Stack direction='row' gap={1}>
            {!!iterations && <MesureItem label='Iterations' value={iterations.toString()} />}
            {!!total && <MesureItem label='Places' value={`${placed}/${total}`} />}
            {!!efficiency && <MesureItem label='Efficiency' value={`${toPercents(efficiency)}%`} />}
        </Stack>
    </Stack>
)

export default Statistics
