import { useCallback, useState } from 'react'

import ThemeProvider from '@mui/material/styles/ThemeProvider'
import GlobalStyles from '@mui/material/GlobalStyles'
import Grow from '@mui/material/Grow'
import Box from '@mui/material/Box'

import { SplashScreen } from './splash-screen'
import { AppFlow } from './app-flow'
import THEME from './theme'
import { GLOBAL_STYLES } from './constants'

const App = () => {
    const [isApp, setApp] = useState(false)
    const [isDemoMode, setDemoMode] = useState(false)

    const handleUpdateScreen = useCallback((nextDemoMode: boolean = false, nextApp: boolean = false) => {
        setDemoMode(nextDemoMode)
        setApp(nextApp)
    }, [])

    const handleOpenApp = useCallback((nextDemoMode: boolean) => handleUpdateScreen(nextDemoMode, true), [])

    return (
        <ThemeProvider theme={THEME}>
            <GlobalStyles styles={GLOBAL_STYLES} />
            <Box>
                <Grow in={isApp} unmountOnExit>
                    <Box width='100vw' height='100vh' position='absolute'>
                        <AppFlow onClose={handleUpdateScreen} isDemoMode={isDemoMode} />
                    </Box>
                </Grow>
                <Grow in={!isApp} unmountOnExit>
                    <Box width='100vw' height='100vh' position='absolute'>
                        <SplashScreen onOpenApp={handleOpenApp} />
                    </Box>
                </Grow>
            </Box>
        </ThemeProvider>
    )
}

export default App
