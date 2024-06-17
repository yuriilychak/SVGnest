import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'

import { ButtonGroup } from '../shared'
import { DESKTOP_BUTTON_CONFIG } from './constants'
import { FC, useCallback } from 'react'
import { AppFlowProps, BUTTON_ACTIONS } from './types'

const AppFlow: FC<AppFlowProps> = ({ onClose }) => {
    const handleClick = useCallback(
        (action: string) => {
            if (action === BUTTON_ACTIONS.BACK) {
                onClose()
            }
        },
        [onClose]
    )

    return (
        <Stack
            width='100vw'
            height='100vh'
            padding={2}
            boxSizing='border-box'
            gap={1}
            sx={{ alignItems: { xs: 'center', sm: 'start' } }}
        >
            <Box flex={1} boxSizing='border-box'>
                Content
            </Box>
            <ButtonGroup buttonsConfig={DESKTOP_BUTTON_CONFIG} onClick={handleClick} />
        </Stack>
    )
}

export default AppFlow
