import { useCallback, useState, useLayoutEffect, useMemo, memo } from 'react'

import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Drawer from '@mui/material/Drawer'

import { HelpItem } from './help-item'
import { Logo } from './logo'
import { ButtonGroup } from '../shared'
import { BUTTON_CONFIG, HELP_CONTENT_CONFIG } from './constants'
import { BUTTON_ACTIONS } from './types'

const SplashScreen = ({ onOpenApp }: { onOpenApp: (isLoadFile: boolean) => void }) => {
    const [isDrawerOpen, setDrawerOpen] = useState(false)
    const [isDrawerHorizontal, setDrawerHorizontal] = useState(true)
    const handleCloseDrawer = useCallback(() => setDrawerOpen(false), [])
    const handleResize = useCallback(() => setDrawerHorizontal(window.innerWidth > window.innerHeight), [])
    const helpContent = useMemo(
        () => HELP_CONTENT_CONFIG.map((config, index) => <HelpItem {...config} key={`help${index}`} />),
        []
    )

    const handleAction = useCallback(
        (action: string) => {
            switch (action) {
                case BUTTON_ACTIONS.DEMO:
                case BUTTON_ACTIONS.START:
                    onOpenApp(action === BUTTON_ACTIONS.START)
                    break
                case BUTTON_ACTIONS.GITHUB:
                    window.open('https://github.com/Jack000/SVGnest', '_blank')
                    break
                default:
                    setDrawerOpen(true)
            }
        },
        [onOpenApp]
    )

    useLayoutEffect(() => {
        window.addEventListener('resize', handleResize)
        handleResize()

        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <Stack
            sx={{ width: '100vw', height: '100vh', alignItems: 'center', justifyContent: 'center' }}
            gap={{ xs: 0.5, sm: 1 }}
            paddingX={{ xs: 1, sm: 2 }}
            boxSizing='border-box'
        >
            <Logo />
            <Typography sx={{ typography: { md: 'h4', xs: 'h5' } }}>SVGnest</Typography>
            <Typography sx={{ typography: { md: 'h5', xs: 'body1' } }}>Open Source nesting</Typography>
            <ButtonGroup buttonsConfig={BUTTON_CONFIG} onClick={handleAction} />
            <Drawer open={isDrawerOpen} onClose={handleCloseDrawer} anchor={isDrawerHorizontal ? 'right' : 'bottom'}>
                <Stack
                    boxSizing='border-box'
                    width={isDrawerHorizontal ? '50vw' : '100vw'}
                    height={isDrawerHorizontal ? '100vh' : '50vh'}
                    gap={2}
                    paddingY={2}
                    paddingX={3}
                >
                    {helpContent}
                </Stack>
            </Drawer>
        </Stack>
    )
}

export default memo(SplashScreen)
