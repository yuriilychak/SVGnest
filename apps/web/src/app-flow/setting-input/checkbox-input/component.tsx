import { FC, memo, useCallback, useRef } from 'react';

import { InputProps } from '../types';
import { CheckIcon } from '../../../assets';
import './styles.scss';

const CheckboxInput: FC<InputProps> = ({ id, value, onChange, label }) => {
    const valueRef = useRef<boolean>(false);
    const handleClick = useCallback(() => onChange(!valueRef.current, id), [onChange, id]);

    valueRef.current = value as boolean;

    return (
        <div className="checboxRoot" onClick={handleClick} title={value.toString()}>
            <div className={value ? 'checkboxChecked' : 'checkboxUnchecked'}>
                <CheckIcon />
            </div>
            <span>{label}</span>
        </div>
    );
};

export default memo(CheckboxInput);
