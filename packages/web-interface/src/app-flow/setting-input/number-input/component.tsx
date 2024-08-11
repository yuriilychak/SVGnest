import { ChangeEventHandler, FC, memo, useCallback } from 'react';

import { InputProps } from '../types';
import './styles.scss';

const NumberInput: FC<InputProps> = ({ id, value, onChange, min, max, step, label }) => {
    const handleChange: ChangeEventHandler<HTMLInputElement> = useCallback(
        event => onChange(parseFloat(event.target.value), id),
        [onChange, id]
    );

    return (
        <div className="sliderRoot">
            <p className="sliderLabel">{label}</p>
            <input
                className="sliderInput"
                type="range"
                min={min}
                max={max}
                step={step}
                value={value.toString()}
                onChange={handleChange}
            />
            <div className="sliderFooter">
                <span>{min}</span>
                <div className="sliderDivider" />
                <span>{max}</span>
            </div>
        </div>
    );
};

export default memo(NumberInput);
