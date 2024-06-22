import { FC, useCallback, memo, MouseEvent } from 'react'

import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import useMediaQuery from '@mui/material/useMediaQuery'
import useTheme from '@mui/material/styles/useTheme'

import { ButtonGroupProps } from './types'

const ButtonGroup: FC<ButtonGroupProps> = ({ buttonsConfig, onClick, disabledButtons = [], hiddenButtons = [] }) => {
    const handleClick = useCallback((event: MouseEvent) => onClick((event.target as HTMLButtonElement).id), [])
    const theme = useTheme()
    const isMobile: boolean = !useMediaQuery(theme.breakpoints.up('sm'))
    let disabled: boolean = false

    return (
        <Stack direction='row' gap={{ xs: 1, sm: 2 }}>
            {buttonsConfig.map(({ id, label, Icon }) => {
                if (hiddenButtons.includes(id)) {
                    return null
                }

                disabled = disabledButtons.includes(id)

                return !isMobile && label ? (
                    <Button
                        key={id}
                        id={id}
                        disabled={disabled}
                        variant='outlined'
                        startIcon={<Icon id={id} sx={{ pointerEvents: 'none' }} />}
                        onClick={handleClick}
                    >
                        {label}
                    </Button>
                ) : (
                    <IconButton disabled={disabled} key={id} id={id} onClick={handleClick}>
                        <Icon id={id} fontSize='small' sx={{ pointerEvents: 'none' }} />
                    </IconButton>
                )
            })}
        </Stack>
    )
}

export default memo(ButtonGroup)
