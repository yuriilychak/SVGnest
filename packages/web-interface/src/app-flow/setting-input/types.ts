import { INPUT_TYPE, SETTING_ID } from '../types'

export interface TypeConfig {
    labelPlacement: 'end' | 'top'
    styles: {
        root: object
        helpText: object
        input: object
    }
}

export interface SettingInputProps {
    label: string
    id: SETTING_ID
    type: INPUT_TYPE
    description: string
    value: number | boolean
    min: number
    max: number
    step: number
    onChange(value: number | boolean, id: SETTING_ID): void
}
