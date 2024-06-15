import { useCallback, useState } from 'react';

import ThemeProvider from '@mui/material/styles/ThemeProvider';
import GlobalStyles from '@mui/material/GlobalStyles';
import Grow from '@mui/material/Grow';
import Box from '@mui/material/Box';

import { SplashScreen } from './splash-screen';
import { AppFlow } from './app-flow';
import THEME from './theme';

const App = () => {
    const [isApp, setApp] = useState(false);
    const [isLoadFile, setLoadFile] = useState(false);

    const handleOpenApp = useCallback((nextLoadFile: boolean) => {
        setLoadFile(nextLoadFile);
        setApp(true);
    }, []);

    const handleOpenSplashScreen = useCallback(() => {
        setLoadFile(false);
        setApp(false);
    }, []);

    return (
        <ThemeProvider theme={THEME}>
            <GlobalStyles
                styles={{
                    body: {
                        scrollbarColor: '#3bb34a #ffffff',
                        scrollbarWidth: 'thin'
                    }
                }}
            />
            <Box>
                <Grow in={isApp} unmountOnExit>
                    <Box width="100vw" height="100vh" position="absolute">
                        <AppFlow onClose={handleOpenSplashScreen} />
                    </Box>
                </Grow>
                <Grow in={!isApp} unmountOnExit>
                    <Box width="100vw" height="100vh" position="absolute">
                        <SplashScreen onOpenApp={handleOpenApp} />
                    </Box>
                </Grow>
            </Box>
        </ThemeProvider>
    );
};

export default App;
