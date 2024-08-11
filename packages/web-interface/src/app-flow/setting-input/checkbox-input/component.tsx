import { FC, memo, useCallback, ChangeEventHandler } from 'react';

import { InputProps } from '../types';
import './styles.scss';

const CheckboxInput: FC<InputProps> = ({ id, value, onChange, label }) => {
    const handleChange: ChangeEventHandler<HTMLInputElement> = useCallback(
        event => onChange(event.target.checked, id),
        [onChange, id]
    );

    return (
        <label className="control controlCheckbox">
            <span>{label}</span>
            <input type="checkbox" value={value.toString()} onChange={handleChange} />
            <div className="controlIndicator"></div>
        </label>
    );
};

export default memo(CheckboxInput);
