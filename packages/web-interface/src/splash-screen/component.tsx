import { useCallback, useState, useMemo, memo } from 'react'
import { useTranslation } from 'react-i18next'

import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { HelpItem } from './help-item'
import { Logo } from './logo'
import { ButtonGroup, SharedDrawer } from '../shared'
import { BUTTON_CONFIG, HELP_CONTENT_CONFIG, STYLES } from './constants'
import { BUTTON_ACTIONS } from './types'

const SplashScreen = ({ onOpenApp }: { onOpenApp: (isLoadFile: boolean) => void }) => {
    const { t } = useTranslation()
    const [isDrawerOpen, setDrawerOpen] = useState(false)
    const helpContent = useMemo(() => HELP_CONTENT_CONFIG.map(config => <HelpItem {...config} key={config.id} />), [])

    const handleAction = useCallback(
        (action: string) => {
            switch (action) {
                case BUTTON_ACTIONS.DEMO:
                case BUTTON_ACTIONS.START:
                    onOpenApp(action === BUTTON_ACTIONS.DEMO)
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
            <Typography sx={STYLES.title}>{t('splashScreen.title')}</Typography>
            <Typography sx={STYLES.subtitle}>{t('splashScreen.subtitle')}</Typography>
            <ButtonGroup buttonsConfig={BUTTON_CONFIG} onClick={handleAction} localePrefix='splashScreen.buttons' />
            <SharedDrawer
                isOpen={isDrawerOpen}
                onClose={handleAction}
                closeAction={BUTTON_ACTIONS.CLOSE_FAQ}
                title={t('splashScreen.helpDrawer.title')}
            >
                {helpContent}
            </SharedDrawer>
        </Stack>
    )
}

export default memo(SplashScreen)
