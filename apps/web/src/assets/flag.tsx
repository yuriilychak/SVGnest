import { memo } from 'react';

import { COLORS } from './types';
import { ICON_SHARED_PROPS } from './constants';

const FlagIcon = () => (
    <svg {...ICON_SHARED_PROPS}>
        <g fill={COLORS.PRIMARY}>
            <rect x="11" y="7" width="22" height="22" />
            <rect x="8" y="4" width="4" height="40" />
            <rect x="29" y="11" width="12" height="22" />
        </g>
    </svg>
);

export default memo(FlagIcon);
