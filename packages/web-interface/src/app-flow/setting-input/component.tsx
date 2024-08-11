import { FC, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { INPUT_TYPE } from '../types';
import { InputProps, SettingInputProps } from './types';
import { CheckboxInput } from './checkbox-input';
import { NumberInput } from './number-input';
import './styles.scss';

const TYPE_TO_COMPONENT = new Map<INPUT_TYPE, FC<InputProps>>([
    [INPUT_TYPE.BOOLEAN, CheckboxInput],
    [INPUT_TYPE.NUMBER, NumberInput]
]);

const SettingInput: FC<SettingInputProps> = ({ id, type, value, onChange, min, max, step }) => {
    const Component = useMemo(() => TYPE_TO_COMPONENT.get(type), [type]);
    const { t } = useTranslation();

    return (
        <div className="settingRoot">
            <Component
                id={id}
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={onChange}
                label={t(`appFlow.settingsDrawer.item.${id}.title`)}
            />
            <span className="settingHelpText">{t(`appFlow.settingsDrawer.item.${id}.description`)}</span>
        </div>
    );
};

export default memo(SettingInput);
