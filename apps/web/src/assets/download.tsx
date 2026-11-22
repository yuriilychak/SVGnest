import { memo } from 'react';

import { COLORS } from './types';
import { ICON_SHARED_PROPS } from './constants';

const DownloadIcon = () => (
    <svg {...ICON_SHARED_PROPS}>
        <rect x="5" y="5" width="38" height="38" fill={COLORS.PRIMARY} />
        <g fill={COLORS.BACKGROUND}>
            <rect x="10" y="18" width="28" height="20" />
            <rect x="14" y="36" width="20" height="8" />
            <circle cx="13" cy="11" r="3" />
        </g>
        <g fill={COLORS.PRIMARY}>
            <path d="m16 35h16l-8 8z" />
            <rect x="21" y="24" width="6" height="12" />
        </g>
    </svg>
);

export default memo(DownloadIcon);
