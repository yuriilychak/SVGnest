import { FC, useCallback, useEffect, useRef, ChangeEvent, useReducer, useMemo } from 'react'

import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'

import { ButtonGroup, SharedDrawer } from '../shared'
import { DESKTOP_BUTTON_CONFIG, SETTINGS_CONFIG, STYLES, INITIAL_STATE, FILE_SAVER_ID } from './constants'
import { AppFlowProps, BUTTON_ACTION, REDUCER_ACTION, SETTING_ID } from './types'
import { SettingInput } from './setting-input'
import reducer from './reducer'

const AppFlow: FC<AppFlowProps> = ({ onClose, isDemoMode }) => {
    const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
    const fileLoader = useRef<HTMLInputElement>(null)

    const { fileReader, isDrawerOpen, settings, svgSrc, scale } = state

    const handleDispatch = useCallback((type: REDUCER_ACTION, payload?: unknown) => dispatch({ type, payload }), [dispatch])

    const handleLoadFile = useCallback(
        (event: ProgressEvent<FileReader>) => handleDispatch(REDUCER_ACTION.UPDATE_SVG, event.target.result),
        [handleDispatch]
    )

    useEffect(() => {
        handleDispatch(REDUCER_ACTION.INIT)
    }, [handleDispatch])

    useEffect(() => {
        if (fileReader !== null) {
            fileReader.onload = handleLoadFile
        }
    }, [fileReader, handleLoadFile])

    useEffect(() => {
        if (isDemoMode) {
            fetch('assets/demo.svg')
                .then(response => response.text())
                .then(svgText => handleDispatch(REDUCER_ACTION.UPDATE_SVG, svgText))
        }
    }, [isDemoMode, handleDispatch])

    const handleClick = useCallback(
        (action: string) => {
            switch (action) {
                case BUTTON_ACTION.BACK:
                    return onClose()
                case BUTTON_ACTION.UPLOAD:
                    return fileLoader.current.click()
                case BUTTON_ACTION.DOWNLOAD:
                    return handleDispatch(REDUCER_ACTION.DOWNLOAD_SVG)
                case BUTTON_ACTION.SETTINGS:
                case BUTTON_ACTION.CLOSE_SETTINGS:
                    return handleDispatch(REDUCER_ACTION.TOGGLE_DRAWER, action === BUTTON_ACTION.SETTINGS)
                case BUTTON_ACTION.ZOOM_IN:
                    return handleDispatch(REDUCER_ACTION.ZOOM_IN)
                case BUTTON_ACTION.ZOOM_OUT:
                    return handleDispatch(REDUCER_ACTION.ZOOM_OUT)
                default:
            }
        },
        [onClose, handleDispatch]
    )

    const handleChangeSettings = useCallback(
        (value: boolean | number, id: SETTING_ID) => handleDispatch(REDUCER_ACTION.CHANGE_SETTINGS, { value, id }),
        [handleDispatch]
    )

    const handleUploadSvg = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const file: File = event.target.files[0]

            fileReader.readAsText(file)
        },
        [fileReader]
    )

    const zoomStyles = useMemo(
        () => ({
            width: `${Math.floor(scale * 100)}%`,
            '& svg': { width: '100%', height: 'auto' }
        }),
        [scale]
    )

    return (
        <Stack sx={STYLES.root}>
            <Box sx={STYLES.content}>
                <Box sx={STYLES.svgWrapper}>
                    <Box dangerouslySetInnerHTML={{ __html: svgSrc }} sx={zoomStyles} />
                </Box>
            </Box>
            <Box
                component='input'
                type='file'
                accept='image/svg+xml'
                sx={STYLES.fileLoader}
                ref={fileLoader}
                onChange={handleUploadSvg}
            />
            <Box component='a' id={FILE_SAVER_ID} sx={STYLES.fileLoader} />
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
