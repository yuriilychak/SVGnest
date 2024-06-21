import { FC, useCallback, useEffect, useRef, ChangeEvent, useReducer, useMemo } from 'react'

import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'

import { ButtonGroup, SharedDrawer } from '../shared'
import { DESKTOP_BUTTON_CONFIG, SETTINGS_CONFIG, STYLES } from './constants'
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
        iterations
    } = useAppFlow(onClose, isDemoMode)

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
                    <Box ref={svgWrapper} sx={zoomStyles} />
                </Box>
            </Box>
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
                <ButtonGroup buttonsConfig={DESKTOP_BUTTON_CONFIG} onClick={handleClick} />
            </Stack>
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
