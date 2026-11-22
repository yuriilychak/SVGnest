import { FC, useCallback, memo, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { ButtonGroupProps } from './types';
import { BUTTON_ACTION } from '../../types';
import { BUTTON_CONFIG } from './constants';
import { useResize } from '../hooks';
import './styles.scss';

const ButtonGroup: FC<ButtonGroupProps> = ({
    buttonsConfig,
    onClick,
    disabledButtons = [],
    hiddenButtons = [],
    localePrefix
}) => {
    const { t, i18n } = useTranslation();
    const { isMobile } = useResize();
    const handleClick = useCallback(
        (event: MouseEvent) => onClick((event.target as HTMLButtonElement).id as BUTTON_ACTION),
        []
    );

    let disabled: boolean = false;
    let labelKey: string = '';
    let label: string = '';
    let isShowLabel: boolean = false;
    let className: string = '';

    return (
        <div className="buttonGroup">
            {buttonsConfig.map(id => {
                if (hiddenButtons.includes(id)) {
                    return null;
                }

                labelKey = `${localePrefix}.${id}.label`;
                label = i18n.exists(labelKey) ? t(labelKey) : '';
                disabled = disabledButtons.includes(id);
                isShowLabel = !(isMobile || !label);
                className = isShowLabel ? 'button' : 'iconButton';
                const Icon = BUTTON_CONFIG.get(id);

                return (
                    <button key={id} id={id} className={className} disabled={disabled} onClick={handleClick} aria-label={id}>
                        <div className="buttonIcon">
                            <Icon />
                        </div>
                        {isShowLabel && <span>{label}</span>}
                    </button>
                );
            })}
        </div>
    );
};

export default memo(ButtonGroup);
