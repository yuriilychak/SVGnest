import { FC, memo, useCallback, ChangeEvent } from 'react'

import TextField from '@mui/material/TextField'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import FormHelperText from '@mui/material/FormHelperText'
import FormGroup from '@mui/material/FormGroup'

import { INPUT_TYPE, SETTING_ID } from '../types'

interface SettingInputProps {
    label: string
    id: SETTING_ID
    type: INPUT_TYPE
    description: string
    value: number | boolean
    onChange(value: number | boolean, id: SETTING_ID): void
}

const SettingInput: FC<SettingInputProps> = ({ label, id, type, description, value, onChange }) => {
    const handleChange = useCallback(
        (event: ChangeEvent) => {
            const element: HTMLInputElement = event.target as HTMLInputElement
            const nextValue = type === INPUT_TYPE.BOOLEAN ? element.checked : parseFloat(element.value)
            onChange(nextValue, id)
        },
        [onChange, id, type]
    )

    return type === INPUT_TYPE.BOOLEAN ? (
        <FormGroup>
            <FormControlLabel
                control={<Checkbox checked={value as boolean} id={id} size='small' onChange={handleChange} />}
                label={label}
            />
            <FormHelperText sx={{ marginX: 0, lineHeight: 1, textAlign: 'justify' }}>{description}</FormHelperText>
        </FormGroup>
    ) : (
        <TextField
            onChange={handleChange}
            sx={{ marginTop: 2 }}
            value={value as number}
            helperText={description}
            id={id}
            label={label}
            size='small'
            type='number'
            FormHelperTextProps={{ sx: { marginX: 0, lineHeight: 1, textAlign: 'justify' } }}
        />
    )
}

export default memo(SettingInput)
