import { FC, memo, useMemo } from 'react'

import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import FormGroup from '@mui/material/FormGroup'

import { INPUT_TYPE } from '../types'
import { InputProps, SettingInputProps } from './types'
import { TYPE_CONFIG } from './constants'
import { CheckboxInput } from './checkbox-input'
import { NumberInput } from './number-input'

const TYPE_TO_COMPONENT = new Map<INPUT_TYPE, FC<InputProps>>([
    [INPUT_TYPE.BOOLEAN, CheckboxInput],
    [INPUT_TYPE.NUMBER, NumberInput]
])

const SettingInput: FC<SettingInputProps> = ({ label, id, type, description, value, onChange, min, max, step }) => {
    const { labelPlacement, styles, Component } = useMemo(
        () => ({ ...TYPE_CONFIG.get(type), Component: TYPE_TO_COMPONENT.get(type) }),
        [type]
    )

    return (
        <FormGroup>
            <FormControlLabel
                sx={styles.root}
                labelPlacement={labelPlacement}
                control={<Component id={id} min={min} max={max} step={step} value={value} onChange={onChange} />}
                label={label}
            />
            <FormHelperText sx={styles.helpText}>{description}</FormHelperText>
        </FormGroup>
    )
}

export default memo(SettingInput)
