import { FC } from 'react';
import { useTranslation } from 'react-i18next';

import { millisecondsToStr } from './helpers';
import { MesureItem } from './mesure-item';
import { toPercents } from '../helpers';
import { StatisticsProps } from './types';
import './styles.scss';

const Statistics: FC<StatisticsProps> = ({ progress, estimate, iterations, placed, total, efficiency, isWorking }) => {
    const { t } = useTranslation();

    return (
        <div className="statisticsRoot">
            {(isWorking || !!progress) && (
                <div className="statisticsProgresItem">
                    <div
                        className="statisticsProgressBar"
                        style={{
                            background: `radial-gradient(closest-side, white 79%, transparent 80% 100%), conic-gradient(#3bb34a ${progress}%, white 0)`
                        }}
                    >
                        <div className="statisticsProgressDescription">{`${progress}%`}</div>
                    </div>
                    <div className="statisticsProgressContent">
                        <div className="statisticsProgressDescription">{t('appFlow.statistics.progress.title')}</div>
                        <div className="statisticsProgressDescription">
                            {t('appFlow.statistics.progress.subtitle', { time: millisecondsToStr(estimate, t) })}
                        </div>
                    </div>
                </div>
            )}
            <div className="statisticsMesures">
                {!!iterations && (
                    <MesureItem label={t('appFlow.statistics.meure.iterations.label')} value={iterations.toString()} />
                )}
                {!!total && <MesureItem label={t('appFlow.statistics.meure.places.label')} value={`${placed}/${total}`} />}
                {!!efficiency && (
                    <MesureItem label={t('appFlow.statistics.meure.efficiency.label')} value={`${toPercents(efficiency)}%`} />
                )}
            </div>
        </div>
    );
};

export default Statistics;
