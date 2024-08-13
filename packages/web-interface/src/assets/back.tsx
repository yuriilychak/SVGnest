import { memo } from 'react';

import { COLORS } from './types';
import { ICON_SHARED_PROPS } from './constants';

const BackIcon = () => (
    <svg {...ICON_SHARED_PROPS}>
        <g fill={COLORS.PRIMARY}>
            <path d="m22 39v-30l-20 15z" />
            <rect x="20" y="16" width="24" height="16" />
        </g>
    </svg>
);

export default memo(BackIcon);
