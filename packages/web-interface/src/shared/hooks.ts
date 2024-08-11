import { useCallback, useLayoutEffect, useState } from 'react';

export function useResize() {
    const handleResizeState = useCallback(
        () => ({ isMobile: window.innerWidth < 600, isLendscape: window.innerWidth > window.innerHeight }),
        []
    );

    const [resizeState, setResizeState] = useState(handleResizeState());

    const handleResize = useCallback(() => setResizeState(handleResizeState()), [handleResizeState]);

    useLayoutEffect(() => {
        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, [handleResize]);

    return resizeState;
}
