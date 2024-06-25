import { INPUT_TYPE, SETTING_ID } from '../types'

export interface TypeConfig {
    labelPlacement: 'end' | 'top'
    styles: {
        root: object
        helpText: object
    }
}

type InputValue = number | boolean

export interface InputProps {
    onChange(nextValue: InputValue, id: SETTING_ID): void
    value: InputValue
    min: number
    max: number
    step: number
    id: SETTING_ID
}

export interface SettingInputProps extends InputProps {
    type: INPUT_TYPE
}
