import { memo } from 'react';

const ZoomOutIcon = () => (
    <svg width="48" height="48" viewBox="0 0 48 48">
        <g fill="#3bb34a">
            <path transform="rotate(-45 20 19)" d="m22 35-1-1v-15h-2v15l-1 1 2e-6 14 4-2e-6z" />
            <circle cx="20" cy="20" r="13" />
        </g>
        <circle cx="20" cy="20" r="9" fill="#fff" />
        <rect x="15" y="19" width="10" height="2" fill="#3bb34a" />
    </svg>
);

export default memo(ZoomOutIcon);
