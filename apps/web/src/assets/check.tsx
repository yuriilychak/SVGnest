import { memo } from 'react';
import { COLORS } from './types';

const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16">
        <rect width="16" height="16" rx="4" fill={COLORS.PRIMARY} />
        <g transform="rotate(-45 6 11)" fill={COLORS.BACKGROUND}>
            <rect x="5" y="5" width="2" height="8" />
            <rect x="5" y="11" width="12" height="2" />
        </g>
    </svg>
);

export default memo(CheckIcon);
