import { memo } from 'react';

const FlagIcon = () => (
    <svg width="48px" height="48px" viewBox="0 0 48 48">
        <g fill="#3bb34a">
            <rect x="11" y="7" width="22" height="22" />
            <rect x="8" y="4" width="4" height="40" />
            <rect x="29" y="11" width="12" height="22" />
        </g>
    </svg>
);

export default memo(FlagIcon);
