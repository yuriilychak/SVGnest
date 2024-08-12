import { memo } from 'react';

const CodeIcon = () => (
    <svg width="48" height="48" viewBox="0 0 48 48">
        <g transform="rotate(-45 -4 -58)">
            <rect x="-59" y="3" width="34" height="34" fill="#3bb34a" />
            <g fill="#fff">
                <rect x="-54" y="8" width="24" height="24" />
                <rect x="-59" y="23" width="14" height="14" />
                <rect x="-39" y="3" width="14" height="14" />
            </g>
        </g>
        <g fill="#3bb34a">
            <circle cx="24" cy="24" r="3" />
            <circle cx="16" cy="24" r="3" />
            <circle cx="32" cy="24" r="3" />
        </g>
    </svg>
);

export default memo(CodeIcon);
