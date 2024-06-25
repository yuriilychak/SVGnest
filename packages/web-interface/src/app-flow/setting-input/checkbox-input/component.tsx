import { FC, memo, useCallback, ChangeEventHandler } from 'react'

import Checkbox from '@mui/material/Checkbox'

import { InputProps } from '../types'

const CheckboxInput: FC<InputProps> = ({ id, value, onChange }) => {
    const handleChange: ChangeEventHandler<HTMLInputElement> = useCallback(
        event => onChange(event.target.checked, id),
        [onChange, id]
    )

    return <Checkbox checked={value as boolean} id={id} size='small' onChange={handleChange} />
}

export default memo(CheckboxInput)
