import { FC, memo, useCallback, ChangeEvent, useMemo, ChangeEventHandler } from 'react'

import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import FormHelperText from '@mui/material/FormHelperText'
import FormGroup from '@mui/material/FormGroup'
import Slider from '@mui/material/Slider'

import { INPUT_TYPE } from '../types'
import { SettingInputProps } from './types'
import { TYPE_CONFIG } from './constants'

const SettingInput: FC<SettingInputProps> = ({ label, id, type, description, value, onChange, min, max, step }) => {
    const marks = useMemo(() => [min, max].map(item => ({ value: item, label: item.toString() })), [min, max])
    const { labelPlacement, styles } = useMemo(() => TYPE_CONFIG.get(type), [type])

    const handleChange = useCallback(
        (event: ChangeEvent<Element> | Event, sliderValue: number) => {
            const element: HTMLInputElement = event.target as HTMLInputElement
            const nextValue = type === INPUT_TYPE.BOOLEAN ? element.checked : sliderValue
            onChange(nextValue, id)
        },
        [onChange, id, type]
    )

    const control =
        type === INPUT_TYPE.BOOLEAN ? (
            <Checkbox checked={value as boolean} id={id} size='small' onChange={handleChange as ChangeEventHandler} />
        ) : (
            <Slider
                id={id}
                min={min}
                max={max}
                marks={marks}
                step={step}
                value={value as number}
                onChange={handleChange}
                sx={styles.input}
                valueLabelDisplay='auto'
            />
        )

    return (
        <FormGroup>
            <FormControlLabel sx={styles.root} labelPlacement={labelPlacement} control={control} label={label} />
            <FormHelperText sx={styles.helpText}>{description}</FormHelperText>
        </FormGroup>
    )
}

export default memo(SettingInput)
