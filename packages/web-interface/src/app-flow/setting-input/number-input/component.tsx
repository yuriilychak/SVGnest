import { FC, memo, useCallback, useMemo } from 'react'

import Slider from '@mui/material/Slider'

import { InputProps } from '../types'
import { STYLES } from './constant'

const NumberInput: FC<InputProps> = ({ id, value, onChange, min, max, step }) => {
    const marks = useMemo(() => [min, max].map(item => ({ value: item, label: item.toString() })), [min, max])

    const handleChange = useCallback((event: Event, sliderValue: number) => onChange(sliderValue, id), [onChange, id])

    return (
        <Slider
            id={id}
            min={min}
            max={max}
            marks={marks}
            step={step}
            value={value as number}
            onChange={handleChange}
            sx={STYLES.root}
            valueLabelDisplay='auto'
        />
    )
}

export default memo(NumberInput)
