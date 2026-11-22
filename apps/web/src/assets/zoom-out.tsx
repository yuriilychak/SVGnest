import { memo } from 'react';

import { COLORS } from './types';
import { ICON_SHARED_PROPS } from './constants';

const ZoomOutIcon = () => (
    <svg {...ICON_SHARED_PROPS}>
        <g fill={COLORS.PRIMARY}>
            <path transform="rotate(-45 20 19)" d="m22 35-1-1v-15h-2v15l-1 1 2e-6 14 4-2e-6z" />
            <circle cx="20" cy="20" r="13" />
        </g>
        <circle cx="20" cy="20" r="9" fill={COLORS.BACKGROUND} />
        <rect x="15" y="19" width="10" height="2" fill={COLORS.PRIMARY} />
    </svg>
);

export default memo(ZoomOutIcon);
