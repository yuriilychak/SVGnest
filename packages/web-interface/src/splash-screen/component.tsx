import { useCallback, useState, useLayoutEffect, useMemo, memo } from 'react'

import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { HelpItem } from './help-item'
import { Logo } from './logo'
import { ButtonGroup, SharedDrawer } from '../shared'
import { BUTTON_CONFIG, HELP_CONTENT_CONFIG, STYLES } from './constants'
import { BUTTON_ACTIONS } from './types'

const SplashScreen = ({ onOpenApp }: { onOpenApp: (isLoadFile: boolean) => void }) => {
    const [isDrawerOpen, setDrawerOpen] = useState(false)
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
                    setDrawerOpen(action === BUTTON_ACTIONS.OPEN_FAQ)
            }
        },
        [onOpenApp]
    )

    return (
        <Stack sx={STYLES.root}>
            <Logo />
            <Typography sx={STYLES.title}>SVGnest</Typography>
            <Typography sx={STYLES.subtitle}>Open Source nesting</Typography>
            <ButtonGroup buttonsConfig={BUTTON_CONFIG} onClick={handleAction} />
            <SharedDrawer isOpen={isDrawerOpen} onClose={handleAction} closeAction={BUTTON_ACTIONS.CLOSE_FAQ}>
                {helpContent}
            </SharedDrawer>
        </Stack>
    )
}

export default memo(SplashScreen)
