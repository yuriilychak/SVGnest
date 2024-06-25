import { SvgIconComponent } from '@mui/icons-material'

export interface ButtonConfig {
    id: string
    Icon: SvgIconComponent
}

export interface ButtonGroupProps {
    buttonsConfig: ButtonConfig[]
    disabledButtons?: string[]
    hiddenButtons?: string[]
    localePrefix: string
    onClick(id: string): void
}
