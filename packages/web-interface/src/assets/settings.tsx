import { memo } from 'react';

import { COLORS } from './types';
import { ICON_SHARED_PROPS } from './constants';

const SettingsIcon = () => (
    <svg {...ICON_SHARED_PROPS}>
        <g fill={COLORS.PRIMARY}>
            <g>
                <rect transform="rotate(-45)" x="-24" y="29" width="48" height="10" />
                <rect x="19" width="10" height="48" />
                <rect y="19" width="48" height="10" />
                <rect transform="rotate(45)" x="10" y="-5" width="48" height="10" />
            </g>
            <circle cx="24" cy="24" r="18" />
        </g>
        <circle cx="24" cy="24" r="9" fill={COLORS.BACKGROUND} />
    </svg>
);

export default memo(SettingsIcon);
