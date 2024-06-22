import { SvgIconComponent } from '@mui/icons-material'

export interface ButtonConfig {
    id: string
    label: string
    Icon: SvgIconComponent
}

export interface ButtonGroupProps {
    buttonsConfig: ButtonConfig[]
    disabledButtons?: string[]
    hiddenButtons?: string[]
    onClick(id: string): void
}
