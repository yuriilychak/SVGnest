import { FC } from 'react';
import { useTranslation } from 'react-i18next';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

import { millisecondsToStr } from './helpers';
import { MesureItem } from './mesure-item';
import { STYLES } from './constants';
import { toPercents } from '../helpers';
import { StatisticsProps } from './types';

const Statistics: FC<StatisticsProps> = ({ progress, estimate, iterations, placed, total, efficiency, isWorking }) => {
    const { t } = useTranslation();

    return (
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
                            {t('appFlow.statistics.progress.title')}
                        </Typography>
                        <Typography variant='caption' component='div' color='text.secondary' noWrap>
                            {t('appFlow.statistics.progress.subtitle', { time: millisecondsToStr(estimate, t) })}
                        </Typography>
                    </Stack>
                </Stack>
            )}
            <Stack direction='row' gap={1}>
                {!!iterations && (
                    <MesureItem label={t('appFlow.statistics.meure.iterations.label')} value={iterations.toString()} />
                )}
                {!!total && <MesureItem label={t('appFlow.statistics.meure.places.label')} value={`${placed}/${total}`} />}
                {!!efficiency && (
                    <MesureItem label={t('appFlow.statistics.meure.efficiency.label')} value={`${toPercents(efficiency)}%`} />
                )}
            </Stack>
        </Stack>
    );
};

export default Statistics;
