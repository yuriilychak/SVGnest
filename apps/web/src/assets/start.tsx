import { memo } from 'react';

import { COLORS } from './types';
import { ICON_SHARED_PROPS } from './constants';

const StartIcon = () => (
    <svg {...ICON_SHARED_PROPS}>
        <path d="m11 41v-34l32 17z" fill={COLORS.PRIMARY} />
    </svg>
);

export default memo(StartIcon);
