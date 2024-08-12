import { memo } from 'react';

const BackIcon = () => (
    <svg width="48px" height="48px" viewBox="0 0 48 48">
        <g fill="#3bb34a">
            <path d="m22 39v-30l-20 15z" />
            <rect x="20" y="16" width="24" height="16" />
        </g>
    </svg>
);

export default memo(BackIcon);
