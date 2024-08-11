import { INPUT_TYPE, SETTING_ID } from '../types';

type InputValue = number | boolean;

export interface InputProps {
    label?: string;
    onChange(nextValue: InputValue, id: SETTING_ID): void;
    value: InputValue;
    min: number;
    max: number;
    step: number;
    id: SETTING_ID;
}

export interface SettingInputProps extends InputProps {
    type: INPUT_TYPE;
}
