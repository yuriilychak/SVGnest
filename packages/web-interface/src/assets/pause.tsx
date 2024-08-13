import { memo } from 'react';

import { COLORS } from './types';
import { ICON_SHARED_PROPS } from './constants';

const PauseIcon = () => (
    <svg {...ICON_SHARED_PROPS}>
        <g fill={COLORS.PRIMARY}>
            <rect x="28" y="8" width="8" height="32" />
            <rect x="12" y="8" width="8" height="32" />
        </g>
    </svg>
);

export default memo(PauseIcon);
