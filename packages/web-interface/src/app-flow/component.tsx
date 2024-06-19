import { FC, useCallback, useState } from 'react'

import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'

import { ButtonGroup, SharedDrawer } from '../shared'
import { DEFAULT_SETTING, DESKTOP_BUTTON_CONFIG, SETTINGS_CONFIG, STYLES } from './constants'
import { AppFlowProps, BUTTON_ACTION, SETTING_ID, SettingsData } from './types'
import { SettingInput } from './setting-input'

const AppFlow: FC<AppFlowProps> = ({ onClose }) => {
    const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTING)
    const [isDrawerOpen, setDrawerOpen] = useState<boolean>(false)
    const handleClick = useCallback(
        (action: string) => {
            switch (action) {
                case BUTTON_ACTION.BACK:
                    onClose()
                    break
                case BUTTON_ACTION.SETTINGS:
                case BUTTON_ACTION.CLOSE_SETTINGS:
                    setDrawerOpen(action === BUTTON_ACTION.SETTINGS)
                    break
                default:
            }
        },
        [onClose]
    )

    const handleChangeSettings = useCallback(
        (value: boolean | number, id: SETTING_ID) =>
            setSettings(prevSettings => ({
                ...prevSettings,
                [id]: value
            })),
        []
    )

    return (
        <Stack sx={STYLES.root}>
            <Box sx={STYLES.content}>Content</Box>
            <ButtonGroup buttonsConfig={DESKTOP_BUTTON_CONFIG} onClick={handleClick} />
            <SharedDrawer
                onClose={handleClick}
                isOpen={isDrawerOpen}
                closeAction={BUTTON_ACTION.CLOSE_SETTINGS}
                title='Nesting settings'
            >
                {SETTINGS_CONFIG.map(config => (
                    <SettingInput {...config} value={settings[config.id]} key={config.id} onChange={handleChangeSettings} />
                ))}
                <Box minHeight={16} />
            </SharedDrawer>
        </Stack>
    )
}

export default AppFlow
