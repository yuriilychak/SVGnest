import { memo } from 'react';

import { COLORS } from './types';
import { ICON_SHARED_PROPS } from './constants';

const FAQIcon = () => (
    <svg {...ICON_SHARED_PROPS}>
        <g fill={COLORS.PRIMARY}>
            <circle cx="25" cy="17" r="15" />
            <rect x="19" y="26" width="10" height="8" />
            <circle cx="24" cy="41" r="5" stroke-width="2" />
        </g>
        <g transform="translate(2,-1)" fill={COLORS.BACKGROUND}>
            <circle cx="23" cy="18" r="9" />
            <rect x="7" y="16" width="10" height="23" />
            <rect x="8" y="16" width="15" height="11" />
        </g>
    </svg>
);

export default memo(FAQIcon);
