import { FC } from 'react'
import { useTranslation } from 'react-i18next'

import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Alert from '@mui/material/Alert'

import { ButtonGroup, SharedDrawer } from '../shared'
import { DESKTOP_BUTTON_CONFIG, MESSAGE_ID_TO_ALERT_TYPE, SETTINGS_CONFIG, STYLES } from './constants'
import { AppFlowProps, BUTTON_ACTION, PREDEFINED_ID } from './types'
import { SettingInput } from './setting-input'
import { Statistics } from './statistics'
import useAppFlow from './hooks'

const AppFlow: FC<AppFlowProps> = ({ onClose, isDemoMode }) => {
    const {
        handleChangeSettings,
        handleClick,
        handleUploadSvg,
        zoomStyles,
        isDrawerOpen,
        isWorking,
        svgWrapper,
        fileLoader,
        settings,
        estimate,
        progress,
        nestingStatistics,
        iterations,
        disabledButtons,
        hiddenButtons,
        message,
        messageId
    } = useAppFlow(onClose, isDemoMode)

    const { t, i18n } = useTranslation()

    const messageKey: string = `appFlow.alert.${messageId}.message`

    return (
        <Stack sx={STYLES.root}>
            <Box component='a' id={PREDEFINED_ID.FILE_SAVER} sx={STYLES.fileLoader} />
            <Box
                component='input'
                type='file'
                accept='image/svg+xml'
                sx={STYLES.fileLoader}
                ref={fileLoader}
                onChange={handleUploadSvg}
            />
            <Box sx={STYLES.content}>
                <Box sx={STYLES.svgWrapper}>
                    <Box ref={svgWrapper} sx={zoomStyles} id={PREDEFINED_ID.SVG_WRAPPER} />
                </Box>
            </Box>
            <Alert sx={STYLES.alert} severity={MESSAGE_ID_TO_ALERT_TYPE.get(messageId)}>
                {i18n.exists(messageKey) ? t(messageKey) : message}
            </Alert>
            <Stack
                direction={{ xs: 'column', lg: 'row-reverse' }}
                gap={1}
                paddingTop={1}
                alignItems={{ xs: 'center', sm: 'start' }}
            >
                <Statistics
                    {...nestingStatistics}
                    isWorking={isWorking}
                    progress={progress}
                    estimate={estimate}
                    iterations={iterations}
                />
                <ButtonGroup
                    localePrefix='appFlow.buttons'
                    buttonsConfig={DESKTOP_BUTTON_CONFIG}
                    onClick={handleClick}
                    disabledButtons={disabledButtons}
                    hiddenButtons={hiddenButtons}
                />
            </Stack>
            <SharedDrawer
                onClose={handleClick}
                isOpen={isDrawerOpen}
                closeAction={BUTTON_ACTION.CLOSE_SETTINGS}
                title={t('appFlow.settingsDrawer.title')}
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
