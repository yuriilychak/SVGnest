import { useCallback, useLayoutEffect, useState, ReactNode, FC, memo } from 'react';

import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';

import { STYLES } from './constants';
import Typography from '@mui/material/Typography';

interface SharedDrawerProps {
    isOpen: boolean;
    onClose(action: string): void;
    closeAction: string;
    title: string;
    children: ReactNode[];
}

const SharedDrawer: FC<SharedDrawerProps> = ({ isOpen, onClose, closeAction, children, title }) => {
    const [isDrawerHorizontal, setDrawerHorizontal] = useState(true);
    const handleCloseDrawer = useCallback(() => onClose(closeAction), [onClose, closeAction]);
    const handleResize = useCallback(() => setDrawerHorizontal(window.innerWidth > window.innerHeight), []);

    useLayoutEffect(() => {
        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <Drawer open={isOpen} onClose={handleCloseDrawer} anchor={isDrawerHorizontal ? 'right' : 'bottom'}>
            <Stack gap={2} sx={isDrawerHorizontal ? STYLES.drawerHorizontal : STYLES.drawerVertical}>
                <Typography variant="h6">{title}</Typography>
                {children}
            </Stack>
        </Drawer>
    );
};

export default memo(SharedDrawer);
