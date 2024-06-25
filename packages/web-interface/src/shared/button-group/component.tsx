import { FC, useCallback, memo, MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import useMediaQuery from '@mui/material/useMediaQuery'
import useTheme from '@mui/material/styles/useTheme'

import { ButtonGroupProps } from './types'

const ButtonGroup: FC<ButtonGroupProps> = ({
    buttonsConfig,
    onClick,
    disabledButtons = [],
    hiddenButtons = [],
    localePrefix
}) => {
    const handleClick = useCallback((event: MouseEvent) => onClick((event.target as HTMLButtonElement).id), [])
    const theme = useTheme()
    const isMobile: boolean = !useMediaQuery(theme.breakpoints.up('sm'))
    const { t, i18n } = useTranslation()
    let disabled: boolean = false
    let labelKey: string = ''
    let label: string = ''

    return (
        <Stack direction='row' gap={{ xs: 1, sm: 2 }}>
            {buttonsConfig.map(({ id, Icon }) => {
                if (hiddenButtons.includes(id)) {
                    return null
                }

                labelKey = `${localePrefix}.${id}.label`
                label = i18n.exists(labelKey) ? t(labelKey) : ''
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
